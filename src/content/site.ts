/** The public address of the production site (no trailing slash). Canonical links, the social card, robots.txt and sitemap.xml use it. */
export const PRODUCTION_URL = 'https://ai-spend-tracker.neotixhq.com';

/*
 * Who owns this app. One source for the landing footer, the privacy page, the About card, the app footer and the README.
 * The brand is NeotixHQ; it is legally owned by NuCielo ICT B.V. This is ownership, not a licence: which licence the code is
 * released under is a separate decision (see issue #17), and it does not say who is the data controller (see the privacy page).
 */
export const BRAND = 'NeotixHQ';
export const OWNER = 'NuCielo ICT B.V.';
/** First year of the work. */
export const COPYRIGHT_YEAR = 2026;
export const COPYRIGHT = `© ${COPYRIGHT_YEAR} ${OWNER}`;
/** No full stop of its own: the owner's name ends in one ("B.V."). */
export const OWNERSHIP_LINE = `AI Spending Tracker is a product of ${BRAND}, a brand of ${OWNER}`;
