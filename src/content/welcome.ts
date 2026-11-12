/*
 * The words of the Welcome page: what the app does, how it works, privacy and the questions people ask. One source for the
 * Welcome page in the app (src/pages/Welcome.tsx), the search and social tags in index.html, and the text a browser without
 * scripts sees. The privacy wording comes from ./privacy.ts, so it is identical here, on the privacy page and in the README.
 *
 * There is one page: the app opens on it when the browser has no data, and "About" in the top bar opens it at any time.
 */
import { PRIVACY_SENTENCE } from './privacy.ts';
import { BRAND, BRAND_URL, CONTACT_EMAIL, COPYRIGHT, OWNER, OWNER_URL, OWNERSHIP_LINE } from './site.ts';

/** Where the app lives. */
export const APP_PATH = '/';
/** The same app, started in demo mode with invented data. */
export const DEMO_PATH = `${APP_PATH}?demo=1`;

export const SITE_NAME = 'AI Spending Tracker';
export const HEADLINE = 'What do you spend on AI tools?';
export const SUBHEAD = 'See which providers you pay, which charges are subscriptions, and what is about to renew. Everything stays in your browser.';
export const META_DESCRIPTION =
  'See what you spend on AI tools, which charges are subscriptions, price changes and what renews next. Runs in your browser: your data is never uploaded.';

export const FEATURES: { title: string; text: string }[] = [
  { title: 'Subscriptions the app finds', text: 'Recurring charges found from your statements, with the reasoning one click away, and what ending each subscription would save.' },
  { title: 'Price changes and overlap', text: 'Spot a plan that went from €22 to €109, and several chat assistants you pay for at once.' },
  { title: 'Charge types you can correct', text: 'Every charge is a subscription, usage or one-time. The app guesses and you correct it, for a whole service or a single charge.' },
  { title: 'Budgets, tags and quarterly export', text: 'Set a monthly budget, tag charges Personal or Business, and export a quarter for expense claims.' },
];

export const STEPS: string[] = [
  'Drop in the statements you already download from your bank or card, or a CSV.',
  'Review what the app found. Anything it is unsure about is yours to include or leave out.',
  'Explore your spending. Nothing leaves your browser.',
];

/** The Overview with the demo data, below the buttons on the Welcome page: light, and dark for a browser in dark mode. Files in public/screenshots. */
export const OVERVIEW_SHOT = {
  light: '/screenshots/overview.jpg',
  dark: '/screenshots/overview-dark.jpg',
  alt: 'The Overview page with demo data: this month’s total and month-end estimate, monthly spending by provider as a stacked bar chart, and what is still due this month.',
  width: 1280,
  height: 888,
};

export const FAQ: { q: string; a: string }[] = [
  {
    q: 'Which banks and file formats work?',
    a: 'Excel (.xlsx) or CSV exports from your bank or card, including American Express and common bank CSVs such as Revolut and ING-style files, and Revolut PDF statements. Old .xls files, scanned PDFs and other banks’ PDFs are not read: export a CSV instead. You can also import a CSV that is already in the app’s own format.',
  },
  { q: 'Do I need an account?', a: 'No. There is no account and no backend.' },
  {
    q: 'Where does my data live?',
    a: 'In your browser, on your device, in IndexedDB. It is not synced between devices and it is lost if you clear your browser’s data, so export your transactions as a CSV now and then. The CSV does not hold your budgets, corrections or labels.',
  },
  { q: 'How do I delete it?', a: 'Open Data and choose Clear local data. You can also clear this site’s data in your browser settings.' },
  {
    q: 'Is anything ever sent anywhere?',
    a: 'Only if you press Ask Claude, an optional feature that needs your own Anthropic API key. It sends just the statement lines you choose, straight from your browser to Anthropic. See the privacy statement for exactly what.',
  },
  { q: 'Can I try it without my own data?', a: 'Yes. Explore demo data shows the whole app with invented transactions. Nothing is saved.' },
];

export { PRIVACY_SENTENCE };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Social and search tags. `siteUrl` is the public address (no trailing slash), or empty before a domain
 * exists: then there is no canonical link and no og:image, because both must be absolute URLs.
 */
export function renderWelcomeMeta(siteUrl: string): string {
  const tags = [
    `<meta name="description" content="${esc(META_DESCRIPTION)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${esc(SITE_NAME)}" />`,
    `<meta property="og:title" content="${esc(`${SITE_NAME}: ${HEADLINE}`)}" />`,
    `<meta property="og:description" content="${esc(META_DESCRIPTION)}" />`,
    `<meta name="twitter:card" content="${siteUrl ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${esc(`${SITE_NAME}: ${HEADLINE}`)}" />`,
    `<meta name="twitter:description" content="${esc(META_DESCRIPTION)}" />`,
  ];
  if (siteUrl) {
    tags.push(
      `<link rel="canonical" href="${esc(siteUrl)}/" />`,
      `<meta property="og:url" content="${esc(siteUrl)}/" />`,
      `<meta property="og:image" content="${esc(siteUrl)}/og-image.png" />`,
      `<meta property="og:image:width" content="1200" />`,
      `<meta property="og:image:height" content="630" />`,
      `<meta property="og:image:alt" content="${esc(`${SITE_NAME}: ${HEADLINE}`)}" />`,
      `<meta name="twitter:image" content="${esc(siteUrl)}/og-image.png" />`,
    );
  }
  return tags.join('\n    ');
}

/**
 * What a browser without scripts sees inside index.html (the app needs scripts): the headline, what it is, the privacy sentence and
 * who is behind it. Plain HTML, no scripts.
 */
export function renderNoscript(): string {
  return `<noscript>
  <main style="max-width:640px;margin:0 auto;padding:32px 16px;font-family:system-ui,sans-serif;line-height:1.5">
    <h1>${esc(HEADLINE)}</h1>
    <p>${esc(SUBHEAD)}</p>
    <p><strong>This app needs JavaScript.</strong> ${esc(PRIVACY_SENTENCE)} <a href="/privacy.html">Privacy statement</a></p>
    <ul>
${FEATURES.map((f) => `      <li><strong>${esc(f.title)}.</strong> ${esc(f.text)}</li>`).join('\n')}
    </ul>
    <p><a href="/privacy.html">Privacy statement</a> · <a href="/third-party-notices.txt">Third-party licenses</a> · <a href="mailto:${esc(CONTACT_EMAIL)}">${esc(CONTACT_EMAIL)}</a></p>
    <p>${esc(COPYRIGHT)} · ${esc(OWNERSHIP_LINE).replace(BRAND, `<a href="${esc(BRAND_URL)}" rel="noopener noreferrer">${BRAND}</a>`).replace(OWNER, `<a href="${esc(OWNER_URL)}" rel="noopener noreferrer">${OWNER}</a>`)}</p>
  </main>
</noscript>`;
}
