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
        └── scripts/gen-region-map.mjs → worker/region-map.js   (edge routing data)
                                       → public/_redirects      (retired-slug 301s)

src/i18n/en.json          ← canonical English copy
src/i18n/locales/<lc>.json← flat { "English": "translation" } (hand-maintained, committed)
        │
        └── src/i18n/dictionaries.ts  inlines locales; dev placeholder / prod English fallback

Routes:
  src/pages/index.astro          → /            (English root)
  src/pages/[lang]/index.astro   → /hi/, /es/…  (one static page per target lang)
  src/components/HomePage.astro  → shared dictionary-driven markup for both

  src/data/useCases.ts           → canonical slugs + order (copy lives in en.json)
  src/i18n/slugs.ts              → translated slugs per language
  src/pages/[usecase].astro      → /transparent-png-maker/       (English)
  src/pages/[lang]/[usecase].astro → /es/creador-de-png-transparente/
                                                                 (translated langs only)
  src/components/UseCasePage.astro → shared markup for both

  src/pages/about.astro          → /about/                       (English)
  src/pages/[lang]/about.astro   → /es/about/                    (translated langs only)
  src/components/pages/*.astro   → shared markup for both
                                   (same pairing for contact, privacy-policy, terms)

  src/i18n/routes.ts             → link builders; keep the language prefix where
                                   the language has the page, else link English

Edge:
  worker/index.js   → crawler bypass • cookie override • assets fallback (NO geo redirect)
  public/_redirects → 301s from retired English slugs (generated, see §3)
  wrangler.toml     → main + ASSETS binding + run_worker_first = ["/"]

Astro config:
  astro.config.mjs  → i18n { defaultLocale, locales, prefixDefaultLocale: false }
                      Describes the URL layout src/pages/[lang]/ already produces.
                      Enables Astro.currentLocale and the astro:i18n helpers; no
                      `fallback`, because falling back to English would publish
                      the same prose at 49 URLs.
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

## 2. Translated URL slugs

Use-case pages publish under a slug in the page's own language. `/es/` serves
`quitar-fondo-de-logotipo`, not `remove-background-from-logo`.

This is the one place localization reaches the URL rather than only the copy,
and it is the highest-leverage one for non-English ranking: the slug is a match
target, it renders in the SERP display URL, and it is what gets copied into
links and shares. An English slug under `/es/` matches no Spanish query and
reads as an English page to anyone scanning results.

`src/data/useCases.ts` still owns the canonical slug — it keys the copy in
`en.json` and it is the English URL. `src/i18n/slugs.ts` maps that key to a
per-language slug:

```ts
export const USE_CASE_ROUTES = {
  es: { "remove-background-from-logo": "quitar-fondo-de-logotipo", ... },
  zh: { "remove-background-from-logo": "logo-quchu-beijing", ... },
};
```

A language absent from the map keeps the English slug, so adding one is
additive and cannot break an existing URL. Rules for a new entry:

- lowercase ASCII, hyphen-separated, no trailing slash
- no percent-encoding — non-Latin scripts romanize (`zh` uses pinyin), so the
  URL survives copy-paste, analytics and Search Console intact
- **a shipped slug is permanent.** Changing one needs a 301, below.

Because the languages no longer share one path with a swapped prefix, three
consumers take a per-language path map (`useCaseBasePaths`) instead of a single
`basePath`: `Layout.astro` for canonical + hreflang, `LanguageSwitcher.astro` so
switching language lands on that language's slug, and `getStaticPaths` in
`src/pages/[lang]/[usecase].astro`.

## 3. Retiring a slug

`scripts/gen-region-map.mjs` parses `USE_CASE_ROUTES` and writes
`public/_redirects`, one `301` per language listed in `RENAMED_USE_CASE_LANGS`,
mapping the English slug to the translated one. Astro copies it to the build
root, where the ASSETS binding parses it exactly as it parses `_headers`.

It has to live there rather than in the Worker: `run_worker_first` covers only
`/` and `/api/count`, so `not_found_handling = "404-page"` would answer a
retired URL before the Worker ever ran.

Regenerate with `pnpm i18n:regionmap`; `prebuild` runs it on every build.

## 4. Adding a language

1. Add an entry to `src/i18n/languages.json` (code, endonym, flag, countries).
2. Create `src/i18n/locales/<code>.json` mapping each English source string to
   its translation. The keys must match `src/i18n/en.json` values byte-for-byte
   — that string *is* the lookup key.
3. `pnpm build`. The route, hreflang tags, region map, switcher entry, and
   sitemap entry are all derived automatically.

Step 2 is optional to get started: a language with no locale file still builds
and renders clean English in production, and `[<CODE>-Pending] …` in `pnpm dev`.
Translate incrementally — partial files are safe.

## 4b. Translating a language (the incremental workflow)

Translation is a per-language chore run through `scripts/i18n/`, deliberately
capped so no single sitting tries to cover all 49. The scripts do the
bookkeeping; a human or an LLM does the translating.

```bash
pnpm i18n:status --start                    # queue + coverage, opens a session
node scripts/i18n/extract.mjs es --max 40   # -> .i18n-batches/es.todo.json
#  fill in the empty values
node scripts/i18n/merge.mjs es              # validate, merge, log, delete batch
```

`extract` writes a flat `{ "English source": "" }` batch. `merge` refuses the
**whole** batch, writing nothing, if any key is not an `en.json` source string,
any value is empty, any HTML tag sequence drifted from the source, a `{link}`
placeholder went missing, or a `[XX-Pending]` placeholder survived. That all-or-nothing behaviour is the point:
a locale file can never half-absorb a bad batch.

On success `merge` appends to `src/i18n/translation-log.json`, which records
what was translated when and under which session. `status.mjs` reads it back to
report how many languages a given sitting finished against how many remain.

Batches and the session id (`.i18n-batches/`, `.i18n-session`) are gitignored
scratch. The translations themselves land in `src/i18n/locales/<code>.json` and
are committed like any other source file.

Claude Code drives this through the `translate-locale` skill
(`.claude/skills/translate-locale/`), which carries the translation rules: keys
are byte-for-byte sacred, HTML tags survive, `FreeRemoveBG` never translates,
and coverage gating means you finish one language rather than half-finishing
two.

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

## 5. Edge routing (`worker/index.js`)

Order of precedence on a request to `/`:

1. **Crawler bypass** — Googlebot/Bingbot/etc. always get the English root, so
   canonical pages index cleanly.
2. **Cookie override** — a supported `lang` cookie (set when the user picks a
   language in the switcher) routes returning visitors to `/<lang>/`. An
   unsupported value is ignored. `en` stays on the root. The Worker reads the
   cookie name from `langCookie` in the generated `worker/region-map.js`, which
   is the same constant the switcher writes — the two hardcoded their own names
   once and silently stopped agreeing, which is what `worker/routing.test.mjs`
   now guards.

   Only `/` is redirected. A returning visitor who lands directly on
   `/about/` or a use-case URL gets the English page; the in-page links from
   there keep whatever language that page is in.
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

## 6. SEO

- **Layout** emits `<link rel="alternate" hreflang="…">` for every language plus
  `hreflang="x-default"` → English root, on pages that have localized variants.
- **Sitemap** is generated by `@astrojs/sitemap` (configured in
  `astro.config.mjs`) into `/sitemap-index.xml` and `/sitemap-0.xml`. It lists
  every route Astro builds, so a new language or use case needs no sitemap edit.
  `/sitemap.xml` 301s to the index for the URL already in Search Console.
- **hreflang lives in one place**, the page `<head>`. The sitemap's `i18n`
  option is off: it assumes one slug shared across locales, which the
  translated use-case slugs break. Google treats head and sitemap annotations
  as equivalent and ignores conflicting ones, so a second copy in the sitemap
  would add a drift risk for no gain.
- **`<lastmod>` is the last commit touching the copy the page renders**
  (`src/i18n/en.json`, or `src/i18n/locales/<code>.json`). Translating one
  language re-dates only that language's URLs. No `<priority>` or
  `<changefreq>` — Google ignores both. CI checks out with `fetch-depth: 0`
  because a shallow clone resolves no dates.
- `<html lang>` and `dir` (incl. `rtl` for Arabic) are set per page.
- hreflang clusters are **per page**, not global: `Layout` takes `hreflangLangs`
  (default: every language). A cluster of one is omitted entirely.

## 7. Localized routes — coverage gating

Use-case landing pages are long-form prose, and `getDictionary` falls back to
English on a cache miss. Generating `/<lang>/<slug>/` for an untranslated
language would therefore publish the *same English text* at 49 URLs — duplicate
content that harms the pages it's meant to help, and the pattern Google's
"scaled content abuse" policy targets.

So route generation is gated on real translation coverage:

- `hasUseCaseTranslations(code)` (dictionaries.ts) is true only when every
  string under `en.useCases` is present in that locale cache.
- `USE_CASE_LANGS` is the gated list. It drives `getStaticPaths`, the hreflang
  cluster, and the footer links — all from one source. The sitemap follows for
  free, since it lists whatever `getStaticPaths` built.
- A language with no coverage simply has no localized use-case pages, and its
  footer links to the English originals instead.

The same gate covers the static content pages (about, contact, privacy-policy,
terms) through `hasPageTranslations(code)` and `PAGE_LANGS`, over every string
under `en.pages`.

The practical effect: fill in a language's `useCases` strings → its six pages
appear on the next build; fill in its `pages` strings → its four content pages
appear. Nothing to wire up per language, and no way to accidentally ship
hundreds of pages of untranslated English.

`pnpm i18n:status` shows the live count under `pages`.

### Links follow the same gate

`src/i18n/routes.ts` builds every header and footer link, so a visitor's chosen
language survives navigation instead of resetting to English on the first click.
Where the language does not have the page, the link falls back to the English
original — the alternative is a link to a URL that was never generated.

`LanguageSwitcher` takes the same list as `availableLangs`: picking a language
that lacks the current page lands on that language's home page rather than a
404. Pages pass their own list (`PAGE_LANGS`, `USE_CASE_LANGS`); the home page
passes every language.

Slugs stay English in every language (`/es/transparent-png-maker/`): they're the
key tying copy to a route, and localizing them would fork the URL space.
