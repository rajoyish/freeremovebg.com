/**
 * Google AdSense configuration — single source of truth.
 * ───────────────────────────────────────────────────────────────────────────
 * AdSense is intentionally DORMANT until you set a publisher ID. Nothing about
 * the ad system renders, loads, or runs while `PUBLIC_ADSENSE_CLIENT` is empty,
 * so the site ships ad-free today and flips on later with zero code changes.
 *
 * To go live (when the site has a handful of users), three steps — all
 * documented in DEVELOPMENT.md:
 *   1. Set PUBLIC_ADSENSE_CLIENT in the environment (and as a Cloudflare var)
 *      to your real ID, e.g. "ca-pub-1234567890123456".
 *   2. Fill in public/ads.txt with the matching pub-XXXXXXXXXXXXXXXX line.
 *   3. Activate the AdSense origins in public/_headers (see the CSP note there).
 *
 * The id is read from `import.meta.env.PUBLIC_ADSENSE_CLIENT`. The `PUBLIC_`
 * prefix is REQUIRED for Astro to expose it to the browser bundle; the AdSense
 * client id is not a secret (it ships in the loader URL on every ad page).
 */

/** Raw publisher id, e.g. "ca-pub-1234567890123456". Empty string when unset. */
export const ADSENSE_CLIENT: string = (
  import.meta.env.PUBLIC_ADSENSE_CLIENT ?? ""
).trim();

/**
 * Master switch. When false, no loader script is injected and every <AdSlot />
 * renders nothing (well, an empty reserved box in dev — see the component).
 * A valid AdSense id always starts with "ca-pub-".
 */
export const ADSENSE_ENABLED: boolean = ADSENSE_CLIENT.startsWith("ca-pub-");

/** URL of the AdSense loader library, scoped to this publisher. */
export const ADSENSE_LOADER_SRC: string = ADSENSE_ENABLED
  ? `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`
  : "";
