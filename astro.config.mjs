// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
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
