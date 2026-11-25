/*
 * The landing page at "/": what the product is, why it is safe, what you get.
 * Generated into index.html by the staticPages plugin in vite.config.ts, so it is static HTML with
 * no scripts (the strict CSP allows only our own files). The privacy wording comes from
 * ./privacy.ts, so it is identical on the welcome screen, the privacy page and the README.
 *
 * The app itself is at /app (app.html), and keeps working with the same #/ links.
 */
import { PRIVACY_SENTENCE } from './privacy.ts';
import { landingMarks } from './marks.ts';
import { BRAND, BRAND_URL, CONTACT_EMAIL, COPYRIGHT, OWNER, OWNER_URL, OWNERSHIP_LINE } from './site.ts';

/** Where the tracker lives. A plain file path works in the dev server, the build and on Vercel (cleanUrls turns it into /app). */
export const APP_PATH = '/app.html';
/** The same app, started in demo mode with invented data. */
export const DEMO_PATH = `${APP_PATH}?demo=1`;

export const SITE_NAME = 'AI Spending Tracker';
export const HEADLINE = 'Do you know what you’re still paying for?';
export const SUBHEAD = 'Drop in your card statements. See every AI subscription, every price jump and every tool you pay for twice. Nothing leaves your browser.';
export const META_DESCRIPTION =
  'See what you spend on AI tools, which charges are subscriptions, price changes and what renews next. Runs in your browser: your data is never uploaded.';

export const FEATURES: { title: string; text: string }[] = [
  { title: 'Subscriptions, found for you', text: 'Recurring AI charges are found from your statements. One click shows why each one counts, and what ending it would save.' },
  { title: 'Price changes and overlap', text: 'Spot a plan that went from €22 to €109, and several chat assistants you pay for at once.' },
  { title: 'Guesses you can correct in one click', text: 'Every charge is a subscription, usage or one-time. The app’s guess is outlined until you confirm it or pick another.' },
  { title: 'Budgets, tags and quarterly export', text: 'Set a monthly budget, tag charges Personal or Business in one click, and export a quarter for expense claims.' },
];

export const STEPS: string[] = [
  'Drop in the statements you already download from your bank or card, or a CSV.',
  'Review what the app found. Anything it is unsure about is yours to include or leave out.',
  'Explore your spending. Nothing leaves your browser.',
];

/** Screenshots served from /screenshots. Every image has alt text. */
export const SHOTS: { file: string; alt: string; caption: string; width: number; height: number }[] = [
  { file: 'overview.jpg', alt: 'The overview page: this month’s spending with a month-end estimate, and the price jumps and overlapping tools that need attention.', caption: 'Overview: this month, and what needs your attention', width: 1280, height: 888 },
  { file: 'subscriptions.jpg', alt: 'The subscriptions page: the monthly run-rate, the active recurring charges, and one of them explained in a side panel.', caption: 'Subscriptions: why each one counts, and what ending it saves', width: 1280, height: 888 },
  { file: 'insights.jpg', alt: 'The next 30 days of expected charges, and price changes shown with the old price struck through.', caption: 'The next 30 days, and price changes', width: 1280, height: 888 },
];

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

export interface FooterInfo {
  version: string;
  /** Short commit hash, or empty. */
  commit: string;
  /** Empty until a license has been chosen. */
  license: string;
}

/**
 * Social and search tags. `siteUrl` is the public address (no trailing slash), or empty before a domain
 * exists: then there is no canonical link and no og:image, because both must be absolute URLs.
 */
