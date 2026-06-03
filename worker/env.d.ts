/**
 * Cloudflare Worker environment bindings.
 *
 * `ASSETS` is the static-assets binding declared in wrangler.toml. The
 * GOOGLE_TRANSLATE_API_KEY is an ENCRYPTED SECRET, not a plaintext var — it is
 * uploaded once with `wrangler secret put GOOGLE_TRANSLATE_API_KEY` and stored
 * encrypted by Cloudflare. It is never written into wrangler.toml or any file
 * in this repo. Typed here so `env.GOOGLE_TRANSLATE_API_KEY` is available if a
 * future edge-side translation/proxy path ever needs it.
 *
 * NOTE: the current Worker does NOT call the translation API — all localized
 * HTML is pre-built. This binding is declared for forward compatibility and so
 * the secret is type-checked wherever it is referenced.
 */
export interface Env {
  /** Static assets binding (Astro `dist/`), used via `env.ASSETS.fetch()`. */
  ASSETS: Fetcher;

  /**
   * Google Cloud Translation API key — encrypted Cloudflare secret.
   * Access only server-side at the edge via `env.GOOGLE_TRANSLATE_API_KEY`.
   * Never expose this in a response body, header, or log line.
   */
  GOOGLE_TRANSLATE_API_KEY: string;
}
