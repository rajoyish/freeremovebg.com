import languagesData from "./languages.json";

export interface Language {
  /** URL path segment, e.g. 'zh' in /zh/. Also the <html lang> value. */
  code: string;
  endonym: string;
  englishName: string;
  /** ISO 3166-1 alpha-2, used for the flag icon and the og:locale territory. */
  flag: string;
  dir: "ltr" | "rtl";
  countries: string[];
  /**
   * BCP-47 tag for rel="alternate" hreflang, when the bare `code` is wrong.
   *
   * Two of ours are: 'tl' is deprecated in favour of 'fil', and our Chinese
   * copy is Simplified, so bare 'zh' would advertise it to Traditional-script
   * regions as an equal match. The URL keeps the short `code` either way —
   * only the tag Google reads changes.
   */
  hreflang?: string;
}

export const SITE = "https://freeremovebg.com";

export const DEFAULT_LANG = "en";

export const LANGUAGES: Language[] = languagesData as Language[];

export const TARGET_LANGUAGES: Language[] = LANGUAGES.filter(
  (l) => l.code !== DEFAULT_LANG,
);

export const LANG_BY_CODE: Record<string, Language> = Object.fromEntries(
  LANGUAGES.map((l) => [l.code, l]),
);

export const SUPPORTED_CODES: string[] = LANGUAGES.map((l) => l.code);

export const REGION_MAP: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const lang of LANGUAGES) {
    if (lang.code === DEFAULT_LANG) continue;
    for (const country of lang.countries) map[country] = lang.code;
  }
  return map;
})();

export const LANG_COOKIE = "lang";

/** The tag rel="alternate" should carry for a language. */
export function hreflangOf(code: string): string {
  return LANG_BY_CODE[code]?.hreflang ?? code;
}

/**
 * og:locale for a language, as language_TERRITORY.
 *
 * Open Graph wants a territory, not a script, so this stays on the country
 * behind the flag icon (pt_BR, zh_CN) rather than the hreflang tag.
 */
export function ogLocaleOf(code: string): string {
  const lang = LANG_BY_CODE[code] ?? LANG_BY_CODE[DEFAULT_LANG];
  return `${lang.code}_${lang.flag.toUpperCase()}`;
}

export function localizedUrl(code: string, path = "/"): string {
  const clean = path.replace(/^\/+/, "");
  if (code === DEFAULT_LANG) return `${SITE}/${clean}`.replace(/\/+$/, "/");
  return `${SITE}/${code}/${clean}`.replace(/\/+$/, "/");
}

export function langFromPath(pathname: string): Language {
  const seg = pathname.split("/").filter(Boolean)[0];
  return (seg && LANG_BY_CODE[seg]) || LANG_BY_CODE[DEFAULT_LANG];
}
