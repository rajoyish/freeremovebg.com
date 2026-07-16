# Localization Architecture

Zero-cost static localization: Google Cloud Translation runs **only at build
time**. Every visitor is served English by default; the in-page language
switcher _suggests_ the language for their detected region but never forces it.
No translation API is ever called at runtime.

## How it fits together

```
src/i18n/languages.json   ← single source of truth (codes, endonyms, flags, countries)
        │
        ├── src/i18n/config.ts        derives REGION_MAP, SUPPORTED_CODES, hreflang URLs
        ├── scripts/gen-region-map.mjs → worker/region-map.js   (edge routing data)
        ├── src/pages/sitemap.xml.ts   → /sitemap.xml            (hreflang sitemap, built by Astro)
        └── scripts/translate.js       → src/i18n/locales/*.json (Google API, MANUAL only)

src/i18n/en.json          ← canonical English copy (the only file you hand-write)
src/i18n/locales/<lc>.json← flat { "English": "translation" } cache (committed)
        │
        └── src/i18n/dictionaries.ts  inlines locales; dev placeholder / prod English fallback

Routes:
  src/pages/index.astro          → /            (English root)
  src/pages/[lang]/index.astro   → /hi/, /es/…  (one static page per target lang)
  src/components/HomePage.astro  → shared dictionary-driven markup for both

  src/data/useCases.ts           → slugs + order only (copy lives in en.json)
  src/pages/[usecase].astro      → /transparent-png-maker/       (English)
  src/pages/[lang]/[usecase].astro → /es/transparent-png-maker/   (translated langs only)
  src/components/UseCasePage.astro → shared markup for both

Edge:
  worker/index.js   → crawler bypass • cookie override • assets fallback (NO geo redirect)
  wrangler.toml     → main + ASSETS binding + run_worker_first = ["/"]
```

## 1. Quota protection — three tiers

The 500,000-char/month Google free tier is protected by three independent
mechanisms, so local development and hot-reloading can never spend it.

### Tier 1 — Cache-first (the locale file _is_ the cache)

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
pnpm run translate                      # sync every language
pnpm run translate -- --dry-run         # report char cost, call nothing
pnpm run translate -- --langs es        # one or more specific languages
pnpm run translate -- --budget 450000   # cap the run at N chars (free-tier guard)
pnpm run translate -- --force           # ignore cache, re-translate all

# Provide the key for the real run (PowerShell):
$env:GOOGLE_TRANSLATE_API_KEY = "your_key"; pnpm run translate
```

- Current copy is ~13,300 chars/language. All 49 languages would be ~652k —
  **over** the 500k monthly free tier, so full coverage needs either a curated
  language set or two calendar months. Re-runs cost **0** once cached.
- `--budget <chars>` caps a run: languages are taken in `languages.json` order
  (which is ordered by internet users, i.e. priority) and each is only started
  if it fits *whole* — a half-translated language would be gated off anyway
  (see §5). Anything skipped is reported and picked up by the next run.
- A `SAFETY_CHAR_LIMIT` (200k) aborts an unexpectedly large run unless `--force`
  or an explicit `--budget` is given.
- Locale files are committed, so a build never needs a key.

### CI auto-sync (`.github/workflows/deploy.yml`)

Deploying to `main` syncs translations automatically — you edit `en.json`, push,
and the locales catch up. Three properties make that safe:

1. **Free when nothing changed.** The step runs on every deploy, but
   `translate.js` returns before any network call (and before it requires a key)
   once every string is cached, so a normal deploy costs 0 chars.
2. **Budgeted.** It passes `--langs $TRANSLATE_LANGS --budget $TRANSLATE_BUDGET`
   (workflow `env`), so a run can't quietly exceed the free tier. Anything that
   doesn't fit is deferred to the next month's run.
3. **Committed back.** Fetched locales are committed to `main` as
   `chore(i18n): sync translations`. Without this the runner would be discarded
   and the next `en.json` edit would re-buy the same characters. The push uses
   `GITHUB_TOKEN`, which by design does **not** trigger workflows, so it can't
   loop.

To change coverage, edit `TRANSLATE_LANGS` in the workflow (or remove `--langs`
to let successive months fill all 49). Running `pnpm run translate` locally and
committing the result still works and makes CI's run a no-op.

## 2. Adding a language

1. Add an entry to `src/i18n/languages.json` (code, endonym, flag, countries).
2. Run `pnpm run translate` (or `-- --langs <code>`) to fill its locale cache.
3. `pnpm build`. The route, hreflang tags, region map, switcher entry, and
   sitemap entry are all derived automatically.

During `pnpm dev` you can skip step 2 — untranslated copy shows as
`[<CODE>-Pending] …` until you sync.

## 3. Edge routing (`worker/index.js`)

Order of precedence on a request to `/`:

1. **Crawler bypass** — Googlebot/Bingbot/etc. always get the English root, so
   canonical pages index cleanly.
2. **Cookie override** — a supported `lang` cookie (set when the user picks a
   language in the switcher) routes returning visitors to `/<lang>/`. An
   unsupported value is ignored. `en` stays on the root.
3. **Fallback** — everyone else gets the English root via
   `env.ASSETS.fetch(request)`.

There is **deliberately no IP/country auto-redirect**. A first-time visitor
anywhere lands on English; this avoids trapping someone (e.g. an English speaker
in Nepal) in a script they can't read. Region detection instead happens
**client-side** in `LanguageSwitcher.astro`: it reads the visitor's country from
Cloudflare's same-origin `/cdn-cgi/trace`, maps it through `regionMap`, and pins
that language to the top of the switcher suggestions with a 📍 marker. If the
user picks it, the `lang` cookie is written and the next visit is served that
language directly (step 2 above). The `regionMap` is still generated and shipped
to the client for exactly this purpose.

Only `/` runs the Worker first (`run_worker_first = ["/"]`); every other request
is served asset-first for lowest latency and zero Worker billing.

Sanity-check the logic locally:

```bash
node worker/routing.test.mjs
```

## 4. SEO

- **Layout** emits `<link rel="alternate" hreflang="…">` for every language plus
  `hreflang="x-default"` → English root, on pages that have localized variants.
- **Sitemap** (`src/pages/sitemap.xml.ts`, prerendered to `/sitemap.xml` at
  build) lists each localized home URL with the full `xhtml:link` alternate set,
  plus the static pages, with `<lastmod>` set to the build date.
- `<html lang>` and `dir` (incl. `rtl` for Arabic) are set per page.
- hreflang clusters are **per page**, not global: `Layout` takes `hreflangLangs`
  (default: every language). A cluster of one is omitted entirely.

## 5. Use-case pages — coverage gating

Use-case landing pages are long-form prose, and `getDictionary` falls back to
English on a cache miss. Generating `/<lang>/<slug>/` for an untranslated
language would therefore publish the *same English text* at 49 URLs — duplicate
content that harms the pages it's meant to help, and the pattern Google's
"scaled content abuse" policy targets.

So route generation is gated on real translation coverage:

- `hasUseCaseTranslations(code)` (dictionaries.ts) is true only when every
  string under `en.useCases` is present in that locale cache.
- `USE_CASE_LANGS` is the gated list. It drives `getStaticPaths`, the sitemap
  entries, the hreflang cluster, and the footer links — all from one source.
- A language with no coverage simply has no localized use-case pages, and its
  footer links to the English originals instead.

The practical effect: translate a language → its pages appear on the next build.
Nothing to wire up per language, and no way to accidentally ship 294 pages of
untranslated English.

Slugs stay English in every language (`/es/transparent-png-maker/`): they're the
key tying copy to a route, and localizing them would fork the URL space.
