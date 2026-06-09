/**
 * Cloudflare Worker — edge routing for the static localized site (SEO-safe).
 * ───────────────────────────────────────────────────────────────────────────
 * Static assets (the pre-translated Astro build in ./dist) are served by the
 * ASSETS binding. This Worker only adds a thin routing layer on top:
 *
 *   1. Crawler safety   — known search bots ALWAYS get the English root, never
 *                         a redirect, so they index the canonical pages cleanly.
 *   2. Cookie override  — a `preferred_lang` cookie (set on explicit selection
 *                         in the LanguageSwitcher) routes returning visitors to
 *                         `/<lang>/`.
 *   3. Fallback         — everyone else (no cookie, preferred_lang=en, or bots)
 *                         is served the English root as-is.
 *
 * NOTE: there is deliberately NO IP/country auto-redirect at the edge.
 * Every first-time visitor (and all bots) gets English at `/` regardless of
 * location. The in-page language switcher merely *suggests* a regional language
 * (client-side via /cdn-cgi/trace). The user's explicit choice is persisted via
 * the `preferred_lang` cookie and honored here on root visits only.
 * This preserves the "suggest, don't force" UX and prevents trapping users or
 * bots in non-English content.
 *
 * The Google Translation API is never involved here; all localized HTML was
 * generated at build time.
 */
import { supportedCodes, defaultLang } from "./region-map.js";

// Search-crawler user agents that must bypass redirection. Matching is
// case-insensitive and substring-based.
const CRAWLER_UA = [
  "googlebot",
  "bingbot",
  "slurp", // Yahoo
  "duckduckbot",
  "baiduspider",
  "yandexbot",
  "yandex",
  "sogou",
  "exabot",
  "facebookexternalhit",
  "facebot",
  "ia_archiver", // Alexa
  "applebot",
  "twitterbot",
  "linkedinbot",
  "embedly",
  "quora link preview",
  "pinterest",
  "slackbot",
  "vkshare",
  "w3c_validator",
  "whatsapp",
  "telegrambot",
  "discordbot",
  "google-inspectiontool",
  "mediapartners-google", // AdSense crawler — must see canonical content, no geo-redirect
  "adsbot-google", // AdSense/Ads landing-page crawler
  "petalbot",
  "bytespider",
  "gptbot",
  "oai-searchbot",
  "perplexitybot",
  "claudebot",
];

function isCrawler(userAgent) {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return CRAWLER_UA.some((bot) => ua.includes(bot));
}

/** Read a cookie value from the Cookie header. */
function getCookie(request, name) {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

/**
 * If running in staging (env.ENVIRONMENT === 'staging'), clone the response
 * and append X-Robots-Tag: noindex, nofollow.
 * This protects the entire staging site (all HTML pages) from being indexed
 * by search engines. We only do this for text/html responses.
 * Cloning is required because Response headers are immutable.
 */
function addStagingNoindex(response, env) {
  if (!env || env.ENVIRONMENT !== 'staging') {
    return response;
  }
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) {
    return response;
  }
  const headers = new Headers(response.headers);
  headers.set('X-Robots-Tag', 'noindex, nofollow');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  /**
   * @param {Request} request
   * @param {import("./env.d.ts").Env} env  Typed bindings incl. ASSETS + the
   *   encrypted GOOGLE_TRANSLATE_API_KEY secret (env.GOOGLE_TRANSLATE_API_KEY).
   * @param {ExecutionContext} ctx
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    // Only GET/HEAD navigations are candidates for redirection. Asset requests
    // (with extensions) and other methods pass straight through.
    const isNavigation =
      (request.method === "GET" || request.method === "HEAD") &&
      !/\.[a-z0-9]+$/i.test(pathname);

    // ── (early): non-navigation or sub-path requests → serve assets ──────────
    // In staging we still want to run the worker (see wrangler.toml [env.staging])
    // so we can inject the noindex header on *all* HTML responses.
    // For non-root paths we just pass through to ASSETS (with header wrapper).
    if (!isNavigation || pathname !== "/") {
      const assetResponse = await env.ASSETS.fetch(request);
      return addStagingNoindex(assetResponse, env);
    }

    // ── 1: Crawler safety — bots always get the canonical English root ────────
    if (isCrawler(request.headers.get("User-Agent"))) {
      const assetResponse = await env.ASSETS.fetch(request);
      return addStagingNoindex(assetResponse, env);
    }

    // ── 2: Cookie override — the user's saved language preference ─────────────
    // Parse `preferred_lang` (set by the client-side LanguageSwitcher on explicit
    // choice). If present, valid, and not "en", issue a 302 to the chosen locale.
    // If the cookie does not exist (new visitors, Googlebot, etc.) OR is "en",
    // fall through and serve the default English root. This is the core of the
    // SEO-safe "default to English + preference redirect" strategy.
    const cookieLang = getCookie(request, 'preferred_lang');
    if (cookieLang && supportedCodes.includes(cookieLang)) {
      if (cookieLang === defaultLang) {
        // User explicitly chose English (or default): stay on the root.
        const assetResponse = await env.ASSETS.fetch(request);
        return addStagingNoindex(assetResponse, env);
      }
      const redirectResponse = redirectTo(url, cookieLang);
      return addStagingNoindex(redirectResponse, env);
    }

    // ── 3: Fallback — serve the English root (no valid non-English preference). ──
    // New users, bots without cookies, and users who selected English always
    // land here. The in-page language switcher can still suggest based on client geo.
    const assetResponse = await env.ASSETS.fetch(request);
    return addStagingNoindex(assetResponse, env);
  },
};

/** 302 Temporary Redirect from the root to `/<lang>/`, preserving query. */
function redirectTo(url, lang) {
  const target = new URL(url);
  target.pathname = `/${lang}/`;
  return new Response(null, {
    status: 302,
    headers: {
      Location: target.toString(),
      // Redirects are driven solely by the `lang` cookie now, so vary on it and
      // never cache, keeping the cookieless English root separately cacheable.
      Vary: "Cookie",
      "Cache-Control": "no-store",
    },
  });
}
