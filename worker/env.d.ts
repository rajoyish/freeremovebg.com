export interface Env {
  ASSETS: Fetcher;
  GOOGLE_TRANSLATE_API_KEY: string;
  DB: D1Database;                 // global cutout counter (Cloudflare D1)
  TURNSTILE_SECRET_KEY?: string;  // optional during scaffolding; set via `wrangler secret put`
  ENVIRONMENT?: string;
}
