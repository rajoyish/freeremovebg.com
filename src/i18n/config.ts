import languagesData from "./languages.json";

export interface Language {
  code: string;
  endonym: string;
  englishName: string;
  flag: string;
  dir: "ltr" | "rtl";
  countries: string[];
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

export function localizedUrl(code: string, path = "/"): string {
  const clean = path.replace(/^\/+/, "");
  if (code === DEFAULT_LANG) return `${SITE}/${clean}`.replace(/\/+$/, "/");
  return `${SITE}/${code}/${clean}`.replace(/\/+$/, "/");
}

export function langFromPath(pathname: string): Language {
  const seg = pathname.split("/").filter(Boolean)[0];
  return (seg && LANG_BY_CODE[seg]) || LANG_BY_CODE[DEFAULT_LANG];
}
