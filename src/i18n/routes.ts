// URL builders shared by the header, footer and page shells.
//
// Localized routes exist only where the copy is actually translated (see the
// coverage gating in dictionaries.ts). These helpers keep the language prefix
// on every link the visitor's language does have, and fall back to the English
// original rather than linking a URL that was never generated.

import { DEFAULT_LANG } from "./config";
import { hasPageTranslations, hasUseCaseTranslations } from "./dictionaries";
import { localizedSlug } from "./slugs";
import type { UseCaseSlug } from "../data/useCases";

/** '' for English, '/es' for Spanish. */
export const langPrefix = (lang: string): string =>
  lang === DEFAULT_LANG ? "" : `/${lang}`;

/** Home page for a language: '/' or '/es/'. */
export const homeHref = (lang: string): string =>
  lang === DEFAULT_LANG ? "/" : `/${lang}/`;

/**
 * about / contact / privacy-policy / terms. `path` is the English route without
 * a trailing slash, e.g. '/about'. trailingSlash: 'always' — a link without the
 * slash costs a 301 in production and 404s in dev.
 */
export const pageHref = (lang: string, path: string): string =>
  `${hasPageTranslations(lang) ? langPrefix(lang) : ""}${path}/`;

/**
 * Use-case landing page for a slug.
 *
 * A language that has the translation gets both its prefix and its own slug
 * (/es/quitar-fondo-de-firma/); one that doesn't gets the English page at the
 * English slug, since that is the only version of the page that exists.
 */
export const useCaseHref = (lang: string, slug: UseCaseSlug): string =>
  hasUseCaseTranslations(lang)
    ? `${langPrefix(lang)}/${localizedSlug(lang, slug)}/`
    : `/${slug}/`;
