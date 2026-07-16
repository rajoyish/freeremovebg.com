// Use-case landing pages.
//
// This file owns *structure* only — the slug (which is also the URL) and the
// display order. All copy lives in src/i18n/en.json under `useCases.items`,
// keyed by slug, and resolves through the same dictionary lookup as every other
// string (src/i18n/locales/<lang>.json, falling back to English on a miss).
//
// Slugs deliberately stay English across languages: they key copy to a route,
// and translating them would fork the URL space for little gain. Localized
// pages, where translations exist, are served at /<lang>/<english-slug>/.
//
// Adding a use case = add the slug here + a matching `useCases.items` entry in
// en.json. Route, sitemap entry, footer link and hreflang cluster all follow
// automatically. Add matching keys to src/i18n/locales/<lang>.json to have the
// page published in that language (see LOCALIZATION.md — coverage gating).

export const USE_CASE_SLUGS = [
  'remove-background-from-product-photos',
  'remove-background-from-signature',
  'remove-background-from-profile-picture',
  'batch-background-removal',
  'remove-background-from-logo',
  'transparent-png-maker',
] as const;

export type UseCaseSlug = (typeof USE_CASE_SLUGS)[number];
