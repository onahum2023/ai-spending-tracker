/*
 * The words of the Welcome page: what the app does, how it works, privacy and the questions people ask. One source for the
 * Welcome page in the app (src/pages/Welcome.tsx), the search and social tags in index.html, and the text a browser without
 * scripts sees. The privacy wording comes from ./privacy.ts, so it is identical here, on the privacy page and in the README.
 *
 * There is one page: the app opens on it when the browser has no data, and "About" in the top bar opens it at any time.
 */
import { PRIVACY_SENTENCE } from './privacy.ts';
import { BRAND, BRAND_URL, CONTACT_EMAIL, COPYRIGHT, OWNER, OWNER_URL, OWNERSHIP_LINE, REPO_URL } from './site.ts';

/** Where the app lives. */
export const APP_PATH = '/';
/** The same app, started in demo mode with invented data. */
export const DEMO_PATH = `${APP_PATH}?demo=1`;

export const SITE_NAME = 'AI Spending Tracker';
/** The title of the page in search results: the words people search for ("AI subscription tracker", free) and what it does. */
export const PAGE_TITLE = 'Free AI Subscription Tracker: find what you pay for AI tools';
/** Small, secondary, above the headline: who the page is for. */
export const EYEBROW = "For people who've tried a lot of AI tools";
export const HEADLINE = "Do you know what you're still paying for?";
export const SUBHEAD = 'A free, open-source dashboard that shows every AI service on your statements, what each one costs you, and which ones you forgot about. Nothing leaves your browser.';
/** The short name of what the app is, for the title of a shared link. */
export const SHARE_TITLE = 'What do you spend on AI tools?';
export const TRUST_LINE = 'No account. No upload.';
/** The trust line as three short pills under the hero's buttons. */
export const TRUST_PILLS: { text: string; icon: 'check' | 'user' | 'cloud' | 'code'; href?: string }[] = [
  { text: 'Free', icon: 'check' },
  { text: 'No account', icon: 'user' },
  { text: 'No upload', icon: 'cloud' },
  { text: 'Open source', icon: 'code', href: REPO_URL },
];

/** The hero's example: four lines of a card statement as the bank prints them, and what the app reads in each. Invented. */
export const STATEMENT_EXAMPLE: { date: string; provider: string; text: string; amount: string; note: { kind: 'rise' | 'overlap' | 'inferred'; pill: string; text: string; was?: string } }[] = [
  { date: '15 NOV', provider: 'OpenAI', text: 'OPENAI *CHATGPT SUBSCR', amount: '110.13', note: { kind: 'rise', pill: '×4.8', text: 'until June', was: '€22.80' } },
  { date: '09 NOV', provider: 'Cursor', text: 'CURSOR AI POWERED IDE', amount: '18.73', note: { kind: 'overlap', pill: 'Overlap', text: 'one of 3 coding tools, €53.35 a month together' } },
  { date: '05 NOV', provider: 'GitHub', text: 'GITHUB INC COPILOT', amount: '9.62', note: { kind: 'overlap', pill: 'Overlap', text: 'with Cursor and Lovable' } },
  { date: '12 NOV', provider: 'Supabase', text: 'SUPABASE SINGAPORE', amount: '22.80', note: { kind: 'inferred', pill: 'App’s guess', text: 'monthly since April, around the 12th' } },
];

/** "Sound familiar?": three short lines, no icons. */
export const FAMILIAR: string[] = [
  "You signed up to try one thing. You're still paying for it.",
  'Two assistants that do the same job, both on monthly plans.',
  'A plan quietly doubled, and you found out three months later.',
];

/** One plain line under each of the three example insights, in the order they appear. */
export const EXAMPLE_LINES: string[] = [
  'Your monthly AI total, and where it is heading by the end of the month.',
  'A plan that changed price is flagged the month it happens, not three months later.',
  'Two services doing the same job, and what ending one would save you.',
];

