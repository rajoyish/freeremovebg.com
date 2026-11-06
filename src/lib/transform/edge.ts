// Primary engine: upload the image to a short-lived R2 object, then let
// Cloudflare Image Transformations encode it at the edge.
//
//   POST /api/upload-temp            -> { key, url }   (worker/upload.js)
//   GET  /cdn-cgi/image/<opts>/<url> -> transformed image
//   DELETE /api/upload-temp?key=...  -> drop the object once we have the result
//
// Every failure here is an EdgeError. `systemic` means the edge cannot serve
// anything right now (free-tier limit, network down, R2 not configured), so the
// caller should stop trying it for the rest of the batch. A non-systemic error
// concerns only this image (an input format the edge rejects, say).

import { FORMATS, type OutputFormat } from './formats';

export class EdgeError extends Error {
  constructor(message: string, readonly systemic: boolean, readonly code?: string) {
    super(message);
    this.name = 'EdgeError';
  }
}

export interface EdgeOptions {
  format: OutputFormat;
  /** 0-100. Ignored by the edge for PNG, which never reaches it anyway. */
  quality: number;
}

type FetchFn = typeof fetch;

const UPLOAD_ENDPOINT = '/api/upload-temp';
const STATUS_ENDPOINT = '/api/edge-status';

/** The free plan's "unique transformations per month exceeded" code. */
export const LIMIT_REACHED = '9422';

/**
 * Codes that mean the edge as a whole is unusable, not just this image:
 * 9422 limit reached, 9403 request loop, 9524 intercepted by a Worker.
 */
const SYSTEMIC_CODES = new Set([LIMIT_REACHED, '9403', '9524']);

export function buildTransformUrl(sourceUrl: string, { format, quality }: EdgeOptions): string {
  const q = Math.min(100, Math.max(1, Math.round(quality)));
  const opts = [`format=${format}`, `quality=${q}`, 'metadata=none'];
  // JPEG has no alpha channel; be explicit about what fills transparent pixels
  // so the edge and the local engine agree.
  if (format === 'jpeg') opts.push('background=%23FFFFFF');
  return `/cdn-cgi/image/${opts.join(',')}/${sourceUrl}`;
}

/** The 9xxx code from a `Cf-Resized: err=9422` header, if any. */
export function resizeErrorCode(headers: Headers): string | null {
  const value = headers.get('cf-resized') || '';
  return value.match(/err=(\d+)/)?.[1] ?? null;
}

export async function uploadTemp(file: Blob, name: string, fetchFn: FetchFn = fetch) {
  const body = new FormData();
  body.append('file', file, name);
  let res: Response;
  try {
    res = await fetchFn(UPLOAD_ENDPOINT, { method: 'POST', body });
  } catch {
    throw new EdgeError('Upload failed: network error', true);
  }
  if (!res.ok) {
    // 413/415 reject this file; anything else (403, 404 in dev, 503 when R2
    // is not configured) means uploads are unavailable.
    const systemic = res.status !== 413 && res.status !== 415;
    throw new EdgeError(`Upload failed: HTTP ${res.status}`, systemic);
  }
  const data = (await res.json().catch(() => null)) as { key?: string; url?: string } | null;
  if (!data?.key || !data?.url) throw new EdgeError('Upload failed: bad response', true);
  return { key: data.key, url: data.url };
}

export interface EdgeStatus {
  available: boolean;
  /** When the monthly budget reopens (ISO), if it is closed. */
  resumeAt: string | null;
}

/**
 * Whether the edge is open this month (worker/edgeBudget.js). Anything other
 * than a clear yes, including a 404 in `astro dev` or a network error, counts
 * as no: on-device encoding needs nothing from the network.
 */
export async function fetchEdgeStatus(fetchFn: FetchFn = fetch): Promise<EdgeStatus> {
  try {
    const res = await fetchFn(STATUS_ENDPOINT, { cache: 'no-store' });
    if (!res.ok) return { available: false, resumeAt: null };
    const data = (await res.json()) as Partial<EdgeStatus>;
    return { available: data.available === true, resumeAt: data.resumeAt ?? null };
  } catch {
    return { available: false, resumeAt: null };
  }
}

/**
 * Tell the worker the edge answered 9422, which closes the month for every
 * visitor. Must run before the temp object is deleted: the worker only
 * accepts a report for an upload that still exists.
 */
async function reportLimit(key: string, fetchFn: FetchFn): Promise<void> {
  try {
    await fetchFn(STATUS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: LIMIT_REACHED, key }),
    });
  } catch {}
}

/** Best-effort cleanup. The bucket's lifecycle rule catches anything missed. */
export function deleteTemp(key: string, fetchFn: FetchFn = fetch): void {
  fetchFn(`${UPLOAD_ENDPOINT}?key=${encodeURIComponent(key)}`, {
    method: 'DELETE',
    keepalive: true,
  }).catch(() => {});
}

export async function transformAtEdge(
  file: File,
  opts: EdgeOptions,
  fetchFn: FetchFn = fetch,
): Promise<Blob> {
  const { key, url } = await uploadTemp(file, file.name, fetchFn);
  try {
    const expected = FORMATS[opts.format].mime;
    let res: Response;
    try {
      // The edge negotiates on Accept: fetch() sends */* by default, and
      // with that the edge answers format=webp and format=avif with JPEG.
      // Verified against production on 2026-11-06.
      res = await fetchFn(buildTransformUrl(url, opts), {
        cache: 'no-store',
        headers: { Accept: `${expected},image/*;q=0.8` },
      });
    } catch {
      throw new EdgeError('Transformation failed: network error', true);
    }

    const code = resizeErrorCode(res.headers);
    if (code === LIMIT_REACHED) await reportLimit(key, fetchFn);
    if (code) throw new EdgeError(`Edge error ${code}`, SYSTEMIC_CODES.has(code), code);

    if (!res.ok) {
      // No Cf-Resized header means the edge never tried, which is what a
      // missing /cdn-cgi/image/ (local dev, transformations disabled) looks
      // like. Some error pages carry the code only in the body.
      const text = await res.text().catch(() => '');
      const bodyCode = text.match(/\b(9\d{3})\b/)?.[1];
      if (bodyCode === LIMIT_REACHED) await reportLimit(key, fetchFn);
      throw new EdgeError(
        `Transformation failed: HTTP ${res.status}`,
        bodyCode ? SYSTEMIC_CODES.has(bodyCode) : true,
        bodyCode,
      );
    }

    const blob = await res.blob();
    // The edge may silently substitute a format (it falls back from AVIF to
    // WebP when encoding is too slow). The user asked for a specific format,
    // so a substitute counts as a failure for this image.
    const type = (res.headers.get('content-type') || blob.type).split(';')[0].trim();
    if (type !== expected) {
      throw new EdgeError(`Edge returned ${type || 'unknown type'} instead of ${expected}`, false);
    }
    return blob.type === expected ? blob : new Blob([blob], { type: expected });
  } finally {
    deleteTemp(key, fetchFn);
  }
}
