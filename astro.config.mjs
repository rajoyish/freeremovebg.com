// @ts-check
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";

// src/i18n/languages.json is the single source of truth for supported
// languages, so the i18n config reads it rather than restating the list.
/** @type {{ code: string }[]} */
const LANGUAGES = JSON.parse(
  readFileSync(new URL("./src/i18n/languages.json", import.meta.url), "utf8"),
);


const LANG_CODES = new Set(LANGUAGES.map((l) => l.code));

/**
 * ISO date of the last commit touching `path`, or undefined if there is none.
 * @param {string} path
 * @returns {string | undefined}
 */
function lastCommitISO(path) {
  try {
    return (
      execFileSync("git", ["log", "-1", "--format=%cI", "--", path], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim() || undefined
    );
  } catch {
    return undefined;
  }
}

// The file each language's rendered copy actually comes from. Every page in a
// language reads the same locale cache, so they share one honest date.
const COPY_LASTMOD = Object.fromEntries(
  LANGUAGES.map((l) => [
    l.code,
    lastCommitISO(
      l.code === "en" ? "src/i18n/en.json" : `src/i18n/locales/${l.code}.json`,
    ),
  ]).filter(([, date]) => date),
);

// A shallow clone (actions/checkout defaults to fetch-depth 1) resolves no
// dates, which would silently ship a sitemap with no lastmod at all. Loud here
// beats undiagnosable in Search Console.
if (Object.keys(COPY_LASTMOD).length === 0) {
  console.warn(
    "[sitemap] No git dates resolved — sitemap will omit <lastmod>. " +
      "Is this a shallow clone? CI needs fetch-depth: 0.",
  );
}

export default defineConfig({
  site: 'https://freeremovebg.com',
  trailingSlash: 'always',

  // Declaring i18n does not change any URL — src/pages/[lang]/ already
  // produces exactly the /<code>/ layout described here. What it buys is that
  // Astro now knows which path segments are locales: Astro.currentLocale
  // resolves in any component without re-parsing the pathname, the astro:i18n
  // helpers generate routes, and dev warns when a localized URL has no route
  // behind it instead of silently 404ing in production.
  //
  // No `fallback` on purpose. Falling an untranslated language back to English
  // would publish the same English prose at 49 URLs, which is the duplicate
  // content the coverage gating in src/i18n/dictionaries.ts exists to prevent.
  i18n: {
    defaultLocale: 'en',
    locales: LANGUAGES.map((l) => l.code),
    routing: {
      prefixDefaultLocale: false,
    },
  },

  // The dev-toolbar audit fetches each element's src to lint it. Our engine
  // inserts thumbnails as short-lived blob: URLs that are revoked once consumed,
  // so those audit fetches spam the console with ERR_FILE_NOT_FOUND / "Failed to
  // fetch". We don't use the toolbar, so disable it (dev-only; no prod impact).
  devToolbar: { enabled: false },

  // Every route in src/pages/ lands in the sitemap on its own, including the
  // getStaticPaths ones, so adding a language or a use case needs no sitemap
  // edit. This replaced a hand-written src/pages/sitemap.xml.ts that restated
  // the route table and drifted from it.
  //
  // No `i18n` option on purpose. It assumes one slug shared across locales,
  // but src/i18n/slugs.ts translates the use-case slugs, so it would emit
  // hreflang pointing at /es/remove-background-from-logo/ — a URL that was
  // never built. The alternates live in each page's <head> instead
  // (src/layouts/Layout.astro), which Google treats as equivalent.
  integrations: [
    sitemap({
      // Error pages are reachable routes but nothing to index.
      filter: (page) => !/\/(404|500)\/?$/.test(page),

      // No <priority> or <changefreq>: Google ignores both, and the old
      // hand-written sitemap spent bytes on them for nothing.
      //
      // <lastmod> it does read, but only while the dates stay honest. The old
      // sitemap stamped every URL with the build date, so all 80 changed on
      // every deploy and the signal was worth nothing. Here a page's lastmod is
      // the last commit that touched the copy it renders, so shipping one
      // language's translation re-dates that language's URLs and leaves the
      // other 48 alone — which is the crawl budget going where the new content
      // is. Template and styling commits deliberately do not move it; Google
      // asks that lastmod track content, not boilerplate.
      serialize(item) {
        const segment = new URL(item.url).pathname.split("/")[1];
        const lastmod = COPY_LASTMOD[LANG_CODES.has(segment) ? segment : "en"];
        if (lastmod) item.lastmod = lastmod;
        return item;
      },
    }),
  ],

  build: {
    inlineStylesheets: "always",
  },
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      // Pre-bundle these at server start so Vite doesn't discover them mid-session
      // and trigger an "optimized dependencies changed. reloading" cycle, which
      // otherwise 504s in-flight requests (e.g. the dev-toolbar entrypoint).
      include: ["glightbox", "img-comparison-slider", "jszip"],
      exclude: [
        "@huggingface/transformers",
        "@imgly/background-removal",
        "onnxruntime-web",
      ],
    },
    build: {
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("onnxruntime-web")) return "ort";
            if (id.includes("@huggingface/transformers")) return "hf-transformers";
            if (id.includes("@imgly/background-removal")) return "bg-removal";
            if (id.includes("jszip")) return "jszip";
          },
        },
      },
    },
    worker: {
      format: "es",
    },
  },
});
