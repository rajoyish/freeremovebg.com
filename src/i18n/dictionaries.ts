import en from "./en.json";
import { DEFAULT_LANG, LANGUAGES } from "./config";

export type Dictionary = typeof en;

const IS_DEV = import.meta.env.DEV;

const localeModules = import.meta.glob<{ default: Record<string, string> }>(
  "./locales/*.json",
  { eager: true },
);

const LOCALE_MAPS: Record<string, Record<string, string>> = {};
for (const [path, mod] of Object.entries(localeModules)) {
  const code = path.replace(/^.*\/(.+)\.json$/, "$1");
  LOCALE_MAPS[code] = mod.default;
}

const isTranslatable = (s: string): boolean => /\p{L}/u.test(s);

function resolveString(
  code: string,
  english: string,
  cache: Record<string, string>,
): string {
  const hit = cache[english];
  if (hit !== undefined && hit !== "") return hit;
  if (IS_DEV) return `[${code.toUpperCase()}-Pending] ${english}`;
  return english;
}

function rebuild<T>(value: T, code: string, cache: Record<string, string>): T {
  if (typeof value === "string") {
    return (isTranslatable(value)
      ? resolveString(code, value, cache)
      : value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => rebuild(v, code, cache)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = rebuild(v, code, cache);
    return out as T;
  }
  return value;
}

export function getDictionary(code: string): Dictionary {
  if (code === DEFAULT_LANG) return en;
  const cache = LOCALE_MAPS[code];
  if (!cache) return IS_DEV ? rebuild(en, code, {}) : en;
  return rebuild(en, code, cache);
}

function collectStrings(value: unknown, out: Set<string>): void {
  if (typeof value === "string") {
    if (isTranslatable(value)) out.add(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v) => collectStrings(v, out));
    return;
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach((v) => collectStrings(v, out));
  }
}

// Every English string the use-case pages render. Computed once at module load.
const USE_CASE_STRINGS: string[] = (() => {
  const set = new Set<string>();
  collectStrings(en.useCases, set);
  return [...set];
})();

// Same, for the static content pages (about / contact / privacy / terms).
const PAGE_STRINGS: string[] = (() => {
  const set = new Set<string>();
  collectStrings(en.pages, set);
  return [...set];
})();

// Same, for the converter (/convert) and optimizer (/optimize) pages.
const TOOL_STRINGS: string[] = (() => {
  const set = new Set<string>();
  collectStrings(en.converter, set);
  collectStrings(en.optimizer, set);
  return [...set];
})();

function fullyTranslated(code: string, strings: string[]): boolean {
  if (code === DEFAULT_LANG) return true;
  const cache = LOCALE_MAPS[code];
  if (!cache) return false;
  return strings.every((s) => {
    const hit = cache[s];
    return hit !== undefined && hit !== "";
  });
}

/**
 * Whether `code` has a complete translation of the use-case copy.
 *
 * This gates route generation on purpose. `getDictionary` falls back to English
 * on a cache miss, so generating /<lang>/<slug>/ for an untranslated language
 * would publish the same English prose at N URLs — duplicate content that hurts
 * the pages it's meant to help. A language earns its localized pages only once
 * its locale file actually carries every `useCases` string.
 */
export function hasUseCaseTranslations(code: string): boolean {
  return fullyTranslated(code, USE_CASE_STRINGS);
}

/**
 * Whether `code` has a complete translation of the static content pages.
 *
 * Gates /<lang>/about/, /<lang>/contact/, /<lang>/privacy-policy/ and
 * /<lang>/terms/ for the same reason `hasUseCaseTranslations` gates the
 * use-case routes: a partial translation would publish English prose under a
 * localized URL. Until a language qualifies, its header and footer link to the
 * English originals.
 */
export function hasPageTranslations(code: string): boolean {
  return fullyTranslated(code, PAGE_STRINGS);
}

/**
 * Whether `code` has a complete translation of the converter and optimizer
 * pages. Gates /<lang>/convert/ and /<lang>/optimize/ the same way the two
 * gates above do, so a partial translation never publishes English prose
 * under a localized URL.
 */
export function hasToolTranslations(code: string): boolean {
  return fullyTranslated(code, TOOL_STRINGS);
}

export type Revisions = typeof en.revisions;

/**
 * Layer a page's revised copy (en.json → `revisions.<page>`) over its current
 * copy, but only in languages that have translated every string of that
 * revision. Other languages keep the copy they already have.
 *
 * `revisions` sits outside the three route gates above on purpose: rewriting a
 * gated string in place would unpublish that page in every language until the
 * new English is translated again. A revision ships in English at once and
 * reaches each language when its locale catches up. Once all languages carry a
 * revision, fold it back into the base section and delete it here.
 *
 * All or nothing per revision, so a page never mixes old and new versions of
 * the same paragraph.
 */
export function revise<B extends object, P extends keyof Revisions>(
  code: string,
  base: B,
  page: P,
): B & Partial<Revisions[P]> {
  const revision = en.revisions[page];
  if (code === DEFAULT_LANG) return { ...base, ...revision };
  const cache = LOCALE_MAPS[code];
  if (!cache) return base;
  const strings = new Set<string>();
  collectStrings(revision, strings);
  const complete = [...strings].every((s) => cache[s] !== undefined && cache[s] !== "");
  return complete ? { ...base, ...rebuild(revision, code, cache) } : base;
}

/** Language codes with localized use-case pages, in languages.json order. */
export const USE_CASE_LANGS: string[] = LANGUAGES.map((l) => l.code).filter(
  hasUseCaseTranslations,
);

/** Language codes with localized about/contact/privacy/terms pages. */
export const PAGE_LANGS: string[] = LANGUAGES.map((l) => l.code).filter(
  hasPageTranslations,
);

/** Language codes with localized converter and optimizer pages. */
export const TOOL_LANGS: string[] = LANGUAGES.map((l) => l.code).filter(
  hasToolTranslations,
);
