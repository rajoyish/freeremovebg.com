// @ts-check
import { readFileSync } from "node:fs";
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

// src/i18n/languages.json is the single source of truth for supported
// languages, so the i18n config reads it rather than restating the list.
/** @type {{ code: string }[]} */
const LANGUAGES = JSON.parse(
  readFileSync(new URL("./src/i18n/languages.json", import.meta.url), "utf8"),
);

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