export const PRIVACY_TITLE = 'Your statements never leave your browser.';
export const PRIVACY_LINES: string[] = [
  'Files are read, stored and analysed on your device. There is no account, no backend and no tracking.',
  'The one optional exception is Ask Claude: with your own Anthropic API key it sends only the statement lines you choose, straight from your browser to Anthropic.',
];

export const CLOSING_TITLE = "See what you're really paying for.";
export const META_DESCRIPTION =
  'Free, open-source AI subscription tracker. Finds your AI charges in your bank statements and flags price jumps and overlaps. Runs in your browser, no upload.';

/** Six feature cards, three over three. Each colour is what that idea is in the app (see tokens.css). */
export const FEATURES: { title: string; text: string; tone: 'accent' | 'rise' | 'overlap' | 'saving' | 'amber' | 'teal'; icon: 'repeat' | 'trend' | 'layers' | 'piggy' | 'check' | 'tag' }[] = [
  { title: 'Subscriptions, found for you', text: 'Recurring AI charges are picked out of your statements, with the reasoning one click away.', tone: 'accent', icon: 'repeat' },
  { title: 'Price jumps, flagged', text: 'A plan that went from €22 to €110 stands out the month it happens, not three months later.', tone: 'rise', icon: 'trend' },
  { title: 'Tools you pay for twice', text: 'Two chat assistants or three coding tools at once? Overlaps are grouped, with what they cost together.', tone: 'overlap', icon: 'layers' },
  { title: 'What ending one would save', text: 'Every subscription shows its cost per year, so you can see what cancelling it is worth.', tone: 'saving', icon: 'piggy' },
  { title: 'Guesses you fix in one click', text: 'Subscription, usage or one-time: the app’s guess is outlined until you confirm it or pick another.', tone: 'amber', icon: 'check' },
  { title: 'Budgets, tags and export', text: 'A monthly budget against the month-end estimate, Personal or Business tags, and a quarter exported for expenses.', tone: 'teal', icon: 'tag' },
];

/** Where your data goes, and where it doesn't: four steps, the last crossed out. */
export const PRIVACY_FLOW: { title: string; text: string; icon: 'file' | 'browser' | 'disk' | 'server'; none?: boolean }[] = [
  { title: 'Your statement', text: 'A CSV, Excel or PDF from your bank', icon: 'file' },
  { title: 'Read in your browser', text: 'On your device, by this page', icon: 'browser' },
  { title: 'Stored in this browser', text: 'Clear it whenever you like', icon: 'disk' },
  { title: 'Our servers', text: 'There are none', icon: 'server', none: true },
];

export const STEPS: { title: string; text: string }[] = [
  { title: 'Bring your bank or card statements', text: 'The CSV, Excel or PDF files you already download.' },
  { title: 'The app finds your AI services', text: 'Each charge is explained. Anything it is unsure about is yours to keep or leave out.' },
  { title: 'See where the money goes', text: 'Subscriptions, price jumps, overlaps and trends.' },
];

/** Short answers, shown open: the page should not read like the app's documentation. */
export const FAQ: { q: string; a: string }[] = [
  { q: 'Which banks work?', a: 'Excel or CSV exports from most banks and cards, including American Express, and Revolut PDF statements. For other PDFs, export a CSV.' },
  { q: 'Do I need an account?', a: 'No. There is no account and no backend.' },
  { q: 'Where is my data kept?', a: 'In this browser, on this device. It is not synced, so export a CSV now and then.' },
  { q: 'How do I delete it?', a: 'Open Data and choose Clear local data, or clear this site’s data in your browser.' },
  { q: 'Is anything ever sent?', a: 'Only if you press Ask Claude, with your own Anthropic API key, and only the lines you pick.' },
  { q: 'Can I just look around?', a: 'Yes. The demo shows the whole app with invented charges. Nothing is saved.' },
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
    `<meta property="og:title" content="${esc(`${SITE_NAME}: ${SHARE_TITLE}`)}" />`,
    `<meta property="og:description" content="${esc(META_DESCRIPTION)}" />`,
    `<meta name="twitter:card" content="${siteUrl ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${esc(`${SITE_NAME}: ${SHARE_TITLE}`)}" />`,
    `<meta name="twitter:description" content="${esc(META_DESCRIPTION)}" />`,
  ];
  if (siteUrl) {
    tags.push(
      `<link rel="canonical" href="${esc(siteUrl)}/" />`,
      `<meta property="og:url" content="${esc(siteUrl)}/" />`,
      `<meta property="og:image" content="${esc(siteUrl)}/og-image.png" />`,
      `<meta property="og:image:width" content="1200" />`,
      `<meta property="og:image:height" content="630" />`,
      `<meta property="og:image:alt" content="${esc(`${SITE_NAME}: ${SHARE_TITLE}`)}" />`,
      `<meta name="twitter:image" content="${esc(siteUrl)}/og-image.png" />`,
    );
  }
  tags.push(`<script type="application/ld+json">${renderStructuredData(siteUrl)}</script>`);
  return tags.join('\n    ');
}

