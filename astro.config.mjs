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
        // Runtime fetches made by the in-browser AI engine:
        //   - huggingface.co / *.hf.co / cdn-lfs: the model weights (~30MB).
        //   - cdn.jsdelivr.net: @huggingface/transformers loads its onnxruntime-web
        //     WASM backend (ort-wasm-*.wasm / .mjs) from jsDelivr by DEFAULT. Without
        //     this the engine reports "no available backend found" and every cutout
        //     fails. (The bundled @imgly path uses the local /_astro wasm instead.)
        //   - cloudflareinsights.com: Cloudflare Web Analytics beacon RUM POST.
        //   - blob:/data:: worker bundles and object URLs the engine/UI create.
        // ── AdSense (future): append the ad serving/measurement endpoints ──
        //   https://pagead2.googlesyndication.com https://*.g.doubleclick.net
        //   https://*.googlesyndication.com https://adservice.google.com
        "connect-src 'self' https://huggingface.co https://*.hf.co https://cdn-lfs.huggingface.co https://*.huggingface.co https://cdn.jsdelivr.net https://www.googletagmanager.com https://www.google-analytics.com https://cloudflareinsights.com https://static.cloudflareinsights.com blob: data:",
        "worker-src 'self' blob:",
        // Image previews (original + cutout) are blob:/data: URLs; GA pixels come
        // from google-analytics.com.
        // ── AdSense (future): append the ad image/pixel origins ──
        //   https://*.g.doubleclick.net https://*.googlesyndication.com
        //   https://www.google.com https://googleads.g.doubleclick.net
        "img-src 'self' data: blob: https://www.googletagmanager.com https://www.google-analytics.com",
        // Google Fonts stylesheet origin (the font files come from gstatic).
        "font-src 'self' https://fonts.gstatic.com",
        // The contact form POSTs to FormSubmit. Without this, form-action falls
        // back to default-src 'self' and the browser blocks the submission.
        "form-action 'self' https://formsubmit.co",
        // No ad iframes today, so frames fall back to default-src 'self'. When
        // AdSense is added, UNCOMMENT the line below so display-ad iframes render
        // (without it, every ad slot is blocked by CSP):
        // "frame-src https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://www.google.com",
        // NOTE: frame-ancestors is intentionally NOT set here. It is ignored when
        // delivered via <meta> (which is how Astro injects this CSP) and is
        // already enforced as a real HTTP header in public/_headers.
      ],
      scriptDirective: {
        // 'self' + Astro's per-script hashes, plus 'wasm-unsafe-eval' (ONNX WASM
        // compilation), the GTM/GA hosts, jsDelivr (onnxruntime-web backend .mjs
        // loaded as a module script), and the Cloudflare Web Analytics beacon.
        resources: [
          "'self'",
          "'wasm-unsafe-eval'",
          "https://cdn.jsdelivr.net",
          "https://static.cloudflareinsights.com",
          "https://www.googletagmanager.com",
          "https://www.google-analytics.com",
          // ── AdSense (future) ────────────────────────────────────────────────
          // UNCOMMENT these when integrating AdSense. NOTE: AdSense also injects
          // inline + dynamically-generated scripts that hashes cannot cover, so
          // you will additionally need to set scriptDirective.strictDynamic: true
          // (preferred) OR add "'unsafe-inline'". Test ad rendering after the
          // change — a too-strict script-src silently blanks every ad slot.
          // "https://pagead2.googlesyndication.com",
          // "https://partner.googleadservices.com",
          // "https://tpc.googlesyndication.com",
          // "https://adservice.google.com",
        ],
        hashes: [
          // Cloudflare injects a small INLINE companion script at the edge
          // (alongside the external beacon.min.js) when Web Analytics / Rocket
          // Loader auto-injection is enabled. It is added AFTER Astro builds, so
          // Astro can't auto-hash it. This is the exact hash the browser reported
          // for that inline script. Hashes are content-bound and fail-safe: if
          // Cloudflare ever changes the snippet the hash simply won't match (the
          // analytics beacon would stop, but the app is unaffected). Cleaner
          // long-term fix: disable Cloudflare's automatic injection for this zone
          // and add the beacon manually in Layout.astro so Astro hashes it.
          "sha256-KohIAF4Y0Ltq5j1jZVPHZNch4+ua1su+CYYa0EuCwgs=",
        ],
        // strictDynamic: true, // ← enable with AdSense (lets approved scripts load their children)
      },
      styleDirective: {
        // 'self' + Astro's style hash, plus the Google Fonts stylesheet origin.
        // AdSense (future): ad iframes carry their own styles, but the ad units
        // injected into THIS document may need 'unsafe-inline' here — add it only
        // if ad styling looks broken after integration.
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
