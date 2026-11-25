/** The public address of the production site (no trailing slash). Canonical links, the social card, robots.txt and sitemap.xml use it. */
export const PRODUCTION_URL = 'https://ai-spend-tracker.neotixhq.com';

/*
 * Who owns this app. One source for the landing footer, the privacy page, the About card, the app footer and the README.
 * The brand is NeotixHQ; it is legally owned by NuCielo ICT B.V. The code is released under the Apache License 2.0 (LICENSE, NOTICE, "license" in
 * package.json): ownership stays with the company, and the licence does not cover the NeotixHQ name or logo.
 * NuCielo ICT B.V. is the only legal entity. NeotixHQ is a brand of it, not a separate legal entity, so the company is the
 * party that is responsible (the data controller named on the privacy page), trading as NeotixHQ.
 */
export const BRAND = 'NeotixHQ';
export const OWNER = 'NuCielo ICT B.V.';
/** The public source code. Linked from the Welcome page, the About card, the app footer and the no-script text. */
export const REPO_URL = 'https://github.com/onahum2023/ai-spending-tracker';
/** The two company websites. */
export const BRAND_URL = 'https://neotixhq.com/';
export const OWNER_URL = 'https://nucielo.io/';
/** First year of the work. */
export const COPYRIGHT_YEAR = 2026;
/** How the company is named where it is the responsible party. */
export const TRADING_AS = `${OWNER}, trading as ${BRAND}`;
/** Where people reach the company about this app (privacy questions included). */
export const CONTACT_EMAIL = 'info@neotixhq.com';
export const BRAND_NOTE = `${BRAND} is a brand, not a separate legal entity.`;
export const COPYRIGHT = `© ${COPYRIGHT_YEAR} ${OWNER}`;
/** No full stop of its own: the owner's name ends in one ("B.V."). */
export const OWNERSHIP_LINE = `AI Spending Tracker is a product of ${BRAND}, a brand of ${OWNER}`;

/**
 * sitemap.xml for the pages that may be indexed: the app at "/" and, once it is no longer a draft, the privacy statement.
 * `lastmod` is the date of the last change to the page's own content (from git at build time), so it only moves when the page does.
 */
export function renderSitemap(siteUrl: string, pages: { path: string; lastmod?: string }[]): string {
  const url = siteUrl.replace(/\/+$/, '');
  const entries = pages.map((p) => `  <url><loc>${url}${p.path}</loc>${p.lastmod ? `<lastmod>${p.lastmod}</lastmod>` : ''}</url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`;
}
