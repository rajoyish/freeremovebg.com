/**
 * Central i18n configuration — the single source of truth shared by:
 *   • the build-time translation script  (scripts/translate.js)
 *   • the Astro pages & layout            (hreflang tags, localized routes)
 *   • the Cloudflare Worker               (edge geo-routing)
 *
 * Add a language by editing `languages.json`. Everything below — the region
 * map, the route table, the hreflang list — is derived automatically, so the
 * architecture scales to any ISO 639-1 pair Google Cloud Translation supports.
 */
import languagesData from "./languages.json";

export interface Language {
  /** ISO 639-1 code, also the Google Translation target and the URL sub-path. */
  code: string;
  /** Native name shown in the UI (e.g. "हिन्दी"), never the English name. */
  endonym: string;
  /** English name — used only for search matching, never rendered as the label. */
  englishName: string;
  /** ISO 3166-1 alpha-2 region for the `flag-icons` class (`fi fi-<flag>`). */
  flag: string;
  /** Text direction; drives <html dir>. */
  dir: "ltr" | "rtl";
  /** ISO 3166-1 country codes that should auto-route to this language. */
  countries: string[];
}

export const SITE = "https://freeremovebg.com";

/** The English source language. Lives at the site root (`/`). */
export const DEFAULT_LANG = "en";

export const LANGUAGES: Language[] = languagesData as Language[];

/** Languages other than English — these get generated `/<code>/` route trees. */
export const TARGET_LANGUAGES: Language[] = LANGUAGES.filter(
  (l) => l.code !== DEFAULT_LANG,
);

/** Fast lookup table: code -> Language. */
export const LANG_BY_CODE: Record<string, Language> = Object.fromEntries(
  LANGUAGES.map((l) => [l.code, l]),
);

/** Every supported ISO 639-1 code, English included. */
export const SUPPORTED_CODES: string[] = LANGUAGES.map((l) => l.code);

/**
 * Country -> language route map, derived from each language's `countries`.
 * e.g. { IN: "hi", NP: "ne", ES: "es", MX: "es", ... }. Used by the Worker.
 */
export const REGION_MAP: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const lang of LANGUAGES) {
    if (lang.code === DEFAULT_LANG) continue;
    for (const country of lang.countries) map[country] = lang.code;
  }
  return map;
})();

/** Cookie name used to persist an explicit user language choice. */
export const LANG_COOKIE = "lang";

/** Build the absolute URL for a given language code and (optional) sub-path. */
export function localizedUrl(code: string, path = "/"): string {
  const clean = path.replace(/^\/+/, "");
  if (code === DEFAULT_LANG) return `${SITE}/${clean}`.replace(/\/+$/, "/");
  return `${SITE}/${code}/${clean}`.replace(/\/+$/, "/");
}

/** Resolve the active Language from a request pathname (defaults to English). */
export function langFromPath(pathname: string): Language {
  const seg = pathname.split("/").filter(Boolean)[0];
  return (seg && LANG_BY_CODE[seg]) || LANG_BY_CODE[DEFAULT_LANG];
}
