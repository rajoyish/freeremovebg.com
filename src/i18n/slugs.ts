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
  ar: {
    "remove-background-from-product-photos": "izalat-khalfiyat-suwar-al-muntajat",
    "remove-background-from-signature": "izalat-khalfiyat-al-tawqia",
    "remove-background-from-profile-picture": "izalat-khalfiyat-al-sura-al-shakhsiya",
    "batch-background-removal": "izalat-al-khalfiya-bil-jumla",
    "remove-background-from-logo": "izalat-khalfiyat-al-shiar",
    "transparent-png-maker": "sani-png-shafaf",
  },
  id: {
    "remove-background-from-product-photos": "hapus-latar-belakang-foto-produk",
    "remove-background-from-signature": "hapus-latar-belakang-tanda-tangan",
    "remove-background-from-profile-picture": "hapus-latar-belakang-foto-profil",
    "batch-background-removal": "penghapusan-latar-belakang-massal",
    "remove-background-from-logo": "hapus-latar-belakang-logo",
    "transparent-png-maker": "pembuat-png-transparan",
  },
  pt: {
    "remove-background-from-product-photos": "remover-fundo-fotos-de-produtos",
    "remove-background-from-signature": "remover-fundo-de-assinatura",
    "remove-background-from-profile-picture": "remover-fundo-foto-de-perfil",
    "batch-background-removal": "remocao-de-fundo-em-lote",
    "remove-background-from-logo": "remover-fundo-de-logotipo",
    "transparent-png-maker": "criador-de-png-transparente",
  },
  fr: {
    "remove-background-from-product-photos": "supprimer-fond-photos-de-produits",
    "remove-background-from-signature": "enlever-fond-de-signature",
    "remove-background-from-profile-picture": "supprimer-fond-photo-de-profil",
    "batch-background-removal": "suppression-de-fond-par-lots",
    "remove-background-from-logo": "enlever-fond-de-logo",
    "transparent-png-maker": "createur-de-png-transparent",
  },
  ja: {
    "remove-background-from-product-photos": "shouhin-shashin-haikei-touka",
    "remove-background-from-signature": "shomei-haikei-touka",
    "remove-background-from-profile-picture": "profile-gazo-haikei-touka",
    "batch-background-removal": "ikkatsu-haikei-touka",
    "remove-background-from-logo": "logo-haikei-touka",
    "transparent-png-maker": "toumei-png-sakusei",
  },
  ru: {
    "remove-background-from-product-photos": "udalit-fon-s-foto-tovarov",
    "remove-background-from-signature": "udalit-fon-s-podpisi",
    "remove-background-from-profile-picture": "udalit-fon-s-foto-profilya",
    "batch-background-removal": "massovoe-udalenie-fona",
    "remove-background-from-logo": "udalit-fon-s-logotipa",
    "transparent-png-maker": "sozdat-prozrachnyy-png",
  },
  de: {
    "remove-background-from-product-photos": "hintergrund-von-produktfotos-entfernen",
    "remove-background-from-signature": "hintergrund-von-unterschrift-entfernen",
    "remove-background-from-profile-picture": "hintergrund-von-profilbild-entfernen",
    "batch-background-removal": "stapelverarbeitung-hintergrund-entfernen",
    "remove-background-from-logo": "hintergrund-von-logo-entfernen",
    "transparent-png-maker": "transparentes-png-erstellen",
  },
  hi: {
    "remove-background-from-product-photos": "product-photo-background-hataye",
    "remove-background-from-signature": "signature-background-hataye",
    "remove-background-from-profile-picture": "profile-photo-background-hataye",
    "batch-background-removal": "ek-saath-background-hataye",
    "remove-background-from-logo": "logo-background-hataye",
    "transparent-png-maker": "transparent-png-banaye",
  },
  ko: {
    "remove-background-from-product-photos": "jepeum-sajin-baegyeong-jegeo",
    "remove-background-from-signature": "seomyeong-baegyeong-jegeo",
    "remove-background-from-profile-picture": "peuropil-sajin-baegyeong-jegeo",
    "batch-background-removal": "ilgwal-baegyeong-jegeo",
    "remove-background-from-logo": "rogo-baegyeong-jegeo",
    "transparent-png-maker": "tumyeong-png-meikeo",
  },
  tr: {
    "remove-background-from-product-photos": "urun-fotografi-arka-plan-silme",
    "remove-background-from-signature": "imzadan-arka-plan-silme",
    "remove-background-from-profile-picture": "profil-resmi-arka-plan-silme",
    "batch-background-removal": "toplu-arka-plan-kaldirma",
    "remove-background-from-logo": "logodan-arka-plan-silme",
    "transparent-png-maker": "seffaf-png-olusturucu",
  },
  it: {
    "remove-background-from-product-photos": "rimuovi-sfondo-foto-prodotti",
    "remove-background-from-signature": "rimuovi-sfondo-firma",
    "remove-background-from-profile-picture": "rimuovi-sfondo-foto-profilo",
    "batch-background-removal": "rimozione-sfondo-batch",
    "remove-background-from-logo": "rimuovi-sfondo-logo",
    "transparent-png-maker": "creatore-png-trasparente",
  },
  vi: {
    "remove-background-from-product-photos": "xoa-phong-nen-anh-san-pham",
    "remove-background-from-signature": "xoa-phong-nen-chu-ky",
    "remove-background-from-profile-picture": "xoa-phong-nen-anh-ho-so",
    "batch-background-removal": "xoa-phong-nen-hang-loat",
    "remove-background-from-logo": "xoa-phong-nen-logo",
    "transparent-png-maker": "tao-png-trong-suot",
  },
  pl: {
    "remove-background-from-product-photos": "usuwanie-tla-ze-zdjec-produktow",
    "remove-background-from-signature": "usuwanie-tla-z-podpisu",
    "remove-background-from-profile-picture": "usuwanie-tla-ze-zdjecia-profilowego",
    "batch-background-removal": "grupowe-usuwanie-tla",
    "remove-background-from-logo": "usuwanie-tla-z-logo",
    "transparent-png-maker": "generator-przezroczystych-png",
  },
  th: {
    "remove-background-from-product-photos": "lop-phuen-lang-sinkha",
    "remove-background-from-signature": "lop-phuen-lang-laisen",
    "remove-background-from-profile-picture": "lop-phuen-lang-rup-profile",
    "batch-background-removal": "lop-phuen-lang-lai-rup",
    "remove-background-from-logo": "lop-phuen-lang-logo",
    "transparent-png-maker": "tham-phuen-lang-sai",
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
