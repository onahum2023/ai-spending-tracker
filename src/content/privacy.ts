/*
 * The privacy statement: one source for every place it appears.
 *
 *   - /privacy.html is generated from SECTIONS by the privacyPage plugin in vite.config.ts
 *     (static HTML, no scripts, so it works under the strict CSP).
 *   - PRIVACY_SENTENCE is the one-line version used on the welcome screen and in the README.
 *   - src/content/privacy.test.ts checks the claims below against the code (network calls,
 *     localStorage keys, cookies, third-party hosts). If you change what the app stores or sends,
 *     that test fails until this text and the code agree again.
 *
 * DRAFT: the text has not been reviewed by someone qualified, the legal basis is still to be confirmed, and it is
 * not legal advice. While PRIVACY_IS_DRAFT is true the page says so and asks
 * search engines not to index it. Set it to false only after review (see issue #19).
 */

import { BRAND_NOTE, CONTACT_EMAIL, COPYRIGHT, OWNER, OWNERSHIP_LINE, TRADING_AS } from './site';

export const PRIVACY_IS_DRAFT = true;
export const PRIVACY_UPDATED = '2026-11-10';
/** Where the page lives. An absolute file path works from the landing page and the app, in the dev server, the build and on Vercel (cleanUrls redirects it). */
export const PRIVACY_PATH = '/privacy.html';

/**
 * How long Vercel keeps the runtime (request) logs for this site: its default for the Pro plan, which we have not changed
 * (no Observability Plus). Source: Vercel's runtime-logs documentation, retention by plan (Hobby 1 hour, Pro 1 day,
 * Pro with Observability Plus 30 days, Enterprise 3 days), checked 2026-11-10. Update this if the plan or the setting changes.
 */
export const LOG_RETENTION = 'one day';

/** NuCielo ICT B.V. is the only legal entity; NeotixHQ is its brand. */
export const CONTROLLER = TRADING_AS;
export const CONTACT = CONTACT_EMAIL;

/** The same sentence on the welcome screen, in the README and at the top of the privacy page. */
export const PRIVACY_SENTENCE =
  'Everything runs in your browser and your data is never uploaded, unless you choose to ask Claude about statement lines with your own Anthropic API key.';

export const SUMMARY: string[] = [
  'Your spending data stays in this browser. It is not uploaded to us or to anyone else.',
  'There is no account and no backend. The site sets no cookies and has no analytics, ads or trackers.',
  'One optional feature, Ask Claude, sends the statement lines you choose to Anthropic. It only happens when you press the button, and only with your own Anthropic API key.',
  'You can export or delete everything at any time.',
];

/** Third-party documents this statement points to. */
export const LINKS = {
  vercel: 'https://vercel.com/legal/privacy-notice',
  anthropicPrivacy: 'https://www.anthropic.com/legal/privacy',
  anthropicTerms: 'https://www.anthropic.com/legal/commercial-terms',
} as const;

/** What leaves the browser for each statement line in Ask Claude. Must match payloadFor() in src/lib/extract/review.ts. */
export const ASK_CLAUDE_SENT = [
  'the date and the amount in euros',
  'the description of the line exactly as it appears in your file or statement: it can include whatever your bank put there, such as a city or a payment reference',
  'your bank’s short name for the line, if the statement has one',
  'the foreign amount and the country, if the line has them',
  'a short note on why the built-in rules were unsure',
];
export const ASK_CLAUDE_NOT_SENT = [
  'file names, or any column of your file that is not listed above',
  'statement lines you did not choose',
  'your saved ledger, tags, budgets, corrections, labels or categories',
];

export interface Section {
  id: string;
  title: string;
  paragraphs?: string[];
  items?: string[];
  /** Shown after the items. */
  after?: string[];
}

