// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: 'https://freeremovebg.com',
  trailingSlash: 'always',

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
