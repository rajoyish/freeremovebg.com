# Localization Architecture

Zero-cost static localization: Google Cloud Translation runs **only at build
time**, and Cloudflare's edge handles free, instant country routing. No
translation API is ever called at runtime.

## How it fits together

```
src/i18n/languages.json   ← single source of truth (codes, endonyms, flags, countries)
        │
        ├── src/i18n/config.ts        derives REGION_MAP, SUPPORTED_CODES, hreflang URLs
        ├── scripts/gen-region-map.mjs → worker/region-map.js   (edge routing data)
        ├── scripts/gen-sitemap.mjs    → public/sitemap.xml      (hreflang sitemap)
        └── scripts/translate.js       → src/i18n/locales/*.json (Google API, MANUAL only)

src/i18n/en.json          ← canonical English copy (the only file you hand-write)
src/i18n/locales/<lc>.json← flat { "English": "translation" } cache (committed)
        │
        └── src/i18n/dictionaries.ts  inlines locales; dev placeholder / prod English fallback

Routes:
  src/pages/index.astro        → /            (English root)
  src/pages/[lang]/index.astro → /hi/, /es/…  (one static page per target lang)
  src/components/HomePage.astro→ shared dictionary-driven markup for both

Edge:
  worker/index.js   → crawler bypass • cookie override • geo redirect • assets fallback
  wrangler.toml     → main + ASSETS binding + run_worker_first = ["/"]
```

## 1. Quota protection — three tiers

The 500,000-char/month Google free tier is protected by three independent
mechanisms, so local development and hot-reloading can never spend it.

### Tier 1 — Cache-first (the locale file *is* the cache)

Each `src/i18n/locales/<code>.json` is a flat map of the English source string
to its translation:

```json
{ "Home": "Inicio", "Choose language": "Elegir idioma" }
```

`scripts/translate.js` reads this file first and only requests the strings that
are **not already keys** in it. Fetched results are appended back, so any string
is paid for exactly once and never fetched again. The same file is the runtime
lookup table read by `dictionaries.ts` — one artifact, two jobs.

### Tier 2 — Environment Gate (dev block)

`dictionaries.ts` contains **no network code at all**, so `pnpm dev` physically
cannot reach Google. On a cache miss it branches on `import.meta.env.DEV`:

- `pnpm dev` → renders a visible placeholder, e.g. `[ES-Pending] Your Text`.
- production build → falls back to clean English.

### Tier 3 — Manual CLI trigger (decoupled)

The API caller is `scripts/translate.js`, wired to `pnpm run translate`. It is
**not** part of `dev`, `build`, or `prebuild`, and it self-aborts if invoked
from any of those lifecycles. You run it deliberately, only when you have new
copy to sync:

```bash
pnpm run translate                 # sync every language
pnpm run translate -- --dry-run    # report char cost, call nothing
pnpm run translate -- --langs es   # one or more specific languages
pnpm run translate -- --force      # ignore cache, re-translate all

# Provide the key for the real run (PowerShell):
$env:GOOGLE_TRANSLATE_API_KEY = "your_key"; pnpm run translate
```

- Current copy is ~8,000 chars/language × 12 languages ≈ 96k chars — comfortably
  inside the free tier, and **0 chars** on re-runs once cached.
- A `SAFETY_CHAR_LIMIT` (200k) aborts an unexpectedly large run unless `--force`.
- Locale files are committed, so CI builds without a key. The deploy workflow
  runs `pnpm run translate` only when `GOOGLE_TRANSLATE_API_KEY` is set.

## 2. Adding a language

1. Add an entry to `src/i18n/languages.json` (code, endonym, flag, countries).
2. Run `pnpm run translate` (or `-- --langs <code>`) to fill its locale cache.
3. `pnpm build`. The route, hreflang tags, region map, switcher entry, and
   sitemap entry are all derived automatically.

During `pnpm dev` you can skip step 2 — untranslated copy shows as
`[<CODE>-Pending] …` until you sync.

## 3. Edge routing (`worker/index.js`)

Order of precedence on a request to `/`:

1. **Crawler bypass** — Googlebot/Bingbot/etc. always get the English root (no
   redirect), so canonical pages index cleanly.
2. **Cookie override** — a supported `lang` cookie strictly wins over geo. An
   unsupported value is ignored (falls through to geo).
3. **Geo redirect** — `request.cf.country` mapped via `regionMap` → `302` to
   `/<lang>/`.
4. **Fallback** — `env.ASSETS.fetch(request)` serves static files.

Only `/` runs the Worker first (`run_worker_first = ["/"]`); every other request
is served asset-first for lowest latency and zero Worker billing.

Sanity-check the logic locally:

```bash
node worker/routing.test.mjs
```

## 4. SEO

- **Layout** emits `<link rel="alternate" hreflang="…">` for every language plus
  `hreflang="x-default"` → English root, on pages that have localized variants.
- **Sitemap** (`public/sitemap.xml`) lists each localized home URL with the full
  `xhtml:link` alternate set.
- `<html lang>` and `dir` (incl. `rtl` for Arabic) are set per page.
