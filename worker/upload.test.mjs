import assert from "node:assert/strict";
import { test } from "node:test";
import worker from "./index.js";
import { handleUpload, sniffImage, MAX_UPLOAD_BYTES } from "./upload.js";

const ORIGIN = "https://freeremovebg.com";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

function fakeBucket() {
  const objects = new Map();
  return {
    objects,
    async put(key, value, opts) { objects.set(key, { value, opts }); },
    async delete(key) { objects.delete(key); },
  };
}

const env = (overrides = {}) => ({
  TEMP_BUCKET: fakeBucket(),
  TEMP_PUBLIC_URL: "https://temp.freeremovebg.com/",
  ...overrides,
});

function upload(bytes, { origin = ORIGIN, type = "image/png", name = "a.png" } = {}) {
  const form = new FormData();
  form.append("file", new File([bytes], name, { type }));
  const headers = origin ? { Origin: origin } : {};
  return new Request("https://freeremovebg.com/api/upload-temp", { method: "POST", body: form, headers });
}

test("sniffs raster formats by magic bytes and rejects SVG", () => {
  assert.equal(sniffImage(PNG)?.mime, "image/png");
  assert.equal(sniffImage(JPEG)?.mime, "image/jpeg");
  assert.equal(sniffImage(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))?.mime, "image/webp");
  assert.equal(sniffImage(new TextEncoder().encode("GIF89a......"))?.mime, "image/gif");
  assert.equal(sniffImage(new TextEncoder().encode("\0\0\0\x18ftypheic"))?.mime, "image/heic");
  assert.equal(sniffImage(new TextEncoder().encode("\0\0\0\x18ftypavif")), null, "AVIF input is Enterprise-only at the edge");
  assert.equal(sniffImage(SVG), null);
});

test("stores an upload and returns its public URL", async () => {
  const e = env();
  const res = await handleUpload(upload(PNG), e, Date.parse("2026-11-06T10:00:00Z"));
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.match(body.key, /^tmp\/2026-11-06\/[0-9a-f-]{36}\.png$/);
  assert.equal(body.url, `https://temp.freeremovebg.com/${body.key}`);
  assert.equal(body.expiresAt, "2026-11-07T10:00:00.000Z");
  const stored = e.TEMP_BUCKET.objects.get(body.key);
  assert.equal(stored.opts.httpMetadata.contentType, "image/png");
});

test("stores the sniffed type, not the one the client declared", async () => {
  const e = env();
  const res = await handleUpload(upload(JPEG, { type: "image/png", name: "x.png" }), e);
  const { key } = await res.json();
  assert.match(key, /\.jpg$/);
  assert.equal(e.TEMP_BUCKET.objects.get(key).opts.httpMetadata.contentType, "image/jpeg");
});

test("rejects foreign origins, non-images and oversized files", async () => {
  assert.equal((await handleUpload(upload(PNG, { origin: "https://evil.example" }), env())).status, 403);
  assert.equal((await handleUpload(upload(PNG, { origin: null }), env())).status, 403);
  assert.equal((await handleUpload(upload(SVG, { type: "image/svg+xml" }), env())).status, 415);

  const big = new Uint8Array(MAX_UPLOAD_BYTES + 1);
  big.set(PNG);
  assert.equal((await handleUpload(upload(big), env())).status, 413);
});

test("reports 503 when R2 or the public URL is not configured", async () => {
  assert.equal((await handleUpload(upload(PNG), env({ TEMP_BUCKET: undefined }))).status, 503);
  assert.equal((await handleUpload(upload(PNG), env({ TEMP_PUBLIC_URL: "" }))).status, 503);
});

test("honours the optional rate limiter", async () => {
  const limited = env({ UPLOAD_LIMITER: { limit: async () => ({ success: false }) } });
  assert.equal((await handleUpload(upload(PNG), limited)).status, 429);
});

test("DELETE removes only well-formed temp keys", async () => {
  const e = env();
  const { key } = await (await handleUpload(upload(PNG), e)).json();
  const del = (k) => new Request(`https://freeremovebg.com/api/upload-temp?key=${encodeURIComponent(k)}`, {
    method: "DELETE",
    headers: { Origin: ORIGIN },
  });
  assert.equal((await handleUpload(del("../stats.db"), e)).status, 400);
  assert.equal((await handleUpload(del(key), e)).status, 204);
  assert.equal(e.TEMP_BUCKET.objects.has(key), false);
});

test("the worker routes /api/upload-temp to the handler", async () => {
  const res = await worker.fetch(upload(PNG), { ASSETS: { fetch: () => new Response("ASSET") }, ...env() }, {});
  assert.equal(res.status, 201);
  const get = new Request("https://freeremovebg.com/api/upload-temp");
  assert.equal((await worker.fetch(get, env(), {})).status, 405);
});
