// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: 'https://freeremovebg.com',
  trailingSlash: 'always',

  build: {
    inlineStylesheets: "always",
  },
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
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
