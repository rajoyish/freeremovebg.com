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

    // ── API: Global Counter ──────────────────────────────────────────────────
    if (pathname === "/api/count") {
      const corsHeaders = {
        "Access-Control-Allow-Origin": "https://freeremovebg.com",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      };

      if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
      }

      const referer = request.headers.get("Referer");
      const origin = request.headers.get("Origin");
      const isValidOrigin =
        (referer && referer.startsWith("https://freeremovebg.com")) ||
        (origin && origin === "https://freeremovebg.com");

      if (!isValidOrigin) {
        return new Response("Forbidden", { status: 403 });
      }

      if (request.method === "GET") {
        try {
          const result = await env.DB.prepare("SELECT total_cutouts FROM stats WHERE id = 1").first();
          const count = result ? result.total_cutouts : 0;
          return new Response(JSON.stringify({ count }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } catch (e) {
          return new Response(JSON.stringify({ count: 0 }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      if (request.method === "POST") {
        try {
          const body = await request.json();
          const turnstileToken = body["cf-turnstile-token"];
          const count = Number(body.count);

          if (!turnstileToken) {
            return new Response("Missing Turnstile token", { status: 400 });
          }

          if (isNaN(count) || count <= 0 || count > 50) {
            return new Response("Invalid count", { status: 400 });
          }

          const turnstileVerify = await fetch(
            "https://challenges.cloudflare.com/turnstile/v0/siteverify",
            {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: `secret=${env.TURNSTILE_SECRET_KEY}&response=${turnstileToken}`,
            }
          );
          
          const verifyResult = await turnstileVerify.json();
          if (!verifyResult.success) {
            return new Response("Invalid Turnstile token", { status: 403 });
          }

          await env.DB.prepare(
            "UPDATE stats SET total_cutouts = total_cutouts + ? WHERE id = 1"
          ).bind(count).run();

          const result = await env.DB.prepare("SELECT total_cutouts FROM stats WHERE id = 1").first();
          const newCount = result ? result.total_cutouts : 0;

          return new Response(JSON.stringify({ count: newCount }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } catch (e) {
          return new Response("Error updating count", { status: 500 });
        }
      }

      return new Response("Method not allowed", { status: 405, headers: corsHeaders });
    }

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
