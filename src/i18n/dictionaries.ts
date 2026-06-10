import en from "./en.json";
import { DEFAULT_LANG } from "./config";

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
