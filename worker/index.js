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

    if (pathname === "/api/count") {
      return handleCount(request, env);
    }

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

// ---------------------------------------------------------------------------
// Global cutout counter — GET/POST /api/count backed by Cloudflare D1.
// ---------------------------------------------------------------------------

const COUNTER_ALLOWED_ORIGINS = [
  "https://freeremovebg.com",
  "https://www.freeremovebg.com",
  "https://staging.freeremovebg.com",
];

const COUNTER_MAX_PER_REQUEST = 50;

let turnstileWarned = false;

// Build CORS headers, echoing the Origin only when it is in the allowlist.
function corsHeaders(origin) {
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
  if (origin && COUNTER_ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function jsonResponse(body, status, origin, extraHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
      ...extraHeaders,
    },
  });
}

async function verifyTurnstile(token, secret, ip) {
  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token || "");
  if (ip) form.append("remoteip", ip);
  try {
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body: form }
    );
    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}

async function handleCount(request, env) {
  const origin = request.headers.get("Origin");

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (request.method === "GET") {
    // Same-origin GETs send a null Origin — allow those and allowlisted origins.
    let count = 0;
    try {
      const row = await env.DB.prepare(
        "SELECT total_cutouts FROM stats WHERE id = 1"
      ).first();
      count = row?.total_cutouts ?? 0;
    } catch {
      count = 0;
    }
    return jsonResponse({ count }, 200, origin, {
      "Cache-Control": "public, max-age=60",
    });
  }

  if (request.method === "POST") {
    // Origin/Referer must be allowlisted to mutate the shared counter.
    const referer = request.headers.get("Referer") || "";
    const refererOk = COUNTER_ALLOWED_ORIGINS.some((o) => referer.startsWith(o));
    const originOk = origin ? COUNTER_ALLOWED_ORIGINS.includes(origin) : false;
    if (!originOk && !refererOk) {
      return jsonResponse({ error: "forbidden" }, 403, origin);
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return jsonResponse({ error: "invalid_json" }, 400, origin);
    }

    const raw = Number(payload?.count);
    if (!Number.isFinite(raw) || raw < 1) {
      return jsonResponse({ error: "invalid_count" }, 400, origin);
    }
    const inc = Math.min(Math.floor(raw), COUNTER_MAX_PER_REQUEST);

    // Invisible Turnstile — enforced only once the secret is configured.
    if (env.TURNSTILE_SECRET_KEY) {
      const ok = await verifyTurnstile(
        payload?.token,
        env.TURNSTILE_SECRET_KEY,
        request.headers.get("CF-Connecting-IP")
      );
      if (!ok) {
        return jsonResponse({ error: "turnstile_failed" }, 403, origin);
      }
    } else if (!turnstileWarned) {
      turnstileWarned = true;
      console.warn(
        "TURNSTILE_SECRET_KEY not set — skipping bot verification on /api/count"
      );
    }

    try {
      const row = await env.DB.prepare(
        "UPDATE stats SET total_cutouts = total_cutouts + ? WHERE id = 1 RETURNING total_cutouts"
      )
        .bind(inc)
        .first();
      return jsonResponse({ count: row?.total_cutouts ?? 0 }, 200, origin);
    } catch {
      return jsonResponse({ error: "db_error" }, 500, origin);
    }
  }

  return jsonResponse({ error: "method_not_allowed" }, 405, origin);
}
