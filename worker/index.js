/**
 * Cloudflare Worker — edge geo-routing for the static localized site.
 * ───────────────────────────────────────────────────────────────────────────
 * Static assets (the pre-translated Astro build in ./dist) are served by the
 * ASSETS binding. This Worker only adds a thin routing layer on top:
 *
 *   1. Crawler safety   — known search bots ALWAYS get the English root, never
 *                         a redirect, so they index the canonical pages cleanly.
 *   2. Cookie override  — an explicit `lang` cookie strictly wins over IP geo.
 *   3. Geo redirect     — first-time visitors on `/` whose `request.cf.country`
 *                         maps to a language are 302-redirected to `/<lang>/`.
 *   4. Fallback         — everything else is served straight from ASSETS.
 *
 * The Google Translation API is never involved here; all localized HTML was
 * generated at build time.
 */
import { regionMap, supportedCodes, defaultLang, langCookie } from "./region-map.js";

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
  "adsbot-google",        // AdSense/Ads landing-page crawler
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

/** First path segment, e.g. "/hi/foo" -> "hi". */
function firstSegment(pathname) {
  return pathname.split("/").filter(Boolean)[0] ?? "";
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

    // ── 4 (early): non-navigation or sub-path requests → serve assets ─────────
    // We only ever auto-redirect from the bare root "/". Any other path
    // (including already-localized routes like /hi/) is served as-is.
    if (!isNavigation || pathname !== "/") {
      return env.ASSETS.fetch(request);
    }

    // ── 1: Crawler safety — bots skip all redirection logic ───────────────────
    if (isCrawler(request.headers.get("User-Agent"))) {
      return env.ASSETS.fetch(request);
    }

    // ── 2: Cookie override — explicit choice beats IP geolocation ─────────────
    // Only a cookie holding a SUPPORTED code is honoured. A garbage/stale value
    // is ignored so it can't trap a user; we fall through to geo detection.
    const cookieLang = getCookie(request, langCookie);
    if (cookieLang && supportedCodes.includes(cookieLang)) {
      if (cookieLang === defaultLang) {
        // User explicitly chose English: stay on the root, no redirect.
        return env.ASSETS.fetch(request);
      }
      return redirectTo(url, cookieLang);
    }

    // ── 3: Geo redirect — map request.cf.country to a language sub-route ──────
    const country = request.cf?.country;
    const mapped = country ? regionMap[country] : undefined;
    if (mapped && mapped !== defaultLang) {
      return redirectTo(url, mapped);
    }

    // ── 4: Fallback — serve the English root static assets ────────────────────
    return env.ASSETS.fetch(request);
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
      // Vary on cookie + country so caches never serve one user's redirect to
      // another region, and the English root stays separately cacheable.
      Vary: "Cookie",
      "Cache-Control": "no-store",
    },
  });
}
