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
