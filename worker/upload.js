// ---------------------------------------------------------------------------
// Temporary image uploads for the edge transformation pipeline.
//
//   POST   /api/upload-temp            multipart field "file" -> { key, url, expiresAt }
//   DELETE /api/upload-temp?key=<key>  drop an object once its result is fetched
//
// The object lands in the TEMP_BUCKET R2 bucket, which is served publicly from
// TEMP_PUBLIC_URL (a custom domain on this zone, e.g. https://temp.freeremovebg.com).
// The browser then requests /cdn-cgi/image/<opts>/<that url>. Same-zone sources
// need no allow-list. Serving the source from a bucket domain instead of a route
// on this Worker avoids the edge's Worker-interception and loop errors
// (9524 / 9403).
//
// Objects are disposable. The client deletes each one as soon as it has the
// transformed image, and an R2 lifecycle rule (see DEVELOPMENT.md) expires any
// that are left over after a day.
// ---------------------------------------------------------------------------

export const UPLOAD_PATH = "/api/upload-temp";
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const TTL_MS = 24 * 60 * 60 * 1000;

const ALLOWED_ORIGINS = [
  "https://freeremovebg.com",
  "https://www.freeremovebg.com",
];

const KEY_PATTERN = /^tmp\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\.(jpg|png|webp|gif|heic)$/;

/**
 * Identify the file from its first bytes. The client's declared type is never
 * trusted, because the bucket serves objects with the type stored here. Only
 * the raster inputs the edge can transform are accepted (BMP and TIFF are not
 * among them). SVG is rejected on purpose: it can carry script.
 */
export function sniffImage(bytes) {
  const b = bytes;
  const ascii = (start, end) => String.fromCharCode(...b.subarray(start, end));
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return { mime: "image/jpeg", ext: "jpg" };
  }
  if (b.length >= 8 && ascii(1, 4) === "PNG" && b[0] === 0x89) {
    return { mime: "image/png", ext: "png" };
  }
  if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") {
    return { mime: "image/webp", ext: "webp" };
  }
  if (b.length >= 6 && (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a")) {
    return { mime: "image/gif", ext: "gif" };
  }
  if (b.length >= 12 && ascii(4, 8) === "ftyp") {
    const brand = ascii(8, 12);
    if (["heic", "heix", "hevc", "heim", "heis", "mif1", "msf1"].includes(brand)) {
      return { mime: "image/heic", ext: "heic" };
    }
    // AVIF is not accepted: the edge transforms AVIF input on Enterprise
    // plans only, so the client keeps those files local (src/lib/transform/hybrid.ts).
  }
  return null;
}

function json(body, status, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

function originAllowed(request, url) {
  const origin = request.headers.get("Origin");
  // A same-origin request from `wrangler dev` comes from the dev server's own
  // origin, so accept that alongside production.
  const allowed = [...ALLOWED_ORIGINS, url.origin];
  if (origin) return allowed.includes(origin);
  const referer = request.headers.get("Referer") || "";
  return allowed.some((o) => referer.startsWith(`${o}/`));
}

function publicBase(env) {
  const base = (env.TEMP_PUBLIC_URL || "").trim().replace(/\/+$/, "");
  return /^https?:\/\//.test(base) ? base : "";
}

export async function handleUpload(request, env, now = Date.now()) {
  const url = new URL(request.url);

  if (request.method !== "POST" && request.method !== "DELETE") {
    return json({ error: "method_not_allowed" }, 405, { Allow: "POST, DELETE" });
  }
  if (!originAllowed(request, url)) {
    return json({ error: "forbidden" }, 403);
  }
  // Without a bucket and a public URL there is no edge pipeline. 503 tells the
  // client to switch to on-device encoding for the session.
  const base = publicBase(env);
  if (!env.TEMP_BUCKET || !base) {
    return json({ error: "uploads_unavailable" }, 503);
  }

  if (request.method === "DELETE") {
    const key = url.searchParams.get("key") || "";
    if (!KEY_PATTERN.test(key)) return json({ error: "invalid_key" }, 400);
    try {
      await env.TEMP_BUCKET.delete(key);
    } catch {
      return json({ error: "storage_error" }, 500);
    }
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  }

  if (env.UPLOAD_LIMITER) {
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const { success } = await env.UPLOAD_LIMITER.limit({ key: ip });
    if (!success) return json({ error: "rate_limited" }, 429);
  }

  // Refuse oversized bodies before buffering them. The multipart framing adds
  // a few hundred bytes on top of the file itself.
  const declared = Number(request.headers.get("Content-Length") || 0);
  if (declared > MAX_UPLOAD_BYTES + 16 * 1024) {
    return json({ error: "too_large", maxBytes: MAX_UPLOAD_BYTES }, 413);
  }

  let file;
  try {
    const form = await request.formData();
    file = form.get("file");
  } catch {
    return json({ error: "invalid_form" }, 400);
  }
  if (!file || typeof file === "string") {
    return json({ error: "missing_file" }, 400);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return json({ error: "too_large", maxBytes: MAX_UPLOAD_BYTES }, 413);
  }
  if (file.size === 0) {
    return json({ error: "empty_file" }, 400);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffImage(bytes.subarray(0, 32));
  if (!kind) return json({ error: "unsupported_type" }, 415);

  const day = new Date(now).toISOString().slice(0, 10);
  const key = `tmp/${day}/${crypto.randomUUID()}.${kind.ext}`;
  const expiresAt = new Date(now + TTL_MS).toISOString();

  try {
    await env.TEMP_BUCKET.put(key, bytes, {
      httpMetadata: {
        contentType: kind.mime,
        // The edge declines to cache sources with a restrictive Cache-Control,
        // so allow an hour. The object is deleted long before that matters.
        cacheControl: "public, max-age=3600",
        contentDisposition: "inline",
      },
      customMetadata: { expiresAt },
    });
  } catch {
    return json({ error: "storage_error" }, 500);
  }

  return json({ key, url: `${base}/${key}`, expiresAt }, 201);
}
