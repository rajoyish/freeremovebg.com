// Shared helpers for the incremental translation workflow.
//
// The locale files are flat { "English source": "translation" } maps, and the
// English string itself is the lookup key (see src/i18n/dictionaries.ts). So
// every helper here works in terms of English source strings, never key paths.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(fileURLToPath(import.meta.url), "../../..");
export const I18N_DIR = path.join(ROOT, "src/i18n");
export const LOCALES_DIR = path.join(I18N_DIR, "locales");
export const BATCH_DIR = path.join(ROOT, ".i18n-batches");
export const LEDGER_PATH = path.join(I18N_DIR, "translation-log.json");
export const SESSION_PATH = path.join(ROOT, ".i18n-session");

export const readJSON = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
export const writeJSON = (p, v) =>
  fs.writeFileSync(p, JSON.stringify(v, null, 2) + "\n");

export const EN = readJSON(path.join(I18N_DIR, "en.json"));
export const LANGUAGES = readJSON(path.join(I18N_DIR, "languages.json"));
export const DEFAULT_LANG = "en";

// Mirrors isTranslatable() in dictionaries.ts: a string is translatable only if
// it contains a letter. Icons, numbers and symbols pass through untouched.
const isTranslatable = (s) => /\p{L}/u.test(s);

export function collectStrings(value, out = new Set()) {
  if (typeof value === "string") {
    if (isTranslatable(value)) out.add(value);
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((v) => collectStrings(v, out));
    return out;
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach((v) => collectStrings(v, out));
  }
  return out;
}

export const ALL_STRINGS = [...collectStrings(EN)];
export const USE_CASE_STRINGS = [...collectStrings(EN.useCases ?? {})];
const USE_CASE_SET = new Set(USE_CASE_STRINGS);
export const CORE_STRINGS = ALL_STRINGS.filter((s) => !USE_CASE_SET.has(s));
// about / contact / privacy-policy / terms — gated as one set, like the
// use-case copy (see LOCALIZATION.md §5). These are part of CORE_STRINGS.
export const PAGE_STRINGS = [...collectStrings(EN.pages ?? {})];

// Keyword meta strings: comma-separated search terms, not prose. They need the
// terms a native speaker actually types, so the batch file flags them and the
// merge validator holds them to different rules than a sentence.
export const KEYWORD_STRINGS = [
  EN.meta?.keywords,
  ...Object.values(EN.useCases?.items ?? {}).map((i) => i.keywords),
].filter(Boolean);
const KEYWORD_SET = new Set(KEYWORD_STRINGS);
export const isKeywordString = (s) => KEYWORD_SET.has(s);

// Languages with translated use-case slugs (src/i18n/slugs.ts). Parsed rather
// than imported because that file is TypeScript; scripts/gen-region-map.mjs
// reads it the same way. A language completing its use-case copy without an
// entry here publishes 6 pages at English slugs, which throws away the reason
// the pages are localized at all.
export const SLUG_LANGS = (() => {
  const p = path.join(I18N_DIR, "slugs.ts");
  if (!fs.existsSync(p)) return [];
  const block = fs
    .readFileSync(p, "utf8")
    .match(/export const USE_CASE_ROUTES[^=]*=\s*\{([\s\S]*?)\n\};/)?.[1];
  if (!block) return [];
  return [...block.matchAll(/^ {2}(\w+):\s*\{/gm)].map((m) => m[1]);
})();

export const hasSlugs = (code) =>
  code === DEFAULT_LANG || SLUG_LANGS.includes(code);

export const localePath = (code) => path.join(LOCALES_DIR, `${code}.json`);

export function loadLocale(code) {
  const p = localePath(code);
  return fs.existsSync(p) ? readJSON(p) : {};
}

const isFilled = (cache, s) => cache[s] !== undefined && cache[s] !== "";

/** Missing English strings for `code`, split the way the routes care about. */
export function missingFor(code, cache = loadLocale(code)) {
  return {
    core: CORE_STRINGS.filter((s) => !isFilled(cache, s)),
    useCases: USE_CASE_STRINGS.filter((s) => !isFilled(cache, s)),
  };
}

/** True when `code` has every useCases string, which is what unlocks its pages. */
export const hasUseCasePages = (code, cache = loadLocale(code)) =>
  code === DEFAULT_LANG || USE_CASE_STRINGS.every((s) => isFilled(cache, s));

/** True when `code` has every `pages` string, which unlocks about/contact/… */
export const hasContentPages = (code, cache = loadLocale(code)) =>
  code === DEFAULT_LANG || PAGE_STRINGS.every((s) => isFilled(cache, s));

export function statusFor(code) {
  const cache = loadLocale(code);
  const missing = missingFor(code, cache);
  const total = CORE_STRINGS.length + USE_CASE_STRINGS.length;
  const done = total - missing.core.length - missing.useCases.length;
  return {
    code,
    missingCore: missing.core.length,
    missingUseCases: missing.useCases.length,
    done,
    total,
    percent: Math.round((done / total) * 100),
    complete: missing.core.length === 0 && missing.useCases.length === 0,
    hasPages: hasUseCasePages(code, cache),
    hasContentPages: hasContentPages(code, cache),
    hasSlugs: hasSlugs(code),
  };
}

export const TARGETS = LANGUAGES.filter((l) => l.code !== DEFAULT_LANG);

export const langName = (code) =>
  LANGUAGES.find((l) => l.code === code)?.englishName ?? code;
export const langEndonym = (code) =>
  LANGUAGES.find((l) => l.code === code)?.endonym ?? code;
export const langDir = (code) =>
  LANGUAGES.find((l) => l.code === code)?.dir ?? "ltr";

export const knownCode = (code) => TARGETS.some((l) => l.code === code);

export const readLedger = () =>
  fs.existsSync(LEDGER_PATH) ? readJSON(LEDGER_PATH) : { entries: [] };

export function appendLedger(entry) {
  const ledger = readLedger();
  ledger.entries.push(entry);
  writeJSON(LEDGER_PATH, ledger);
  return ledger;
}

export const readSession = () =>
  fs.existsSync(SESSION_PATH) ? fs.readFileSync(SESSION_PATH, "utf8").trim() : null;

export function startSession() {
  const id = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z");
  fs.writeFileSync(SESSION_PATH, id + "\n");
  return id;
}
