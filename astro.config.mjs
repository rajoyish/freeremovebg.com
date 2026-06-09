// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
  site: 'https://freeremovebg.com',

  // Content Security Policy is intentionally NOT configured here.
  //
  // Astro's built-in `security.csp` emits a hash-based <meta> CSP. That approach
  // is incompatible with this deployment for two reasons:
  //   1. Cloudflare rewrites the HTML at the edge (Web Analytics beacon, and —
  //      if enabled — Rocket Loader / email obfuscation) which injects/mutates
  //      inline scripts AFTER the build, so their hashes never match and the
  //      injected inline scripts (whose content can rotate) get blocked.
  //   2. onnxruntime-web loads its WASM backend from a runtime-generated
  //      `blob:` script URL that a static hash list cannot anticipate.
  // Instead, a single source-allowlist CSP is delivered as a real HTTP header
  // from public/_headers, which is immune to edge HTML rewriting and supports
  // the blob:/wasm script loading the AI engine needs. See public/_headers.
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
