// Localized URL slugs for the use-case landing pages.
//
// Astro's i18n recipe calls this a translated route map, and it is the one
// place where localization shows up in the URL itself rather than only in the
// copy. A Spanish searcher types "quitar fondo logotipo", so
// /es/quitar-fondo-de-logotipo/ matches the query in the slug, the breadcrumb
// and the SERP display URL. /es/remove-background-from-logo/ matches none of
// them and reads as an English page to anyone scanning results.
//
// A language appears here only once its slugs are written. Anything missing
// falls back to the English slug, so adding a language is purely additive and
// can never break a URL that already exists.
//
// Rules for a new entry:
//   - lowercase ASCII, hyphen-separated, no trailing slash
//   - no percent-encoding: non-Latin scripts use romanization (zh uses pinyin)
//     so the URL survives copy-paste, analytics and Search Console intact
//   - once shipped, a slug is permanent — changing it needs a 301 in
//     worker/use-case-redirects.js, which scripts/gen-region-map.mjs generates

import { DEFAULT_LANG } from "./config";
import { USE_CASE_SLUGS, type UseCaseSlug } from "../data/useCases";

export type UseCaseRoutes = Partial<Record<UseCaseSlug, string>>;

export const USE_CASE_ROUTES: Record<string, UseCaseRoutes> = {
  es: {
    "remove-background-from-product-photos": "quitar-fondo-fotos-de-producto",
    "remove-background-from-signature": "quitar-fondo-de-firma",
    "remove-background-from-profile-picture": "quitar-fondo-foto-de-perfil",
    "batch-background-removal": "quitar-fondo-por-lotes",
    "remove-background-from-logo": "quitar-fondo-de-logotipo",
    "transparent-png-maker": "creador-de-png-transparente",
  },
  zh: {
    "remove-background-from-product-photos": "shangpin-tu-quchu-beijing",
    "remove-background-from-signature": "qianming-quchu-beijing",
    "remove-background-from-profile-picture": "touxiang-quchu-beijing",
    "batch-background-removal": "piliang-quchu-beijing",
    "remove-background-from-logo": "logo-quchu-beijing",
    "transparent-png-maker": "touming-png-zhizuo",
  },
};

/** The slug `lang` publishes for a use case. English slug if untranslated. */
export function localizedSlug(lang: string, slug: UseCaseSlug): string {
  if (lang === DEFAULT_LANG) return slug;
  return USE_CASE_ROUTES[lang]?.[slug] ?? slug;
}

/** Reverse of `localizedSlug`, for resolving a route param back to copy. */
export function canonicalSlug(
  lang: string,
  localized: string,
): UseCaseSlug | undefined {
  if (USE_CASE_SLUGS.includes(localized as UseCaseSlug)) {
    return localized as UseCaseSlug;
  }
  const routes = USE_CASE_ROUTES[lang];
  if (!routes) return undefined;
  const hit = Object.entries(routes).find(([, v]) => v === localized);
  return hit?.[0] as UseCaseSlug | undefined;
}

/** Full path for a use case in a language, e.g. '/es/quitar-fondo-de-firma/'. */
export function useCasePath(lang: string, slug: UseCaseSlug): string {
  const prefix = lang === DEFAULT_LANG ? "" : `/${lang}`;
  return `${prefix}/${localizedSlug(lang, slug)}/`;
}

/**
 * Per-language base path for one use case, keyed by language code, in the
 * prefix-less form the layout and the language switcher expect (`/about`,
 * `/quitar-fondo-de-firma`) — both add the `/<lang>` prefix themselves.
 *
 * They need this because a page's URL no longer differs between languages by
 * prefix alone: hreflang has to advertise the slug each language actually
 * publishes, and the switcher has to land on it.
 */
export function useCaseBasePaths(
  langs: string[],
  slug: UseCaseSlug,
): Record<string, string> {
  return Object.fromEntries(
    langs.map((code) => [code, `/${localizedSlug(code, slug)}`]),
  );
}

/**
 * Localized slugs that replaced an English one already served at a /<lang>/
 * URL. Consumed by scripts/gen-region-map.mjs to build the Worker's 301 table
 * so the link equity on the old URL follows the page.
 */
export const RENAMED_USE_CASE_LANGS = ["es", "zh"];