/**
 * schema.org data for search engines: the app as free software and its questions. A data block, not a script that runs, so the
 * Content-Security-Policy does not apply to it. "<" is escaped so no text can close the tag.
 */
export function renderStructuredData(siteUrl: string): string {
  const graph = [
    {
      '@type': 'SoftwareApplication',
      name: SITE_NAME,
      description: META_DESCRIPTION,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Any (runs in a web browser)',
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
      license: 'https://www.apache.org/licenses/LICENSE-2.0',
      ...(siteUrl ? { url: `${siteUrl}/` } : {}),
      sameAs: [REPO_URL],
      publisher: { '@type': 'Organization', name: OWNER, url: OWNER_URL },
    },
    {
      '@type': 'FAQPage',
      mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    },
  ];
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');
}

/**
 * What a browser without scripts sees inside index.html (the app needs scripts): the headline, what it is, the privacy sentence and
 * who is behind it. Plain HTML, no scripts.
 */
export function renderNoscript(): string {
  return `<noscript>
  <main style="max-width:640px;margin:0 auto;padding:32px 16px;font-family:system-ui,sans-serif;line-height:1.5">
    <p>${esc(EYEBROW)}</p>
    <h1>${esc(HEADLINE)}</h1>
    <p>${esc(SUBHEAD)}</p>
    <p><strong>This app needs JavaScript.</strong> ${esc(PRIVACY_SENTENCE)} <a href="/privacy.html">Privacy statement</a></p>
    <h2>What you get</h2>
    <ul>
${FEATURES.map((f) => `      <li><strong>${esc(f.title)}.</strong> ${esc(f.text)}</li>`).join('\n')}
    </ul>
    <h2>How it works</h2>
    <ol>
${STEPS.map((s) => `      <li><strong>${esc(s.title)}.</strong> ${esc(s.text)}</li>`).join('\n')}
    </ol>
    <h2>${esc(PRIVACY_TITLE)}</h2>
${PRIVACY_LINES.map((l) => `    <p>${esc(l)}</p>`).join('\n')}
    <h2>Questions</h2>
    <dl>
${FAQ.map((f) => `      <dt>${esc(f.q)}</dt>\n      <dd>${esc(f.a)}</dd>`).join('\n')}
    </dl>
    <p><a href="${esc(REPO_URL)}" rel="noopener noreferrer">Source code on GitHub</a> · <a href="/privacy.html">Privacy statement</a> · <a href="/third-party-notices.txt">Third-party licenses</a> · <a href="mailto:${esc(CONTACT_EMAIL)}">${esc(CONTACT_EMAIL)}</a></p>
    <p>${esc(COPYRIGHT)} · ${esc(OWNERSHIP_LINE).replace(BRAND, `<a href="${esc(BRAND_URL)}" rel="noopener noreferrer">${BRAND}</a>`).replace(OWNER, `<a href="${esc(OWNER_URL)}" rel="noopener noreferrer">${OWNER}</a>`)}</p>
  </main>
</noscript>`;
}
