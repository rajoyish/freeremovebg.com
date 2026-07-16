# Localization Architecture

Fully static localization with **no translation service in the loop**. The
committed `src/i18n/locales/*.json` files are the single source of translated
copy — the site reads them at build time and nothing else. Every visitor is
served English by default; the in-page language switcher _suggests_ the language
for their detected region but never forces it.

There is deliberately **no automated translation** in the codebase or the deploy
pipeline (see §1). Locales are data you edit and commit, like any other source
file.

## How it fits together

```
src/i18n/languages.json   ← single source of truth (codes, endonyms, flags, countries)
        │
        ├── src/i18n/config.ts        derives REGION_MAP, SUPPORTED_CODES, hreflang URLs
        ├── scripts/gen-region-map.mjs → worker/region-map.js   (edge routing data)
        └── src/pages/sitemap.xml.ts   → /sitemap.xml            (hreflang sitemap, built by Astro)

src/i18n/en.json          ← canonical English copy
src/i18n/locales/<lc>.json← flat { "English": "translation" } (hand-maintained, committed)
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

## 1. No automated translation (by design)

The repo previously called Google Cloud Translation from `scripts/translate.js`
and from the deploy workflow. **Both are gone.** There is no translation script,
no API key, and no CI step that contacts a translation service.

Why it was removed:

- **It broke deploys.** Making a paid third-party API a prerequisite of shipping
  meant an API-side failure could block a site deploy.
- **CI couldn't keep what it bought.** The runner is destroyed after deploy, so
  fetched locales were discarded unless explicitly committed back — every
  `en.json` edit risked re-billing the same characters.
- **The dependency wasn't earning its keep.** Locales change rarely; a build-time
  network call to a metered API on every deploy is a standing liability for a
  once-in-a-while task.

What replaces it: **nothing**. `src/i18n/locales/<code>.json` is a flat
`{ "English source": "translation" }` map that you edit and commit. Use any
translator you like (a service, an LLM, a human) and paste the result in. The
build only ever reads these files.

Two properties still hold, and they're what made the pipeline safe to delete:

- **The build never needs a key or a network call.** Locales are committed, so
  CI and local builds are hermetic.
- **A cache miss is not an error.** `dictionaries.ts` has no network code at
  all. On a miss it renders `[ES-Pending] Your Text` in `pnpm dev` and clean
  English in a production build, so partial translations are always safe to ship.

## 2. Adding a language

1. Add an entry to `src/i18n/languages.json` (code, endonym, flag, countries).
2. Create `src/i18n/locales/<code>.json` mapping each English source string to
   its translation. The keys must match `src/i18n/en.json` values byte-for-byte
   — that string *is* the lookup key.
3. `pnpm build`. The route, hreflang tags, region map, switcher entry, and
   sitemap entry are all derived automatically.

Step 2 is optional to get started: a language with no locale file still builds
and renders clean English in production, and `[<CODE>-Pending] …` in `pnpm dev`.
Translate incrementally — partial files are safe.

To list what's still missing for a language:

```bash
node -e "
const fs=require('fs');
const code=process.argv[1];
const en=JSON.parse(fs.readFileSync('src/i18n/en.json','utf8'));
const f='src/i18n/locales/'+code+'.json';
const cache=fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):{};
const out=new Set();
(function c(v){if(typeof v==='string'){if(/\p{L}/u.test(v))out.add(v);return}
if(Array.isArray(v))return v.forEach(c);
if(v&&typeof v==='object')Object.values(v).forEach(c)})(en);
const missing=[...out].filter(s=>!cache[s]);
console.log(code+': '+missing.length+' missing / '+out.size);
missing.forEach(s=>console.log('  '+JSON.stringify(s)));
" es
```

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

The practical effect: fill in a language's `useCases` strings → its pages appear
on the next build. Nothing to wire up per language, and no way to accidentally
ship 294 pages of untranslated English.

Today **no** language has the use-case strings, so these pages are English-only
(`USE_CASE_LANGS === ['en']`) — a deliberate, correct state, not a gap.

Slugs stay English in every language (`/es/transparent-png-maker/`): they're the
key tying copy to a route, and localizing them would fork the URL space.
