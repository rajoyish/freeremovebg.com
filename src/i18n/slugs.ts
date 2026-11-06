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
  te: {
    "remove-background-from-product-photos": "utpatti-photo-nepathyam-tolaginchandi",
    "remove-background-from-signature": "santakam-nepathyam-tolaginchandi",
    "remove-background-from-profile-picture": "profile-photo-nepathyam-tolaginchandi",
    "batch-background-removal": "okesari-nepathyalu-tolaginchandi",
    "remove-background-from-logo": "logo-nepathyam-tolaginchandi",
    "transparent-png-maker": "paradarsaka-png-tayari",
  },
  mr: {
    "remove-background-from-product-photos": "utpadan-photo-parshvabhumi-kadha",
    "remove-background-from-signature": "swakshari-parshvabhumi-kadha",
    "remove-background-from-profile-picture": "profile-photo-parshvabhumi-kadha",
    "batch-background-removal": "ekatra-parshvabhumi-kadha",
    "remove-background-from-logo": "logo-parshvabhumi-kadha",
    "transparent-png-maker": "paradarshak-png-tayar-kara",
  },
  ur: {
    "remove-background-from-product-photos": "product-tasveer-background-hatayen",
    "remove-background-from-signature": "dastakhat-background-hatayen",
    "remove-background-from-profile-picture": "profile-tasveer-background-hatayen",
    "batch-background-removal": "kai-tasveeron-background-hatayen",
    "remove-background-from-logo": "logo-background-hatayen",
    "transparent-png-maker": "shaffaf-png-banayen",
  },
  ta: {
    "remove-background-from-product-photos": "thayarippu-pada-pinnani-neekkam",
    "remove-background-from-signature": "kaiyoppam-pinnani-neekkam",
    "remove-background-from-profile-picture": "suyavivara-pada-pinnani-neekkam",
    "batch-background-removal": "thoguppaga-pinnani-neekkam",
    "remove-background-from-logo": "ilachinai-pinnani-neekkam",
    "transparent-png-maker": "olipugum-png-uruvakki",
  },
  lv: {
    "remove-background-from-product-photos": "produktu-foto-fona-nonemsana",
    "remove-background-from-signature": "paraksta-fona-nonemsana",
    "remove-background-from-profile-picture": "profila-attela-fona-nonemsana",
    "batch-background-removal": "attelu-grupas-fona-nonemsana",
    "remove-background-from-logo": "logotipa-fona-nonemsana",
    "transparent-png-maker": "caurspidiga-png-veidosana",
  },
  et: {
    "remove-background-from-product-photos": "tootefotode-tausta-eemaldamine",
    "remove-background-from-signature": "allkirja-tausta-eemaldamine",
    "remove-background-from-profile-picture": "profiilipildi-tausta-eemaldamine",
    "batch-background-removal": "tausta-eemaldamine-hulgi",
    "remove-background-from-logo": "logo-tausta-eemaldamine",
    "transparent-png-maker": "labipaistva-png-loomine",
  },
  lt: {
    "remove-background-from-product-photos": "produktu-nuotrauku-fono-salinimas",
    "remove-background-from-signature": "paraso-fono-salinimas",
    "remove-background-from-profile-picture": "profilio-nuotraukos-fono-salinimas",
    "batch-background-removal": "grupinis-fono-salinimas",
    "remove-background-from-logo": "logotipo-fono-salinimas",
    "transparent-png-maker": "skaidraus-png-kurimas",
  },
  sl: {
    "remove-background-from-product-photos": "odstranjevanje-ozadja-izdelkov",
    "remove-background-from-signature": "odstranjevanje-ozadja-podpisa",
    "remove-background-from-profile-picture": "odstranjevanje-ozadja-profilne-slike",
    "batch-background-removal": "paketno-odstranjevanje-ozadja",
    "remove-background-from-logo": "odstranjevanje-ozadja-logotipa",
    "transparent-png-maker": "izdelava-prosojnega-png",
  },
  hr: {
    "remove-background-from-product-photos": "uklanjanje-pozadine-proizvoda",
    "remove-background-from-signature": "uklanjanje-pozadine-potpisa",
    "remove-background-from-profile-picture": "uklanjanje-pozadine-profilne-slike",
    "batch-background-removal": "skupno-uklanjanje-pozadine",
    "remove-background-from-logo": "uklanjanje-pozadine-logotipa",
    "transparent-png-maker": "izrada-prozirnog-png",
  },
  sr: {
    "remove-background-from-product-photos": "uklanjanje-pozadine-proizvoda",
    "remove-background-from-signature": "uklanjanje-pozadine-potpisa",
    "remove-background-from-profile-picture": "uklanjanje-pozadine-profilne-slike",
    "batch-background-removal": "grupno-uklanjanje-pozadine",
    "remove-background-from-logo": "uklanjanje-pozadine-logotipa",
    "transparent-png-maker": "izrada-providnog-png",
  },
  sk: {
    "remove-background-from-product-photos": "odstranenie-pozadia-produktovych-fotiek",
    "remove-background-from-signature": "odstranenie-pozadia-podpisu",
    "remove-background-from-profile-picture": "odstranenie-pozadia-profilovej-fotky",
    "batch-background-removal": "hromadne-odstranenie-pozadia",
    "remove-background-from-logo": "odstranenie-pozadia-loga",
    "transparent-png-maker": "tvorba-priehladneho-png",
  },
  bg: {
    "remove-background-from-product-photos": "premahvane-fon-produktovi-snimki",
    "remove-background-from-signature": "premahvane-fon-podpis",
    "remove-background-from-profile-picture": "premahvane-fon-profilna-snimka",
    "batch-background-removal": "grupovo-premahvane-fon",
    "remove-background-from-logo": "premahvane-fon-logo",
    "transparent-png-maker": "sazdavane-prozrachen-png",
  },
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
  nl: {
    "remove-background-from-product-photos": "achtergrond-verwijderen-productfoto",
    "remove-background-from-signature": "achtergrond-verwijderen-handtekening",
    "remove-background-from-profile-picture": "achtergrond-verwijderen-profielfoto",
    "batch-background-removal": "achtergronden-verwijderen-batch",
    "remove-background-from-logo": "achtergrond-verwijderen-logo",
    "transparent-png-maker": "transparante-png-maken",
  },
  fa: {
    "remove-background-from-product-photos": "hazf-pas-zamineh-aks-mahsool",
    "remove-background-from-signature": "hazf-pas-zamineh-emza",
    "remove-background-from-profile-picture": "hazf-pas-zamineh-aks-profile",
    "batch-background-removal": "hazf-pas-zamineh-goroohi",
    "remove-background-from-logo": "hazf-pas-zamineh-logo",
    "transparent-png-maker": "sakht-aks-bedoon-pas-zamineh",
  },
  uk: {
    "remove-background-from-product-photos": "vydalyty-fon-foto-tovariv",
    "remove-background-from-signature": "vydalyty-fon-pidpysu",
    "remove-background-from-profile-picture": "vydalyty-fon-foto-profilyu",
    "batch-background-removal": "paketne-vydalennya-fonu",
    "remove-background-from-logo": "vydalyty-fon-logotypa",
    "transparent-png-maker": "stvoryuvach-prozorykh-png",
  },
  tl: {
    "remove-background-from-product-photos": "alisin-background-larawan-produkto",
    "remove-background-from-signature": "alisin-background-lagda",
    "remove-background-from-profile-picture": "alisin-background-profile-picture",
    "batch-background-removal": "maramihang-pag-alis-background",
    "remove-background-from-logo": "alisin-background-logo",
    "transparent-png-maker": "gumagawa-transparent-png",
  },
  ro: {
    "remove-background-from-product-photos": "eliminare-fundal-fotografii-produs",
    "remove-background-from-signature": "eliminare-fundal-semnatura",
    "remove-background-from-profile-picture": "eliminare-fundal-poza-profil",
    "batch-background-removal": "eliminare-fundal-in-lot",
    "remove-background-from-logo": "eliminare-fundal-logo",
    "transparent-png-maker": "creator-png-transparent",
  },
  el: {
    "remove-background-from-product-photos": "afairesi-fontou-proionton",
    "remove-background-from-signature": "afairesi-fontou-ypografis",
    "remove-background-from-profile-picture": "afairesi-fontou-profil",
    "batch-background-removal": "omadiki-afairesi-fontou",
    "remove-background-from-logo": "afairesi-fontou-logotypou",
    "transparent-png-maker": "dimiourgos-diafanous-png",
  },
  hu: {
    "remove-background-from-product-photos": "termekfotok-hatterenek-eltavolitasa",
    "remove-background-from-signature": "alairas-hatterenek-eltavolitasa",
    "remove-background-from-profile-picture": "profilkep-hatterenek-eltavolitasa",
    "batch-background-removal": "kotegelt-hatter-eltavolitas",
    "remove-background-from-logo": "logo-hatterenek-eltavolitasa",
    "transparent-png-maker": "atlatszo-png-keszito",
  },
  sv: {
    "remove-background-from-product-photos": "ta-bort-bakgrund-produktfoton",
    "remove-background-from-signature": "ta-bort-bakgrund-signatur",
    "remove-background-from-profile-picture": "ta-bort-bakgrund-profilbild",
    "batch-background-removal": "batch-bakgrundsborttagning",
    "remove-background-from-logo": "ta-bort-bakgrund-logotyp",
    "transparent-png-maker": "transparent-png-skapare",
  },
  cs: {
    "remove-background-from-product-photos": "odstranit-pozadi-z-produktovych-fotek",
    "remove-background-from-signature": "odstranit-pozadi-z-podpisu",
    "remove-background-from-profile-picture": "odstranit-pozadi-z-profilove-fotky",
    "batch-background-removal": "hromadne-odstraneni-pozadi",
    "remove-background-from-logo": "odstranit-pozadi-z-loga",
    "transparent-png-maker": "nastroj-na-pruhledne-png",
  },
  he: {
    "remove-background-from-product-photos": "hasarat-reka-mitziloomei-mutzarim",
    "remove-background-from-signature": "hasarat-reka-mechatima",
    "remove-background-from-profile-picture": "hasarat-reka-mitmunat-profil",
    "batch-background-removal": "hasarat-reka-kvutzatit",
    "remove-background-from-logo": "hasarat-reka-milogo",
    "transparent-png-maker": "yotzer-png-shakuf",
  },
  ms: {
    "remove-background-from-product-photos": "buang-latar-belakang-gambar-produk",
    "remove-background-from-signature": "buang-latar-belakang-tandatangan",
    "remove-background-from-profile-picture": "buang-latar-belakang-gambar-profil",
    "batch-background-removal": "buang-latar-belakang-berkelompok",
    "remove-background-from-logo": "buang-latar-belakang-logo",
    "transparent-png-maker": "pembuat-png-telus",
  },
  bn: {
    "remove-background-from-product-photos": "product-er-chobi-theke-background-muchun",
    "remove-background-from-signature": "shakkhor-theke-background-remove-korun",
    "remove-background-from-profile-picture": "profile-picture-theke-background-remove-korun",
    "batch-background-removal": "batch-background-removal",
    "remove-background-from-logo": "logo-theke-background-remove-korun",
    "transparent-png-maker": "transparent-png-maker",
  },
  da: {
    "remove-background-from-product-photos": "fjern-baggrund-produktfotos",
    "remove-background-from-signature": "fjern-baggrund-signatur",
    "remove-background-from-profile-picture": "fjern-baggrund-profilbillede",
    "batch-background-removal": "batch-fjernelse-baggrund",
    "remove-background-from-logo": "fjern-baggrund-logo",
    "transparent-png-maker": "gennemsigtig-png-skaber",
  },
  fi: {
    "remove-background-from-product-photos": "poista-tausta-tuotekuvista",
    "remove-background-from-signature": "poista-tausta-allekirjoituksesta",
    "remove-background-from-profile-picture": "poista-tausta-profiilikuvasta",
    "batch-background-removal": "erataustanpoisto",
    "remove-background-from-logo": "poista-tausta-logosta",
    "transparent-png-maker": "lapinakyva-png-tyokalu",
  },
  no: {
    "remove-background-from-product-photos": "fjern-bakgrunn-fra-produktbilder",
    "remove-background-from-signature": "fjern-bakgrunn-fra-signatur",
    "remove-background-from-profile-picture": "fjern-bakgrunn-fra-profilbilde",
    "batch-background-removal": "batch-bakgrunnsfjerning",
    "remove-background-from-logo": "fjern-bakgrunn-fra-logo",
    "transparent-png-maker": "gjennomsiktig-png-maker",
  },
  gu: {
    "remove-background-from-product-photos": "product-photo-background-hatavo",
    "remove-background-from-signature": "sahi-background-dur-karo",
    "remove-background-from-profile-picture": "profile-photo-background-hatavo",
    "batch-background-removal": "ghana-photo-background-hatavo",
    "remove-background-from-logo": "logo-background-dur-karo",
    "transparent-png-maker": "paradarshak-png-banavo",
  },
  pa: {
    "remove-background-from-product-photos": "product-photo-background-hatao",
    "remove-background-from-signature": "dastkhat-background-hatao",
    "remove-background-from-profile-picture": "profile-photo-background-hatao",
    "batch-background-removal": "kai-photo-background-hatao",
    "remove-background-from-logo": "logo-background-hatao",
    "transparent-png-maker": "paradarshi-png-banao",
  },
  ne: {
    "remove-background-from-product-photos": "product-photo-background-hataune",
    "remove-background-from-signature": "hastakshar-background-hataune",
    "remove-background-from-profile-picture": "profile-photo-background-hataune",
    "batch-background-removal": "dherai-photo-background-hataune",
    "remove-background-from-logo": "logo-background-hataune",
    "transparent-png-maker": "paradarshi-png-banaune",
  },
  af: {
    "remove-background-from-product-photos": "verwyder-produkfoto-agtergrond",
    "remove-background-from-signature": "verwyder-handtekening-agtergrond",
    "remove-background-from-profile-picture": "verwyder-profielfoto-agtergrond",
    "batch-background-removal": "verwyder-agtergronde-in-groepe",
    "remove-background-from-logo": "verwyder-logo-agtergrond",
    "transparent-png-maker": "maak-deursigtige-png",
  },
  ca: {
    "remove-background-from-product-photos": "treure-fons-fotos-productes",
    "remove-background-from-signature": "treure-fons-signatura",
    "remove-background-from-profile-picture": "treure-fons-foto-perfil",
    "batch-background-removal": "eliminar-fons-en-lots",
    "remove-background-from-logo": "treure-fons-logotip",
    "transparent-png-maker": "crear-png-transparent",
  },
  sw: {
    "remove-background-from-product-photos": "ondoa-mandharinyuma-picha-bidhaa",
    "remove-background-from-signature": "ondoa-mandharinyuma-sahihi",
    "remove-background-from-profile-picture": "ondoa-mandharinyuma-picha-wasifu",
    "batch-background-removal": "ondoa-mandharinyuma-kwa-makundi",
    "remove-background-from-logo": "ondoa-mandharinyuma-nembo",
    "transparent-png-maker": "tengeneza-png-yenye-uwazi",
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
