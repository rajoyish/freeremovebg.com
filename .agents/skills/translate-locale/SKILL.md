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

### 6. Next language, then report

Go back to step 2 until the budget is spent. Then run:

```bash
node scripts/i18n/status.mjs
```

and give the user the stats block described below.

### 7. Verify once, at the end

After the last merge of the invocation:

```bash
pnpm build
```

Confirm the build passes and the localized use-case page count went up as
expected. Do not build after every language; once per invocation is enough.

## Coverage gating, and why a language is either 6 pages or 0

The same all-or-nothing rule applies twice, over two string sets:

| Gate | Strings | Unlocks |
|---|---|---|
| `hasUseCaseTranslations` / `USE_CASE_LANGS` | everything under `en.useCases` | `/<lang>/<slug>/` × 6 |
| `hasPageTranslations` / `PAGE_LANGS` | everything under `en.pages` | `/<lang>/about/`, `/contact/`, `/privacy-policy/`, `/terms/` |

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

Core (non-use-case) strings are different: they are safe to land partially, and
they improve the 49 home pages that already ship.

## Reporting

End every invocation with this, filled in from `status.mjs`:

```
Translated this session
  <code> <Language>   112 strings   complete   +6 pages
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
`pages`.

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

## Do not

- Do not translate `src/i18n/en.json`. It is the source.
- Do not edit `src/i18n/locales/*.json` by hand. Go through merge, so the
  validator runs.
- Do not add a language to `src/i18n/languages.json` as part of translating. New
  languages are a separate change (see `LOCALIZATION.md` §2).
- Do not add a translation API, key, or CI step. That was removed on purpose and
  the reasons are in `LOCALIZATION.md` §1.