export const SECTIONS: Section[] = [
  {
    id: 'where-data-lives',
    title: 'Where your data lives',
    paragraphs: ['The app has no backend and no account. Everything you import or set stays on your device, in your browser:'],
    items: [
      'Imported transactions, import history, tags, budgets, charge types you corrected, labels, categories and tag rules are stored in this browser’s IndexedDB.',
      'Demo data is made up on the fly, in memory, and never stored. The browser keeps a small flag in localStorage that says you are exploring the demo, so a reload keeps you there.',
      'Exports (CSV) are created in your browser and saved by it. They are not sent anywhere.',
      'Statements you drop into the app (Excel, CSV or PDF) are read in your browser. They are not uploaded.',
    ],
  },
  {
    id: 'not-collected',
    title: 'What is not collected',
    paragraphs: [
      'The site does not set cookies. It has no analytics, advertising or tracking scripts, no fingerprinting, and it loads no fonts, scripts or images from other sites. A content security policy enforces this: the page can only talk to its own address, and to Anthropic for the optional feature below.',
      'We receive none of your financial data, so there is nothing to sell or share.',
    ],
  },
  {
    id: 'ask-claude',
    title: 'The one optional network feature: Ask Claude',
    paragraphs: [
      'When the app is unsure whether a statement line is AI spending, you can press Ask Claude. This needs your own Anthropic API key. Nothing is sent until you press the button, and a preview (“Show exactly what is sent”) lets you see it first.',
      'For each line you choose, the app sends this straight from your browser to Anthropic’s API (api.anthropic.com):',
    ],
    items: ASK_CLAUDE_SENT,
    after: [
      `It does not send: ${ASK_CLAUDE_NOT_SENT.join('; ')}.`,
      'Because the description goes exactly as your bank wrote it, check the preview first. If a line’s description contains something you would rather not send, leave that line out.',
      'We do not see this traffic. Anthropic handles it under its own terms and privacy policy: see Anthropic’s privacy policy and commercial terms (links at the end of this page). You pay Anthropic directly for the use of your key.',
      'Your API key is kept in memory only, and is gone when you close or reload the tab. If you tick “Remember on this device”, it is stored in this browser’s localStorage instead. Unticking the box removes it immediately, and so does Data → Clear local data. Anyone who can use this browser profile could read a stored key, so do not tick it on a shared computer.',
    ],
  },
  {
    id: 'hosting',
    title: 'Hosting and third parties',
    paragraphs: [
      'The site is served by Vercel. Like any web host, Vercel handles ordinary technical data to deliver the site and keep it secure: for example your IP address, browser type and the address you requested. This is Vercel’s processing, under Vercel’s privacy notice (link at the end of this page). None of your ledger data reaches the server, because the app never sends it.',
      'There are no other third parties. This site does not use analytics. If that ever changes, this statement will say exactly what is collected, and how to opt out, before it is switched on.',
    ],
  },
  {
    id: 'your-control',
    title: 'Your control',
    items: [
      'See and export your transactions: Data → Export all as CSV. The file holds every transaction, with its type and tag when used. It does not include budgets, corrections, labels, categories, tag rules or the import history.',
      'Delete everything: Data → Clear local data. It removes transactions, import history, tags, budgets, corrections, labels, categories, tag rules and a remembered API key from this browser. You can also clear this site’s data in your browser settings.',
      'Your data is not synced between devices, and it is lost if you clear your browser’s data. Export your transactions now and then as a backup. Your budgets, corrections, labels, categories and tag rules are not in that file and would have to be set again.',
    ],
  },
  {
    id: 'controller',
    title: 'Who is responsible, and your rights',
    paragraphs: [
      `Controller: ${CONTROLLER}. Contact: ${CONTACT}.`,
      'Because the app processes your data on your own device, the operator receives none of it. The only personal data an operator could see is the ordinary web-server data described above, which is processed to deliver the site and keep it secure (legal basis to be confirmed: this draft assumes legitimate interest, Article 6(1)(f) GDPR).',
      `If you are in the EU or UK you have the right to access, correct and erase your personal data, to restrict or object to its processing, and to data portability. You also have the right to complain to your national data protection authority. For data held only in your browser, you can exercise these rights yourself with the controls above. The web-server logs for this site are kept by Vercel for ${LOG_RETENTION}, which is its standard period for our plan; we have not extended it. Vercel may process other technical data under its own privacy notice.`,
    ],
  },
  {
    id: 'ownership',
    title: 'Who owns this app',
    paragraphs: [OWNERSHIP_LINE, BRAND_NOTE, `The app, its name, logo and text are the property of ${OWNER}`, COPYRIGHT],
  },
  {
    id: 'other',
    title: 'Children and changes',
    paragraphs: [
      'This app is not meant for children.',
      'The date at the top of this page changes whenever this statement does.',
    ],
  },
];

export const LINK_LIST: { label: string; href: string }[] = [
  { label: 'Vercel privacy notice', href: LINKS.vercel },
  { label: 'Anthropic privacy policy', href: LINKS.anthropicPrivacy },
  { label: 'Anthropic commercial terms', href: LINKS.anthropicTerms },
];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The body of the static page. No scripts, no inline event handlers. */
export function renderPrivacyBody(): string {
  const out: string[] = [];
  out.push('<h1>Privacy statement</h1>');
  out.push(`<p class="muted">AI Spending Tracker · last updated ${esc(PRIVACY_UPDATED)}</p>`);
  if (PRIVACY_IS_DRAFT) {
    out.push(
      '<p class="notice"><strong>Draft.</strong> This text has not yet been reviewed by someone qualified and is not legal advice. The legal basis is still to be confirmed.</p>',
    );
  }
  out.push(`<p class="lead">${esc(PRIVACY_SENTENCE)}</p>`);
  out.push('<h2>In short</h2>', `<ul>${SUMMARY.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>`);
  for (const sec of SECTIONS) {
    out.push(`<h2 id="${esc(sec.id)}">${esc(sec.title)}</h2>`);
    for (const p of sec.paragraphs ?? []) out.push(`<p>${esc(p)}</p>`);
    if (sec.items?.length) out.push(`<ul>${sec.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`);
    for (const p of sec.after ?? []) out.push(`<p>${esc(p)}</p>`);
  }
  out.push('<h2 id="links">Links</h2>', `<ul>${LINK_LIST.map((l) => `<li><a href="${esc(l.href)}" rel="noopener noreferrer">${esc(l.label)}</a></li>`).join('')}</ul>`);
  return out.join('\n');
}
