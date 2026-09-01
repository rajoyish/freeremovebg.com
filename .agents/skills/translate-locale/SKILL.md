---
name: translate-locale
description: Trigger when the user says "translate the site", "translate locales", "continue translating", "translate <language>", or runs "/translate". Translates src/i18n/locales/*.json one language at a time, in capped batches, and reports session and overall progress.
---

# Translate locale

Translate the site's copy into one language at a time, writing the translations
yourself and merging them through the validator. There is no translation API in
this project. You are the translator.

The whole point of this workflow is to **not** burn a session on 49 languages.
Work through a small budget, report progress, and stop.

The routing this feeds follows Astro's i18n recipe
(<https://docs.astro.build/en/recipes/i18n/>): `astro.config.mjs` declares
`i18n.locales` from `languages.json`, and the recipe's translated-route map
lives in `src/i18n/slugs.ts`. Two consequences for you, both below: a finished
language needs **slugs as well as strings** (step 6), and **keyword meta is not
prose** (step 4).

## Budget

Unless the user names a different number:

- **2 languages per invocation.** Finish them, report, stop.
- **40 strings per batch.** A language is ~300 strings, so about 8 batches.

If the user names languages (`/translate hi ne`) do exactly those. If they name
a count (`/translate 5`) do that many from the queue. Never exceed the budget on
your own initiative. If you are running low on context or the user's quota is a
concern, finish the batch you are on, merge it, report, and stop early: a
partially translated language is safe to ship, so stopping mid-language costs
nothing.

## Workflow

### 1. Open the session

```bash
node scripts/i18n/status.mjs --start
```

`--start` mints a session id used to count what gets finished from here on. Run
it **once** per invocation. Re-running it resets the session counter, so if you
already started one this conversation use plain `status.mjs` instead.

Note the "Next up" line. That is the queue, ordered most-complete-first so
partly-done languages get closed out before new ones open.

### 2. Pick the language

Take the first code from the queue, or the code the user named. Confirm nothing
else: just start.

### 3. Extract a batch

```bash
node scripts/i18n/extract.mjs <code> --max 40
```

This writes `.i18n-batches/<code>.todo.json`: a flat map of English source
string to empty string, plus a `__meta` block naming the language, its endonym
and its text direction. The file is gitignored scratch, not source.

### 4. Translate

Read the batch file, then rewrite it with every value filled in. Rules:

- **Keys are byte-for-byte sacred.** The English string *is* the lookup key
  (`src/i18n/dictionaries.ts`). Change one character of a key, even whitespace,
  and the string silently falls back to English at build time. Copy keys
  verbatim, never retype them.
- **Keep every HTML tag and entity.** 16 strings are FAQ answers containing
  `<p>`, `<strong>` and `&rarr;`. Translate the text around the markup; the tag
  sequence must come out identical. The merge validator rejects the batch
  otherwise.
- **Keep every `{link}` placeholder.** A few sentences on the contact, privacy
  and terms pages carry one; it marks where an inline link goes. Move it to
  wherever the sentence needs it, but do not drop it — the validator rejects the
  batch if it disappears.
- **`FreeRemoveBG` never translates.** Neither do format names (PNG, JPG, GIF,
  WebP, HD) or the slug words inside URLs.
- **`BG` is the brand's shorthand for "background". Never expand it as a word.**
  Danish and Norwegian both shipped `blodsukker` — *blood sugar* — so `/no/`
  opened with "Gratis fjerning av blodsukker", free blood sugar removal, across
  the hero and three FAQ questions. In strings like `Free Remove BG:` or
  `What is Remove BG?`, either keep `Remove BG` as the product name or render
  it as this language's word for removing a background. Check any string
  containing `BG` before you merge it.
- **Translate for the market, not the dictionary.** This is landing-page copy
  for a consumer tool. Match how a native speaker would write a product page:
  natural phrasing, the register the language actually uses for software UI,
  correct pluralisation and number formatting.
- **Keep UI strings short.** Button and label text sits in fixed-width chrome.
  If the natural translation is much longer than the English, find a shorter
  one.
- **Preserve the search intent in titles and meta descriptions.** These pages
  exist to rank. Use the phrase people in that language actually search for
  ("remove background from photo"), not a literal rendering of the English.
- **Keyword meta is a list, not a sentence.** Seven strings are comma-separated
  SEO keyword lists: `meta.keywords` plus one per use case. `extract.mjs` names
  them in `__meta.keywordStrings` when a batch contains any. Do not translate
  them term by term — write the 6 to 9 phrases a native speaker actually types,
  which may share no vocabulary with the English list. Lowercase, and in
  Latin-script languages prefer unaccented forms, because that is how queries
  get typed. `merge.mjs` rejects a keyword value with fewer than 4 terms or one
  left in English.
- **RTL languages** (`ar`, `fa`, `he`, `ur`) need no markup changes. Direction
  is handled by `dir` on the page. Just translate.
- Leave a value equal to the English only when that genuinely is the local form
  (a loanword, a brand). The validator warns on these so they get a second look.

Write the file with the Write tool. Drop the `__meta` block or leave it, the
merger strips it either way.

### 5. Merge

```bash
node scripts/i18n/merge.mjs <code>
```

The validator refuses the whole batch if any key is unknown, any value is empty,
any HTML tag sequence drifted, or any `[XX-Pending]` placeholder survived.
Nothing is written when it fails, so fix the batch file and re-run. On success
it merges, deletes the batch file, appends to `src/i18n/translation-log.json`,
and prints the language's new coverage.

Repeat steps 3 to 5 until the language reports complete.

### 6. When a language completes, give it slugs

**This is part of finishing a language, not a follow-up task.**

Clearing the use-case gate publishes 6 pages. Without an entry in
`src/i18n/slugs.ts` they publish at the *English* slug —
`/fr/remove-background-from-logo/` — which matches no French query and throws
away most of the reason the pages are localized. `merge.mjs` prints a NEXT
block when this happens; `status.mjs` shows `NO` in the `slugs` column.

Add the language to `USE_CASE_ROUTES`:

```ts
fr: {
  "remove-background-from-product-photos": "supprimer-fond-photo-produit",
  "remove-background-from-signature": "supprimer-fond-signature",
  "remove-background-from-profile-picture": "supprimer-fond-photo-profil",
  "batch-background-removal": "supprimer-fond-par-lots",
  "remove-background-from-logo": "supprimer-fond-logo",
  "transparent-png-maker": "createur-png-transparent",
},
```

Write the slug from the search phrase, not from the English slug. Rules:

- lowercase ASCII, hyphen-separated, no trailing slash
- **no percent-encoding.** Non-Latin scripts romanize — `zh` uses pinyin
  (`logo-quchu-beijing`) — so the URL survives copy-paste, analytics and Search
  Console intact
- drop accents (`createur`, not `créateur`): that is how people type
- keep it short, 2 to 4 words

**Do it in the same change that completes the language.** Slugs added before
the pages have ever shipped need no redirect. Once the English-slug URLs are
live and indexed, renaming them requires a 301 per URL, which means adding the
code to `RENAMED_USE_CASE_LANGS` and regenerating `public/_redirects` with
`pnpm i18n:regionmap` (LOCALIZATION.md §3). Cheap now, tedious later.

### 7. Next language, then report

Go back to step 2 until the budget is spent. Then run:

```bash
node scripts/i18n/status.mjs
```

and give the user the stats block described below.

### 8. Verify once, at the end

After the last merge of the invocation:

```bash
pnpm build
```

Confirm the build passes and the localized use-case page count went up as
expected. If you added slugs, confirm the pages built at the *localized* paths:

```bash
ls dist/<code>/
```

Do not build after every language; once per invocation is enough.

## Coverage gating, and why a language is either 6 pages or 0

The same all-or-nothing rule applies twice, over two string sets:

| Gate | Strings | Unlocks |
|---|---|---|
| `hasUseCaseTranslations` / `USE_CASE_LANGS` | everything under `en.useCases` | `/<lang>/<slug>/` × 6 |
| `hasPageTranslations` / `PAGE_LANGS` | everything under `en.pages` | `/<lang>/about/`, `/contact/`, `/privacy-policy/`, `/terms/` |

Both gates count the `keywords` strings, so a language stalls at 6 pages short
of complete if you skip them.

Until a language clears a gate, its header and footer link to the English
originals for those pages, so nothing 404s.


`hasUseCaseTranslations()` in `src/i18n/dictionaries.ts` requires **every**
string under `en.useCases` before a language gets its `/<lang>/<slug>/` routes.
This is deliberate: `getDictionary` falls back to English on a miss, so
publishing a partly translated use-case page would put the same English prose at
294 URLs. Duplicate content, and exactly the pattern Google's scaled-content
policy targets.

So a language at 95% use-case coverage still has **zero** localized use-case
pages. Finish a language before moving on. Half-finishing two languages
publishes nothing.

Slugs are not gated — a language that clears the use-case gate gets its 6 pages
whether or not `slugs.ts` knows about it, just at English URLs. Nothing breaks,
which is exactly why it is easy to miss. Step 6 exists to catch it.

Core (non-use-case) strings are different: they are safe to land partially, and
they improve the 49 home pages that already ship.

## Reporting

End every invocation with this, filled in from `status.mjs`:

```
Translated this session
  <code> <Language>   112 strings   complete   +6 pages   +slugs
  <code> <Language>    40 strings   57% -> 71%

Remaining
  complete       N / 49
  in progress    N
  remaining      N
  strings left   N
  localized use-case pages live   N
  localized content pages live    N

Next up  <codes from the queue>
```

Report what actually happened. If a language came out partial, say so and say
what is left. Do not claim pages are live unless `status.mjs` shows them under
`pages`, and do not claim localized URLs unless it shows `yes` under `slugs`.
If `status.mjs` prints a "Publishing English slugs" block, surface it — those
pages are live at the wrong URLs.

## Commands

| Command | Does |
|---|---|
| `node scripts/i18n/status.mjs` | Coverage table, session count, queue |
| `node scripts/i18n/status.mjs --start` | Mint a session id, then show status |
| `node scripts/i18n/status.mjs --json` | Same data, machine-readable |
| `node scripts/i18n/status.mjs --next 3` | Print the next 3 codes, space separated |
| `node scripts/i18n/extract.mjs <code> --max 40` | Write a fill-in batch |
| `node scripts/i18n/extract.mjs <code> --scope core` | Only non-use-case strings |
| `node scripts/i18n/merge.mjs <code>` | Validate and merge the batch |
| `node scripts/i18n/merge.mjs <code> --prune` | Also drop keys `en.json` dropped |
| `pnpm i18n:regionmap` | Regenerate `worker/region-map.js` + `public/_redirects` |

## Do not

- Do not translate `src/i18n/en.json`. It is the source.
- Do not edit `src/i18n/locales/*.json` by hand. Go through merge, so the
  validator runs.
- Do not add a language to `src/i18n/languages.json` as part of translating. New
  languages are a separate change (see `LOCALIZATION.md` §4). Adding one there
  is enough for `astro.config.mjs` to pick it up — it reads `locales` from that
  file — so never edit the Astro config to add a locale.
- Do not touch the `hreflang` field in `languages.json`. It overrides the tag
  Google reads for the few codes where the bare code is wrong (`tl` → `fil`,
  `zh` → `zh-Hans`) and has nothing to do with translation progress.
- Do not rename a slug that is already live to tidy it up. That costs a 301 per
  URL. Get it right in step 6, then leave it.
- Do not add a translation API, key, or CI step. That was removed on purpose and
  the reasons are in `LOCALIZATION.md` §1.
