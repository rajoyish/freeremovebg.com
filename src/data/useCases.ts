// Use-case landing pages.
//
// This file owns *structure* only — the slug (which is also the URL) and the
// display order. All copy lives in src/i18n/en.json under `useCases.items`,
// keyed by slug, so it flows through the normal translate.js → locales/*.json
// pipeline like every other string.
//
// Slugs deliberately stay English across languages: they're the cache keys that
// tie copy to a route, and translating them would fork the URL space for little
// gain. Localized pages are served at /<lang>/<english-slug>/.
//
// Adding a use case = add the slug here + a matching `useCases.items` entry in
// en.json, then run `pnpm translate`. Route, sitemap entry, footer link and
// hreflang cluster all follow automatically.

export const USE_CASE_SLUGS = [
  'remove-background-from-product-photos',
  'remove-background-from-signature',
  'remove-background-from-profile-picture',
  'batch-background-removal',
  'remove-background-from-logo',
  'transparent-png-maker',
] as const;

export type UseCaseSlug = (typeof USE_CASE_SLUGS)[number];
