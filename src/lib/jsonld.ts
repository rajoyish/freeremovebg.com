// One schema.org @graph per page, emitted by Layout.astro. Every node links to
// the others by @id, so search engines read the site, the page, the tool on it
// and its FAQ as one connected description instead of separate fragments.
// The breadcrumb trail stays in Breadcrumb.astro, next to the markup it mirrors.

import { SITE } from '../i18n/config';

export interface FaqItem {
  q: string;
  /** Plain text or the HTML used on the page. */
  a: string;
}

export interface AppSchema {
  name: string;
  featureList: string[];
}

export type PageType = 'WebPage' | 'AboutPage' | 'ContactPage';

interface GraphInput {
  url: string;
  title: string;
  description: string;
  lang: string;
  image: string;
  pageType?: PageType;
  app?: AppSchema | null;
  faq?: FaqItem[];
}

const ORG_ID = `${SITE}/#organization`;
const SITE_ID = `${SITE}/#website`;

/** FAQ answer HTML reduced to the plain text that structured data expects. */
export function faqText(html: string): string {
  return html
    .replace(/<\/p>\s*<p>/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&rarr;/g, '→')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildGraph({
  url, title, description, lang, image, pageType = 'WebPage', app = null, faq = [],
}: GraphInput) {
  const pageId = `${url}#webpage`;
  const appId = `${url}#app`;
  const hasFaq = faq.length > 0;

  // A page with questions is typed as both its own kind and FAQPage, which is
  // how Google reads FAQ rich results off a page that is more than an FAQ.
  const page: Record<string, unknown> = {
    '@type': hasFaq ? [pageType, 'FAQPage'] : pageType,
    '@id': pageId,
    url,
    name: title,
    description,
    inLanguage: lang,
    isPartOf: { '@id': SITE_ID },
    publisher: { '@id': ORG_ID },
    primaryImageOfPage: { '@type': 'ImageObject', url: image },
  };
  if (app) page.about = { '@id': appId };
  if (pageType === 'AboutPage' || pageType === 'ContactPage') page.about = { '@id': ORG_ID };
  if (hasFaq) {
    page.mainEntity = faq.map((item) => ({
      '@type': 'Question',
      name: faqText(item.q),
      acceptedAnswer: { '@type': 'Answer', text: faqText(item.a) },
    }));
  }

  const graph: Record<string, unknown>[] = [
    {
      '@type': 'Organization',
      '@id': ORG_ID,
      name: 'Free Remove BG',
      url: `${SITE}/`,
      logo: { '@type': 'ImageObject', url: `${SITE}/web-app-manifest-512x512.png`, width: 512, height: 512 },
    },
    {
      '@type': 'WebSite',
      '@id': SITE_ID,
      name: 'Free Remove BG',
      url: `${SITE}/`,
      publisher: { '@id': ORG_ID },
    },
    page,
  ];

  if (app) {
    graph.push({
      '@type': 'WebApplication',
      '@id': appId,
      name: app.name,
      url,
      description,
      inLanguage: lang,
      applicationCategory: 'MultimediaApplication',
      operatingSystem: 'Any (web browser)',
      browserRequirements: 'Requires a modern web browser with JavaScript.',
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      featureList: app.featureList,
      publisher: { '@id': ORG_ID },
    });
  }

  return { '@context': 'https://schema.org', '@graph': graph };
}
