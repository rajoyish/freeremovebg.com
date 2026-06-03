#!/usr/bin/env node
/**
 * Generates public/sitemap.xml from src/i18n/languages.json.
 *
 * The home page is emitted once per language with full xhtml:link hreflang
 * alternates (plus x-default), which is the SEO-correct way to declare a set of
 * localized equivalents. Static English-only pages are listed plainly.
 *
 * Run via `pnpm i18n:sitemap` (also part of prebuild).
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SITE = "https://freeremovebg.com";
const DEFAULT_LANG = "en";

const languages = JSON.parse(
  await readFile(resolve(ROOT, "src/i18n/languages.json"), "utf8"),
);

const homeUrl = (code) => (code === DEFAULT_LANG ? `${SITE}/` : `${SITE}/${code}/`);

// Shared alternate block for the localized home-page set.
const alternates = [
  ...languages.map(
    (l) => `      <xhtml:link rel="alternate" hreflang="${l.code}" href="${homeUrl(l.code)}" />`,
  ),
  `      <xhtml:link rel="alternate" hreflang="x-default" href="${homeUrl(DEFAULT_LANG)}" />`,
].join("\n");

const homeEntries = languages
  .map(
    (l) => `  <url>
    <loc>${homeUrl(l.code)}</loc>
${alternates}
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>`,
  )
  .join("\n");

const staticPages = [
  { path: "/about", changefreq: "monthly", priority: "0.7" },
  { path: "/contact", changefreq: "monthly", priority: "0.5" },
  { path: "/privacy-policy", changefreq: "yearly", priority: "0.3" },
  { path: "/terms", changefreq: "yearly", priority: "0.3" },
]
  .map(
    (p) => `  <url>
    <loc>${SITE}${p.path}</loc>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`,
  )
  .join("\n");

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${homeEntries}
${staticPages}
</urlset>
`;

await writeFile(resolve(ROOT, "public/sitemap.xml"), xml, "utf8");
console.log("✅ Wrote public/sitemap.xml");
