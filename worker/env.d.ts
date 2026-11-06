export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;                 // global cutout counter (Cloudflare D1)
  TURNSTILE_SECRET_KEY?: string;  // optional during scaffolding; set via `wrangler secret put`
  ENVIRONMENT?: string;
  TEMP_BUCKET?: R2Bucket;         // temporary uploads for /convert and /optimize (worker/upload.js)
  TEMP_PUBLIC_URL?: string;       // public custom domain serving TEMP_BUCKET, e.g. https://temp.freeremovebg.com
  UPLOAD_LIMITER?: { limit(opts: { key: string }): Promise<{ success: boolean }> };
}
