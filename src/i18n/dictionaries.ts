/**
 * Build-time dictionary loader + Environment Gate (quota protection tier 2).
 * ───────────────────────────────────────────────────────────────────────────
 * English (`en.json`) is the canonical source. Each locale file
 * `src/i18n/locales/<code>.json` is a FLAT cache that maps the exact English
 * source string to its translation:
 *
 *     { "Home": "Inicio", "Choose language": "Elegir idioma", ... }
 *
 * That same file is BOTH the translation cache used by `scripts/translate.js`
 * AND the runtime lookup table used here. Astro inlines these JSON files at
 * build time via `import.meta.glob`, so the Google API is NEVER imported or
 * called from application code — only the standalone CLI script touches it.
 *
 * ── Environment Gate ─────────────────────────────────────────────────────────
 * This module contains no network code at all, so `pnpm dev` can never drain
 * the quota. When a string has no cached translation:
 *   • `pnpm dev`  (import.meta.env.DEV === true)  → render a visible placeholder
 *                  like "[ES-Pending] Your Text" so untranslated copy is obvious.
 *   • production build (DEV === false)            → fall back to clean English.
 */
import en from "./en.json";
import { DEFAULT_LANG } from "./config";

export type Dictionary = typeof en;

/** True only under `astro dev`. Drives the placeholder-vs-English fallback. */
const IS_DEV = import.meta.env.DEV;

/** Flat `English -> translation` maps, one per `locales/*.json`, inlined now. */
const localeModules = import.meta.glob<{ default: Record<string, string> }>(
  "./locales/*.json",
  { eager: true },
);

const LOCALE_MAPS: Record<string, Record<string, string>> = {};
for (const [path, mod] of Object.entries(localeModules)) {
  const code = path.replace(/^.*\/(.+)\.json$/, "$1");
  LOCALE_MAPS[code] = mod.default;
}

/** A string is translatable only if it contains an actual letter. */
const isTranslatable = (s: string): boolean => /\p{L}/u.test(s);

/** Resolve one English string against a locale's cache, applying the gate. */
function resolveString(
  code: string,
  english: string,
  cache: Record<string, string>,
): string {
  const hit = cache[english];
  if (hit !== undefined && hit !== "") return hit;
  // Cache miss → never call any API. Surface it in dev, hide it in prod.
  if (IS_DEV) return `[${code.toUpperCase()}-Pending] ${english}`;
  return english;
}

/** Rebuild the canonical en.json shape, translating every leaf string. */
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

/**
 * Return the fully-resolved dictionary for a language code.
 * English is returned verbatim; every other language is rebuilt from en.json
 * using its cached translations (with the dev/prod gate for any misses).
 */
export function getDictionary(code: string): Dictionary {
  if (code === DEFAULT_LANG) return en;
  const cache = LOCALE_MAPS[code];
  // No locale file yet: dev shows everything as pending; prod serves English.
  if (!cache) return IS_DEV ? rebuild(en, code, {}) : en;
  return rebuild(en, code, cache);
}
