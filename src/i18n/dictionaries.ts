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

/**
 * Whether `code` has a complete translation of the use-case copy.
 *
 * This gates route generation on purpose. `getDictionary` falls back to English
 * on a cache miss, so generating /<lang>/<slug>/ for an untranslated language
 * would publish the same English prose at N URLs — duplicate content that hurts
 * the pages it's meant to help. A language earns its localized pages only once
 * `pnpm translate` has actually filled its cache.
 */
export function hasUseCaseTranslations(code: string): boolean {
  if (code === DEFAULT_LANG) return true;
  const cache = LOCALE_MAPS[code];
  if (!cache) return false;
  return USE_CASE_STRINGS.every((s) => {
    const hit = cache[s];
    return hit !== undefined && hit !== "";
  });
}

/** Language codes with localized use-case pages, in languages.json order. */
export const USE_CASE_LANGS: string[] = LANGUAGES.map((l) => l.code).filter(
  hasUseCaseTranslations,
);
