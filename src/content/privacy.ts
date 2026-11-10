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
 * PUBLISHED: the owner reviewed the text and published it on 2026-11-10 (issue #19), taking responsibility for the residual
 * risk. It is not legal advice. (The legal basis for the web-server logs is settled for now as legitimate interest.)
 * While PRIVACY_IS_DRAFT is true the page says it is a draft and asks search engines not to index it; set it back to true
 * if the text is ever changed without a review.
 */

import { BRAND, BRAND_NOTE, BRAND_URL, CONTACT_EMAIL, OWNER, OWNER_URL, TRADING_AS } from './site.ts';

export const PRIVACY_IS_DRAFT = false;
export const PRIVACY_UPDATED = '2026-11-10';
/** Where the page lives. An absolute file path works from the landing page and the app, in the dev server, the build and on Vercel (cleanUrls redirects it). */
export const PRIVACY_PATH = '/privacy.html';

/**
 * How long Vercel keeps the RUNTIME LOGS it shows us for this site: its documented period for the Pro plan, which we have not
 * changed (no Observability Plus). Source: https://vercel.com/docs/logs/runtime, "Limits" (Hobby 1 hour, Pro 1 day, Pro with
 * Observability Plus 30 days, Enterprise 3 days), checked 2026-11-10. This is not a promise about everything Vercel keeps:
 * Vercel's privacy notice gives no period for its other technical data, so the text says so. Update this if the plan changes.
 */
export const LOG_RETENTION = 'one day';

/** NuCielo ICT B.V. is the only legal entity; NeotixHQ is its brand. */
export const CONTROLLER = TRADING_AS;
export const CONTACT = CONTACT_EMAIL;

/** The same sentence on the welcome screen, in the README and at the top of the privacy page. */
export const PRIVACY_SENTENCE =
  'Everything runs in your browser and your data is never uploaded, unless you choose to ask Claude about statement lines with your own Anthropic API key.';

export const SUMMARY: string[] = [
  'Your spending data stays in this browser. The app has no backend and does not upload it to us.',
  'There is no account. The app sets no cookies and contains no analytics, ads or trackers. Our web host, Vercel, keeps ordinary technical server logs (see Hosting).',
  'One optional feature, Ask Claude, sends the statement lines you choose to Anthropic. It only happens when you press the button, and only with your own Anthropic API key. Anthropic’s own terms apply to that data, not this statement.',
  'You can export your transactions or delete everything stored in this browser at any time. Deleting here does not delete anything Anthropic has already received.',
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
    paragraphs: ['The app has no backend and no account. What you import or set is stored in your browser, on your device, in IndexedDB (a database built into the browser):'],
    items: [
      'Imported transactions (date, amount, the description from your statement, provider, type and tag), the import history (including the names of the files you imported), budgets, charge types you corrected, labels, categories and tag rules.',
      'Demo data is made up on the fly, in memory, and never stored. The browser keeps a small flag in localStorage that says you are exploring the demo, so a reload keeps you there.',
      'Statements you drop into the app (Excel, CSV or PDF) are read in your browser. They are not uploaded, and the files themselves are not stored, only the lines you choose to import.',
      'Exports (CSV) are created in your browser and saved by it. They are not sent anywhere.',
    ],
    after: [
      'The app does not encrypt this data. Anyone who can use this browser profile on this device, and browser extensions or other software that are allowed to read this site’s data, can read it.',
      'The address in your browser can show your current view after the “#” (for example a provider, tag, search text or dates). Browsers do not send that part of an address to the web server, but it is kept in your browser history and is included if you copy the link.',
    ],
  },
  {
    id: 'not-collected',
    title: 'What the app does not do',
    paragraphs: [
      'The app does not set cookies. It contains no analytics, advertising or tracking code, and it loads no fonts, scripts or images from other sites. It has no logging or error-reporting service.',
      'A content security policy, set by the web server and enforced by your browser, limits the app’s pages to their own address and to Anthropic’s API (api.anthropic.com, used only by the optional feature below). This limits what the app itself can do. It does not control browser extensions you have installed.',
      'We do not receive your financial data through the app, so there is nothing for us to sell or share.',
    ],
  },
  {
    id: 'ask-claude',
    title: 'The one optional network feature: Ask Claude',
    paragraphs: [
      'This is the only feature where data leaves your browser. When the app is unsure whether a statement line is AI spending, you can press Ask Claude. It needs your own Anthropic API key. Nothing is sent until you press the button, and “Show exactly what is sent” lets you preview it first.',
      'For each line you choose, your browser sends this directly to Anthropic’s API (api.anthropic.com). It does not pass through our servers:',
    ],
    items: ASK_CLAUDE_SENT,
    after: [
      `It does not send: ${ASK_CLAUDE_NOT_SENT.join('; ')}.`,
      'Together with the lines, your browser sends fixed instructions that tell Claude what to do (they contain none of your data), your API key (to authenticate the request, which ties it to your Anthropic account), and what any web request carries: your IP address and standard details such as your browser and the version of Anthropic’s code library the app uses.',
      'Because the description goes exactly as your bank wrote it, check the preview first. If a line’s description contains something you would rather not send, leave that line out.',
      'We do not see this traffic, and what we say in this statement about our own handling does not describe how Anthropic handles it. Anthropic decides how long it keeps the data and what it may be used for, under its own terms. Anthropic’s privacy policy says it does not cover content processed for its business and API customers; that is covered by Anthropic’s customer agreements, usually its commercial terms (links at the end of this page). Read them before you use this feature. You pay Anthropic directly for the use of your key.',
      'Deleting data in this app does not delete anything that was already sent to Anthropic. For that, contact Anthropic.',
    ],
  },
  {
    id: 'api-key',
    title: 'Your Anthropic API key',
    paragraphs: [
      'By default your key is kept in memory only. It is gone when you close or reload the tab. This is the safer choice, and we recommend it where practical: paste the key each time you use Ask Claude.',
      'If you tick “Remember on this device”, the key is saved as plain text in this browser’s localStorage when you press Ask Claude. Anything running on this site’s address can read localStorage, and so can browser extensions and other software that are allowed to read this site’s data, and anyone who can use this browser profile. The content security policy above limits which scripts the app’s pages can run, but it cannot stop a malicious extension. Someone who got hold of a stored key could make requests with it on your Anthropic account, at your cost.',
      'Do not tick it on a shared computer. If you do tick it, consider creating a separate key for this app, so you can revoke it in the Anthropic Console without affecting anything else.',
      'Unticking the box removes the stored key immediately. So does Data → Clear local data (available once you have stored transactions), and so does clearing this site’s data in your browser settings.',
    ],
  },
  {
    id: 'hosting',
    title: 'Hosting and third parties',
    paragraphs: [
      'The site is served by Vercel. Like any web host, Vercel processes technical data when your browser asks for a page: for example your IP address, the address you requested, the time and your browser type. This is Vercel’s processing, to deliver the site and keep it secure, under Vercel’s privacy notice (link at the end of this page). None of your ledger data is in it, because the app does not send it to the server.',
      `Vercel shows us runtime logs of the site for a limited time. On our plan Vercel documents ${LOG_RETENTION} of retention for them, and we have not extended it. This is not a promise about everything Vercel keeps: Vercel may keep other technical data (for example for security, usage or billing) for other periods, and its privacy notice does not state a fixed period.`,
      'Apart from Vercel, the only third party the app can talk to is Anthropic, and only when you use Ask Claude. The app does not use analytics. If that ever changes, this statement will say exactly what is collected, and how to opt out, before it is switched on.',
    ],
  },
  {
    id: 'your-control',
    title: 'Export, deletion and losing your data',
    items: [
      'Export: Data → Export all as CSV, or Export a quarter (one quarter, optionally one tag). The file holds your transactions only: merchant, provider, amount and date, plus type and tag when you have used them. It does not include budgets, corrections, labels, categories, tag rules or the import history. There is no full backup or restore: importing the CSV again brings back the transactions only.',
      'Delete: Data → Clear local data removes transactions, import history, tags, budgets, corrections, labels, categories, tag rules and a remembered API key from this browser. It is available once you have stored transactions. You can also clear this site’s data in your browser settings.',
      'Deleting here only affects this device. It does not remove anything already sent to Anthropic (see Ask Claude), and it does not change Vercel’s server logs, which expire on Vercel’s schedule.',
      'Your data is stored per browser and per device. It is not synced, so another browser, profile or device starts empty. It is lost if you clear your browser’s data, and a browser can also remove site data when storage is low or when a private window closes. The app asks your browser to keep the data when you import, but the browser decides.',
    ],
  },
  {
    id: 'controller',
    title: 'Who runs this app, and your rights',
    paragraphs: [
      `Operator: ${CONTROLLER}. Contact for privacy questions: ${CONTACT}. ${BRAND_NOTE}`,
      'We cannot see the data stored in your browser. The personal data we can see is limited to the technical data in hosting logs described above, which is processed to deliver the site and keep it secure (legal basis: legitimate interest, Article 6(1)(f) GDPR).',
      'If data protection law such as the GDPR applies to you, you may have rights to access, correct and erase your personal data, to restrict or object to its processing, to data portability, and to complain to your data protection authority. For data stored only in your browser you can use the controls above yourself. For anything else about this app, contact us at the address above. For data you sent to Anthropic, contact Anthropic.',
    ],
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
  { label: 'Anthropic privacy policy (general; excludes API customer content)', href: LINKS.anthropicPrivacy },
  { label: 'Anthropic commercial terms (API use)', href: LINKS.anthropicTerms },
  { label: `${BRAND} website`, href: BRAND_URL },
  { label: `${OWNER} website`, href: OWNER_URL },
];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The body of the static page. No scripts, no inline event handlers. */
export function renderPrivacyBody(): string {
  const out: string[] = [];
  out.push('<h1>Privacy statement</h1>');
  out.push(`<p class="muted">AI Spending Tracker · last updated ${esc(PRIVACY_UPDATED)}</p>`);
  if (PRIVACY_IS_DRAFT) {
    out.push(
      '<p class="notice"><strong>Draft.</strong> This text has not yet been reviewed by a legal professional and is not legal advice.</p>',
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