export function renderLandingMeta(siteUrl: string): string {
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

/** One line of the statement example in the hero: as the bank prints it, then what the app makes of it. */
const STATEMENT: { date: string; mark: 'openai' | 'cursor' | 'github' | 'supabase'; text: string; amount: string; note: string }[] = [
  { date: '15 NOV', mark: 'openai', text: 'OPENAI *CHATGPT SUBSCR', amount: '110.13', note: '<span class="badge b-rise">▲ ×4.8</span> was <s class="was">€22.80</s> until June' },
  { date: '09 NOV', mark: 'cursor', text: 'CURSOR AI POWERED IDE', amount: '18.73', note: '<span class="badge b-overlap">◐ Overlap</span> one of 3 coding tools, €53.35 a month together' },
  { date: '05 NOV', mark: 'github', text: 'GITHUB INC COPILOT', amount: '9.62', note: '<span class="badge b-overlap">◐ Overlap</span> with Cursor and Lovable' },
  { date: '12 NOV', mark: 'supabase', text: 'SUPABASE SINGAPORE', amount: '22.80', note: '<span class="badge b-guess">? Guess</span> monthly since April, around the 12th' },
];

/** The body of the landing page: static HTML, no scripts. */
export function renderLandingBody(footer: FooterInfo): string {
  const marks = landingMarks();
  const shots = SHOTS.map(
    (s) =>
      `<figure><img src="/screenshots/${esc(s.file)}" alt="${esc(s.alt)}" width="${s.width}" height="${s.height}" loading="lazy" /><figcaption>${esc(s.caption)}</figcaption></figure>`,
  ).join('\n');
  const statement = STATEMENT.map(
    (l) =>
      `      <li><div class="st-row"><span class="st-date">${l.date}</span><span class="st-text"><span class="vm" aria-hidden="true">${marks[l.mark]}</span>${esc(l.text)}</span><span class="st-amt">${l.amount}</span></div><div class="st-note">${l.note}</div></li>`,
  ).join('\n');
  const build = [`Version ${footer.version}`, footer.commit ? `build ${footer.commit}` : '', footer.license ? footer.license : ''].filter(Boolean).join(' · ');
  return `<header class="site-head wide">
  <a class="brand" href="/"><img src="/favicon.svg" alt="" width="26" height="26" />${esc(SITE_NAME)}</a>
  <nav aria-label="Main"><a href="#how">How it works</a><a href="#faq">Questions</a><a href="/privacy.html">Privacy</a></nav>
</header>
<main>
  <section class="hero">
    <div class="hero-copy">
      <h1>${esc(HEADLINE)}</h1>
      <p class="lead">${esc(SUBHEAD)}</p>
      <p class="cta">
        <a class="btn btn-primary" href="${esc(DEMO_PATH)}">Explore demo data</a>
        <a class="btn" href="${esc(APP_PATH)}">Use my own statements</a>
      </p>
    </div>
    <figure class="statement" aria-label="An example card statement, annotated the way the app reads it">
      <figcaption><span>Card statement, November</span><span>Invented example</span></figcaption>
      <ol>
${statement}
      </ol>
    </figure>
  </section>
  <section class="privacy" aria-labelledby="privacy-h">
    <h2 id="privacy-h">Your statements stay with you</h2>
    <p class="privacy-line"><strong>Private by design.</strong> ${esc(PRIVACY_SENTENCE)} <a href="/privacy.html">Privacy statement</a></p>
    <ol class="flow">
      <li><strong>Your statement</strong><span>A CSV, Excel or PDF from your bank</span></li>
      <li><strong>Read in your browser</strong><span>On your device, by this page</span></li>
      <li><strong>Stored in this browser</strong><span>Clear it whenever you like</span></li>
      <li class="flow-none"><strong>Our servers</strong><span>There are none</span></li>
    </ol>
  </section>
  <section aria-labelledby="what">
    <h2 id="what">What you get</h2>
    <ul class="features">
${FEATURES.map((f) => `      <li><h3>${esc(f.title)}</h3><p>${esc(f.text)}</p></li>`).join('\n')}
    </ul>
  </section>
  <section class="shots-section" aria-labelledby="inside">
    <h2 id="inside">Inside the app</h2>
    <div class="shots">
${shots}
    </div>
  </section>
  <section aria-labelledby="how">
    <h2 id="how">How it works</h2>
    <ol class="steps">
${STEPS.map((t) => `      <li>${esc(t)}</li>`).join('\n')}
    </ol>
    <p class="cta"><a class="btn btn-primary" href="${esc(DEMO_PATH)}">Explore demo data</a></p>
  </section>
  <section aria-labelledby="faq">
    <h2 id="faq">Questions</h2>
${FAQ.map((f) => `    <details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('\n')}
  </section>
</main>
<footer class="site-foot wide">
  <p><a href="/privacy.html">Privacy statement</a> · <a href="/third-party-notices.txt">Third-party licenses</a> · <a href="mailto:${esc(CONTACT_EMAIL)}">${esc(CONTACT_EMAIL)}</a></p>
  <p class="muted">${esc(COPYRIGHT)} · ${esc(OWNERSHIP_LINE).replace(BRAND, `<a href="${esc(BRAND_URL)}" rel="noopener noreferrer">${BRAND}</a>`).replace(OWNER, `<a href="${esc(OWNER_URL)}" rel="noopener noreferrer">${OWNER}</a>`)}</p>
  <p class="muted">${esc(build)}</p>
</footer>`;
}
