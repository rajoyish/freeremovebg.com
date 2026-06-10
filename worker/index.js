import { supportedCodes, defaultLang } from "./region-map.js";

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

function getCookie(request, name) {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

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
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    const isNavigation =
      (request.method === "GET" || request.method === "HEAD") &&
      !/\.[a-z0-9]+$/i.test(pathname);

    if (!isNavigation || pathname !== "/") {
      const assetResponse = await env.ASSETS.fetch(request);
      return addStagingNoindex(assetResponse, env);
    }

    if (isCrawler(request.headers.get("User-Agent"))) {
      const assetResponse = await env.ASSETS.fetch(request);
      return addStagingNoindex(assetResponse, env);
    }

    const cookieLang = getCookie(request, 'preferred_lang');
    if (cookieLang && supportedCodes.includes(cookieLang)) {
      if (cookieLang === defaultLang) {
        const assetResponse = await env.ASSETS.fetch(request);
        return addStagingNoindex(assetResponse, env);
      }
      const redirectResponse = redirectTo(url, cookieLang);
      return addStagingNoindex(redirectResponse, env);
    }

    const assetResponse = await env.ASSETS.fetch(request);
    return addStagingNoindex(assetResponse, env);
  },
};

function redirectTo(url, lang) {
  const target = new URL(url);
  target.pathname = `/${lang}/`;
  return new Response(null, {
    status: 302,
    headers: {
      Location: target.toString(),
      Vary: "Cookie",
      "Cache-Control": "no-store",
    },
  });
}
