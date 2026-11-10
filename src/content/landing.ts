/*
 * The landing page at "/": what the product is, why it is safe, what you get.
 * Generated into index.html by the staticPages plugin in vite.config.ts, so it is static HTML with
 * no scripts (the strict CSP allows only our own files). The privacy wording comes from
 * ./privacy.ts, so it is identical on the welcome screen, the privacy page and the README.
 *
 * The app itself is at /app (app.html), and keeps working with the same #/ links.
 */
import { PRIVACY_SENTENCE } from './privacy';
import { CONTACT_EMAIL, COPYRIGHT, OWNERSHIP_LINE } from './site';

/** Where the tracker lives. A plain file path works in the dev server, the build and on Vercel (cleanUrls turns it into /app). */
export const APP_PATH = '/app.html';
/** The same app, started in demo mode with invented data. */
export const DEMO_PATH = `${APP_PATH}?demo=1`;

export const SITE_NAME = 'AI Spending Tracker';
export const HEADLINE = 'What do you spend on AI tools?';
export const SUBHEAD = 'See which providers you pay, which charges are subscriptions, and what is about to renew. Everything stays in your browser.';
export const META_DESCRIPTION =
  'See what you spend on AI tools, which charges are subscriptions, price changes and what renews next. Runs in your browser: your data is never uploaded.';

export const FEATURES: { title: string; text: string }[] = [
  { title: 'Subscriptions and run-rate', text: 'Your monthly commitment, a 30-day calendar of expected charges, and what ending each subscription would save.' },
  { title: 'Price changes and overlap', text: 'Spot a plan that went from €22 to €109, and several chat assistants you pay for at once.' },
  { title: 'Charge types you can correct', text: 'Every charge is a subscription, usage or one-time. The app guesses and you correct it, for a whole service or a single charge.' },
  { title: 'Budgets, tags and quarterly export', text: 'Set a monthly budget, tag charges Personal or Business, and export a quarter for expense claims.' },
];

export const STEPS: string[] = [
  'Drop in the statements you already download from your bank or card, or a CSV.',
  'Review what the app found. Anything it is unsure about is yours to include or leave out.',
  'Explore your spending. Nothing leaves your browser.',
];

/** Screenshots served from /screenshots. Every image has alt text. */
export const SHOTS: { file: string; alt: string; caption: string; width: number; height: number }[] = [
  { file: 'overview.jpg', alt: 'The overview page: monthly spending by provider as a stacked bar chart, with this month’s estimate.', caption: 'Overview: spending by provider and a month-end estimate', width: 1280, height: 888 },
  { file: 'subscriptions.jpg', alt: 'The subscriptions page: monthly run-rate, active recurring charges and a calendar of the next 30 days.', caption: 'Subscriptions: run-rate and the next 30 days', width: 1280, height: 888 },
  { file: 'insights.jpg', alt: 'Price changes, overlapping tools and stopped subscriptions.', caption: 'Price changes, overlap and stopped subscriptions', width: 1280, height: 888 },
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

/** The body of the landing page: static HTML, no scripts. */
export function renderLandingBody(footer: FooterInfo): string {
  const shots = SHOTS.map(
    (s, i) =>
      `<figure><img src="/screenshots/${esc(s.file)}" alt="${esc(s.alt)}" width="${s.width}" height="${s.height}" ${i === 0 ? '' : 'loading="lazy" '}/><figcaption>${esc(s.caption)}</figcaption></figure>`,
  ).join('\n');
  const build = [`Version ${footer.version}`, footer.commit ? `build ${footer.commit}` : '', footer.license ? footer.license : ''].filter(Boolean).join(' · ');
  return `<header class="site-head wide">
  <a class="brand" href="/"><img src="/favicon.svg" alt="" width="24" height="24" />${esc(SITE_NAME)}</a>
  <nav aria-label="Main"><a href="#how">How it works</a><a href="#faq">FAQ</a><a href="/privacy.html">Privacy</a></nav>
</header>
<main>
  <section class="hero">
    <h1>${esc(HEADLINE)}</h1>
    <p class="lead">${esc(SUBHEAD)}</p>
    <p class="cta">
      <a class="btn btn-primary" href="${esc(DEMO_PATH)}">Explore demo data</a>
      <a class="btn" href="${esc(APP_PATH)}">Import your own data</a>
    </p>
    <p class="privacy-line"><strong>Private by design.</strong> ${esc(PRIVACY_SENTENCE)} <a href="/privacy.html">Privacy statement</a></p>
  </section>
  <section class="shots" aria-label="Screenshots">
${shots}
  </section>
  <section aria-labelledby="what">
    <h2 id="what">What you get</h2>
    <ul class="features">
${FEATURES.map((f) => `      <li><h3>${esc(f.title)}</h3><p>${esc(f.text)}</p></li>`).join('\n')}
    </ul>
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
  <p class="muted">${esc(COPYRIGHT)} · ${esc(OWNERSHIP_LINE)}</p>
  <p class="muted">${esc(build)}</p>
</footer>`;
}
