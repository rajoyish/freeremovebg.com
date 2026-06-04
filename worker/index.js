/**
 * Cloudflare Worker — edge geo-routing for the static localized site.
 * ───────────────────────────────────────────────────────────────────────────
 * Static assets (the pre-translated Astro build in ./dist) are served by the
 * ASSETS binding. This Worker only adds a thin routing layer on top:
 *
 *   1. Crawler safety   — known search bots ALWAYS get the English root, never
 *                         a redirect, so they index the canonical pages cleanly.
 *   2. Cookie override  — a `lang` cookie (set when the user picks a language in
 *                         the switcher) routes returning visitors to `/<lang>/`.
 *   3. Fallback         — everyone else is served the English root as-is.
 *
 * NOTE: there is deliberately NO IP/country auto-redirect. Every first-time
 * visitor gets English regardless of location; the in-page language switcher
 * merely *suggests* the language for their detected region. This avoids
 * trapping users (e.g. an English speaker in Nepal) in a language they can't
 * read. The user's explicit choice is what persists, via the `lang` cookie.
 *
 * The Google Translation API is never involved here; all localized HTML was
 * generated at build time.
 */
import { supportedCodes, defaultLang, langCookie } from "./region-map.js";

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
    // We only ever act on the bare root "/". Any other path (including
    // already-localized routes like /hi/) is served as-is.
    if (!isNavigation || pathname !== "/") {
      return env.ASSETS.fetch(request);
    }

    // ── 1: Crawler safety — bots always get the canonical English root ────────
    if (isCrawler(request.headers.get("User-Agent"))) {
      return env.ASSETS.fetch(request);
    }

    // ── 2: Cookie override — the user's saved language choice ─────────────────
    // Only a cookie holding a SUPPORTED code is honoured. A garbage/stale value
    // is ignored so it can't trap a user; we fall through to the English root.
    const cookieLang = getCookie(request, langCookie);
    if (cookieLang && supportedCodes.includes(cookieLang)) {
      if (cookieLang === defaultLang) {
        // User explicitly chose English: stay on the root, no redirect.
        return env.ASSETS.fetch(request);
      }
      return redirectTo(url, cookieLang);
    }

    // ── 3: Fallback — serve the English root. No IP/country auto-redirect: the
    // in-page switcher suggests the regional language instead of forcing it. ──
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
      // Redirects are driven solely by the `lang` cookie now, so vary on it and
      // never cache, keeping the cookieless English root separately cacheable.
      Vary: "Cookie",
      "Cache-Control": "no-store",
    },
  });
}
