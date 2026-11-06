// Routes each image to the edge engine first and the local engine on failure.
//
// A systemic edge failure (free-tier limit 9422, network error, uploads not
// configured) switches the edge off for every image after it, including the
// rest of a running batch, and the choice is remembered for a while so the
// next batch does not pay for a failing upload per image. Failures are never
// shown to the visitor: they just get the result from the local engine.

import { EdgeError, fetchEdgeStatus, transformAtEdge, type EdgeOptions, type EdgeStatus } from './edge';

export { EdgeError };
import { encodeLocally, probeDimensions } from './local';
import { FORMATS, type OutputFormat } from './formats';

export type Engine = 'edge' | 'local';

export interface HybridOptions {
  format: OutputFormat;
  quality: number;
  /** Passed to the local engine; PNG never runs at the edge. */
  pngPalette?: boolean;
}

export interface HybridResult {
  blob: Blob;
  engine: Engine;
}

type Size = { width: number; height: number } | null;

interface Deps {
  edge: (file: File, opts: EdgeOptions) => Promise<Blob>;
  local: (file: File, opts: HybridOptions) => Promise<Blob>;
  probe: (file: Blob) => Promise<Size>;
  status: () => Promise<EdgeStatus>;
  storage: Pick<Storage, 'getItem' | 'setItem'> | null;
  now: () => number;
}

// Mirrors the worker's upload cap (worker/upload.js) and the edge's limits.
export const EDGE_MAX_BYTES = 25 * 1024 * 1024;
const EDGE_MAX_DIMENSION = 12_000;
const EDGE_MAX_AVIF_DIMENSION = 1_200;
const EDGE_MAX_PIXELS = 100_000_000;
const EDGE_INPUT_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/pjpeg', 'image/png', 'image/gif', 'image/webp',
  'image/heic', 'image/heif',
]);

const OFF_KEY = 'frbg-edge-off-until';
const OFF_FOR_MS = 15 * 60 * 1000;

function sessionStore(): Deps['storage'] {
  try { return typeof sessionStorage === 'undefined' ? null : sessionStorage; } catch { return null; }
}

/** Whether the edge can take this file at all, before anything is uploaded. */
export function edgeEligible(file: File, format: OutputFormat, size: Size): boolean {
  if (!FORMATS[format].edge) return false;
  if (file.size > EDGE_MAX_BYTES) return false;
  // The edge reads JPEG, PNG, GIF, WebP and HEIC. AVIF input is Enterprise
  // only, and SVG passes through untransformed. An empty type (common for HEIC)
  // is left to the upload endpoint, which sniffs the bytes.
  if (file.type && !EDGE_INPUT_TYPES.has(file.type.toLowerCase())) return false;
  if (size) {
    const longest = Math.max(size.width, size.height);
    if (longest > (format === 'avif' ? EDGE_MAX_AVIF_DIMENSION : EDGE_MAX_DIMENSION)) return false;
    if (size.width * size.height > EDGE_MAX_PIXELS) return false;
  }
  return true;
}

export class HybridProcessor {
  private deps: Deps;
  private edgeOff = false;
  private statusCheck: Promise<void> | null = null;

  constructor(deps: Partial<Deps> = {}) {
    this.deps = {
      edge: (file, opts) => transformAtEdge(file, opts),
      local: encodeLocally,
      probe: probeDimensions,
      status: () => fetchEdgeStatus(),
      storage: sessionStore(),
      now: Date.now,
      ...deps,
    };
    try {
      const until = Number(this.deps.storage?.getItem(OFF_KEY) || 0);
      this.edgeOff = until > this.deps.now();
    } catch {}
  }

  /** False once the edge has failed systemically; the batch then runs locally. */
  get edgeAvailable(): boolean {
    return !this.edgeOff;
  }

  private disableEdge(reason: string) {
    if (this.edgeOff) return;
    this.edgeOff = true;
    console.info(`[transform] Edge engine off, using on-device encoding: ${reason}`);
    try { this.deps.storage?.setItem(OFF_KEY, String(this.deps.now() + OFF_FOR_MS)); } catch {}
  }

  /**
   * Ask the worker once whether this month's free-tier budget is still open
   * (worker/edgeBudget.js). If it is not, every image goes straight to the
   * device and nothing is uploaded. Call it before planning a batch so the
   * concurrency matches the engine that will actually run.
   */
  ready(): Promise<void> {
    if (this.edgeOff) return Promise.resolve();
    return (this.statusCheck ??= this.deps.status().then(
      (status) => {
        if (!status.available) {
          this.disableEdge(status.resumeAt ? `monthly budget used, resumes ${status.resumeAt}` : 'edge unavailable');
        }
      },
      () => this.disableEdge('edge status check failed'),
    ));
  }

  async process(file: File, opts: HybridOptions): Promise<HybridResult> {
    if (!this.edgeOff) await this.ready();
    if (!this.edgeOff) {
      const size = await this.deps.probe(file);
      if (edgeEligible(file, opts.format, size)) {
        try {
          // A size of null means this browser cannot decode the file (HEIC in
          // Chrome, say), so the edge is the only engine that can handle it.
          return { blob: await this.deps.edge(file, opts), engine: 'edge' };
        } catch (error) {
          if (!(error instanceof EdgeError) || error.systemic) {
            this.disableEdge(error instanceof Error ? error.message : String(error));
          } else {
            console.info(`[transform] "${file.name}" fell back to on-device encoding: ${error.message}`);
          }
        }
      }
    }
    return { blob: await this.deps.local(file, opts), engine: 'local' };
  }
}
