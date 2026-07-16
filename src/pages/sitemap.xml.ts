import type { APIRoute } from "astro";
import { DEFAULT_LANG, LANGUAGES, SITE } from "../i18n/config";
import { USE_CASE_SLUGS } from "../data/useCases";
import { USE_CASE_LANGS } from "../i18n/dictionaries";

// Prerendered at build time into dist/sitemap.xml. Every deploy rebuilds the
// site, so the build date is an honest <lastmod> for all URLs.
const LASTMOD = new Date().toISOString().split("T")[0];

const homeUrl = (code: string) =>
  code === DEFAULT_LANG ? `${SITE}/` : `${SITE}/${code}/`;

// The full hreflang cluster, shared by every localized home page. Google
// requires each page in the cluster to list all alternates, including itself.
const HOME_ALTERNATES = [
  ...LANGUAGES.map((l) => ({ hreflang: l.code, href: homeUrl(l.code) })),
  { hreflang: "x-default", href: homeUrl(DEFAULT_LANG) },
];

const useCaseUrl = (code: string, slug: string) =>
  code === DEFAULT_LANG ? `${SITE}/${slug}/` : `${SITE}/${code}/${slug}/`;

// A use-case page's cluster spans only the languages it's translated into —
// advertising a URL that was never generated is an hreflang error.
const useCaseAlternates = (slug: string) => [
  ...USE_CASE_LANGS.map((code) => ({
    hreflang: code,
    href: useCaseUrl(code, slug),
  })),
  { hreflang: "x-default", href: useCaseUrl(DEFAULT_LANG, slug) },
];

const STATIC_PAGES = [
  { path: "/about/", changefreq: "monthly", priority: "0.7" },
  { path: "/contact/", changefreq: "monthly", priority: "0.5" },
  { path: "/privacy-policy/", changefreq: "yearly", priority: "0.3" },
  { path: "/terms/", changefreq: "yearly", priority: "0.3" },
];

interface UrlEntry {
  loc: string;
  changefreq: string;
  priority: string;
  alternates?: { hreflang: string; href: string }[];
}

function renderUrl({ loc, changefreq, priority, alternates }: UrlEntry): string {
  const links = (alternates ?? [])
    .map(
      (a) =>
        `    <xhtml:link rel="alternate" hreflang="${a.hreflang}" href="${a.href}"/>`,
    )
    .join("\n");

  return [
    "  <url>",
    `    <loc>${loc}</loc>`,
    links,
    `    <lastmod>${LASTMOD}</lastmod>`,
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority}</priority>`,
    "  </url>",
  ]
    .filter(Boolean)
    .join("\n");
}

const entries: UrlEntry[] = [
  ...LANGUAGES.map((l) => ({
    loc: homeUrl(l.code),
    changefreq: "weekly",
    priority: l.code === DEFAULT_LANG ? "1.0" : "0.9",
    alternates: HOME_ALTERNATES,
  })),
  ...USE_CASE_SLUGS.flatMap((slug) =>
    USE_CASE_LANGS.map((code) => ({
      loc: useCaseUrl(code, slug),
      changefreq: "monthly",
      priority: code === DEFAULT_LANG ? "0.8" : "0.7",
      alternates: useCaseAlternates(slug),
    })),
  ),
  ...STATIC_PAGES.map((p) => ({
    loc: `${SITE}${p.path}`,
    changefreq: p.changefreq,
    priority: p.priority,
  })),
];

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.map(renderUrl).join("\n")}
</urlset>
`;

export const GET: APIRoute = () =>
  new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
