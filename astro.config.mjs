// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
  // No Markdown/code blocks are rendered on this site, but Astro defaults to the
  // Shiki highlighter, which emits inline styles incompatible with our CSP and
  // logs a build warning. Turn it off so CSP stays clean and the warning is gone.
  markdown: {
    syntaxHighlight: false,
  },
  security: {
    // Content Security Policy. Astro auto-generates SHA-256 hashes for every
    // inline <script> (theme bootstrap, GTM loader, font-promotion, JSON-LD)
    // and the inlined Tailwind <style>, so no 'unsafe-inline' is needed. We add
    // the extra directives Lighthouse's CSP-XSS audit checks for (object-src,
    // base-uri) plus the sources the in-browser AI tool needs at runtime.
    csp: {
      directives: [
        // Lock down the document base URI and disallow plugins/embeds. These two
        // are what Lighthouse specifically looks for alongside script-src.
        "base-uri 'self'",
        "object-src 'none'",
        "default-src 'self'",
        // The background-removal engine compiles WASM (onnxruntime-web / imgly)
        // and downloads models from Hugging Face at runtime. blob: covers the
        // worker bundles and object URLs the engine and UI create.
        "connect-src 'self' https://huggingface.co https://*.hf.co https://cdn-lfs.huggingface.co https://*.huggingface.co https://www.googletagmanager.com https://www.google-analytics.com blob: data:",
        "worker-src 'self' blob:",
        // Image previews (original + cutout) are blob:/data: URLs; GA pixels come
        // from google-analytics.com.
        "img-src 'self' data: blob: https://www.googletagmanager.com https://www.google-analytics.com",
        // Google Fonts stylesheet origin (the font files come from gstatic).
        "font-src 'self' https://fonts.gstatic.com",
        "frame-ancestors 'none'",
      ],
      scriptDirective: {
        // 'self' + Astro's per-script hashes, plus the GTM/GA hosts and the
        // 'wasm-unsafe-eval' keyword required to compile the ONNX WASM modules.
        resources: [
          "'self'",
          "'wasm-unsafe-eval'",
          "https://www.googletagmanager.com",
          "https://www.google-analytics.com",
        ],
      },
      styleDirective: {
        // 'self' + Astro's style hash, plus the Google Fonts stylesheet origin.
        resources: ["'self'", "https://fonts.googleapis.com"],
      },
    },
  },
  build: {
    // Inline the site's CSS into a <style> tag in each page's <head> instead of
    // emitting a separate render-blocking <link rel="stylesheet">. Astro's
    // shared CSS chunk is named "Footer.[hash].css" purely from chunk dedup,
    // but it actually holds the WHOLE site's Tailwind output — including the
    // critical above-the-fold styles (reset, header, hero). Deferring it would
    // cause a flash of unstyled content; inlining removes the extra network
    // round-trip from the critical path so it stops delaying LCP.
    inlineStylesheets: "always",
  },
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      // Keep Vite from pre-bundling these heavy WASM/ONNX packages. The
      // background-removal engine loads onnxruntime-web through a runtime
      // dynamic import(); if Vite optimizes it, the content-hashed URL goes
      // stale on re-optimization and 404s (ort.bundle.min-*.js not found),
      // which silently breaks every cutout. Excluding them serves the real
      // module files directly and keeps the dynamic import stable.
      exclude: [
        "@huggingface/transformers",
        "@imgly/background-removal",
        "onnxruntime-web",
      ],
    },
    build: {
      // Do not emit source maps in production. Vite's default for production is
      // already `false`, but we set it explicitly so the build never ships
      // `//# sourceMappingURL=` comments that would 404 in the console (the
      // Lighthouse "missing source maps" / console-errors checks). Flip to
      // 'hidden' if you later want maps uploaded to an error tracker without
      // referencing them from the bundles.
      sourcemap: false,
      rollupOptions: {
        output: {
          // Split the monolithic HomePage script (~1.1 MB / ~306 KiB transfer)
          // into parallel-loadable chunks. The browser fetches them concurrently
          // instead of waiting for one giant file, reducing main-thread blocking.
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
