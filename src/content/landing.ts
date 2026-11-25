/*
 * The landing page at "/": what the product is, why it is safe, what you get.
 * Generated into index.html by the staticPages plugin in vite.config.ts, so it is static HTML with
 * no scripts (the strict CSP allows only our own files). The privacy wording comes from
 * ./privacy.ts, so it is identical on the welcome screen, the privacy page and the README.
 *
 * The app itself is at /app (app.html), and keeps working with the same #/ links.
 */
import { PRIVACY_SENTENCE } from './privacy.ts';
import { landingMarks, type LandingMark } from './marks.ts';
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

/** Colour of a feature card. Each matches what the colour means in the app. */
export type Tone = 'brand' | 'rise' | 'overlap' | 'saving' | 'amber' | 'teal';

export const FEATURES: { title: string; text: string; tone: Tone; icon: IconName }[] = [
  { title: 'Subscriptions, found for you', text: 'Recurring AI charges are picked out of your statements. One click shows why each one counts.', tone: 'brand', icon: 'repeat' },
  { title: 'Price jumps, flagged', text: 'A plan that went from €22 to €110 stands out, with the old price struck through.', tone: 'rise', icon: 'trend' },
  { title: 'Tools you pay for twice', text: 'Two chat assistants or three coding tools at once? Overlaps are grouped, with what they cost together.', tone: 'overlap', icon: 'layers' },
  { title: 'What ending one would save', text: 'Every subscription shows its cost per year, so you can see what cancelling it is worth.', tone: 'saving', icon: 'piggy' },
  { title: 'Guesses you fix in one click', text: 'Subscription, usage or one-time: the app’s guess is outlined until you confirm it or pick another.', tone: 'amber', icon: 'check' },
  { title: 'Budgets, tags and export', text: 'A monthly budget against the month-end estimate, Personal or Business tags, and a quarter exported for expenses.', tone: 'teal', icon: 'tag' },
];

export const STEPS: { title: string; text: string }[] = [
  { title: 'Drop in your statements', text: 'The CSV, Excel or PDF files you already download from your bank or card.' },
  { title: 'Check what it found', text: 'The app explains each AI charge. Anything it is unsure about is yours to keep or leave out.' },
  { title: 'See where it goes', text: 'Subscriptions, price jumps, overlaps and trends. Nothing leaves your browser.' },
];

export const FAQ: { q: string; a: string }[] = [
  { q: 'Which banks work?', a: 'Excel or CSV exports from most banks and cards, including American Express, and Revolut PDF statements. For other PDFs, export a CSV.' },
  { q: 'Do I need an account?', a: 'No. There is no account and no backend.' },
  { q: 'Where is my data kept?', a: 'In this browser, on this device. It is not synced, so export a CSV now and then.' },
  { q: 'How do I delete it?', a: 'Open Data and choose Clear local data, or clear this site’s data in your browser.' },
  { q: 'Is anything ever sent?', a: 'Only if you press Ask Claude, with your own Anthropic API key, and only the lines you pick.' },
  { q: 'Can I just look around?', a: 'Yes. The demo shows the whole app with invented charges. Nothing is saved.' },
];

type IconName = 'repeat' | 'trend' | 'layers' | 'piggy' | 'check' | 'tag' | 'file' | 'browser' | 'disk' | 'server' | 'user' | 'cloud' | 'code';

/** Line icons drawn for the landing page (24px grid, stroke inherits the text colour). */
const ICONS: Record<IconName, string> = {
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  trend: '<path d="M22 7 13.5 15.5l-5-5L2 17"/><path d="M16 7h6v6"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 12 10 5 10-5"/><path d="m2 17 10 5 10-5"/>',
  piggy: '<path d="M19 5c-1.5 0-2.8.6-3.7 1.6A7 7 0 0 0 5 11c0 2.2 1 4.2 2.6 5.5V20h3v-2h3v2h3v-3.4A6.9 6.9 0 0 0 19 14h2v-4h-2a7 7 0 0 0-.9-2.1"/><path d="M15.5 11h.01"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  tag: '<path d="M12 2H2v10l9.3 9.3a1 1 0 0 0 1.4 0l8.6-8.6a1 1 0 0 0 0-1.4z"/><circle cx="7" cy="7" r="1.5"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/>',
  browser: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 9h20"/><path d="M6 6.5h.01M9 6.5h.01"/>',
  disk: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  server: '<rect x="3" y="3" width="18" height="7" rx="2"/><rect x="3" y="14" width="18" height="7" rx="2"/><path d="M2 2l20 20"/>',
  user: '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6"/><path d="m17 8 5 5M22 8l-5 5"/>',
  cloud: '<path d="m2 2 20 20"/><path d="M5.8 8.3A5.5 5.5 0 0 0 7 19h10.5a3.5 3.5 0 0 0 2.3-.9"/><path d="M21 15.4A3.5 3.5 0 0 0 17.5 11h-1A6.5 6.5 0 0 0 9.7 5.3"/>',
  code: '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
};

const icon = (name: IconName) =>
  `<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;

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
const STATEMENT: { date: string; mark: LandingMark; text: string; amount: string; note: string }[] = [
  { date: '15 NOV', mark: 'openai', text: 'OPENAI *CHATGPT SUBSCR', amount: '110.13', note: '<span class="badge b-rise">▲ ×4.8</span> was <s class="was">€22.80</s> until June' },
  { date: '09 NOV', mark: 'cursor', text: 'CURSOR AI POWERED IDE', amount: '18.73', note: '<span class="badge b-overlap">◐ Overlap</span> one of 3 coding tools, €53.35 a month together' },
  { date: '05 NOV', mark: 'github', text: 'GITHUB INC COPILOT', amount: '9.62', note: '<span class="badge b-overlap">◐ Overlap</span> with Cursor and Lovable' },
  { date: '12 NOV', mark: 'supabase', text: 'SUPABASE SINGAPORE', amount: '22.80', note: '<span class="badge b-guess">? Guess</span> monthly since April, around the 12th' },
];

/** Monthly totals for the trend picture (invented, like the demo). The last month is in progress. */
const TREND = [150, 320, 540, 400, 440, 600, 535, 455, 520, 447, 554];
const TREND_LABELS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N'];

function trendSvg(): string {
  const w = 300;
  const h = 130;
  const top = 10;
  const max = 650;
  const x = (i: number) => 12 + (i * (w - 24)) / (TREND.length - 1);
  const y = (v: number) => top + (h - top - 22) * (1 - v / max);
  const pts = TREND.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const line = `M${pts.join(' L')}`;
  const area = `${line} L${x(TREND.length - 1).toFixed(1)},${(h - 22).toFixed(1)} L${x(0).toFixed(1)},${(h - 22).toFixed(1)} Z`;
  const last = TREND.length - 1;
  const dots = TREND.map((v, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="${i === last ? 4.5 : 2.6}" class="${i === last ? 'tr-dot-now' : 'tr-dot'}"/>`).join('');
  const labels = TREND_LABELS.map((l, i) => `<text x="${x(i).toFixed(1)}" y="${h - 6}" text-anchor="middle">${l}</text>`).join('');
  const proj = `<path d="M${x(last).toFixed(1)},${y(TREND[last]).toFixed(1)} L${(x(last) + 10).toFixed(1)},${y(608).toFixed(1)}" class="tr-proj"/>`;
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Monthly spending rising from €150 in January to €554 so far in November" class="trend-svg">
        <defs><linearGradient id="tr-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".28"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>
        <path d="${area}" fill="url(#tr-fill)"/><path d="${line}" class="tr-line"/>${proj}${dots}<g class="tr-labels">${labels}</g>
      </svg>`;
}

/** The body of the landing page: static HTML, no scripts. */
export function renderLandingBody(footer: FooterInfo): string {
  const m = landingMarks();
  const vm = (k: LandingMark) => `<span class="vm" aria-hidden="true">${m[k]}</span>`;
  const statement = STATEMENT.map(
    (l) =>
      `        <li><div class="st-row"><span class="st-date">${l.date}</span><span class="st-text">${vm(l.mark)}${esc(l.text)}</span><span class="st-amt">${l.amount}</span></div><div class="st-note">${l.note}</div></li>`,
  ).join('\n');
  const vendors: [LandingMark, string, string, number][] = [
    ['anthropic', 'Anthropic', '€159.14', 100],
    ['openai', 'OpenAI', '€148.89', 94],
    ['cursor', 'Cursor', '€66.54', 42],
    ['lovable', 'Lovable', '€25.00', 16],
    ['supabase', 'Supabase', '€22.80', 14],
  ];
  const vendorRows = vendors
    .map(([k, name, amt, pct]) => `<li>${vm(k)}<span class="v-name">${name}</span><span class="v-bar"><i style="width:${pct}%"></i></span><span class="v-amt">${amt}</span></li>`)
    .join('');
  const months = ['D', 'J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N']
    .map((l, i) => `<span class="md"><i class="${i >= 6 ? 'md-hi' : ''}"></i>${l}</span>`)
    .join('');
  const build = [`Version ${footer.version}`, footer.commit ? `build ${footer.commit}` : '', footer.license ? footer.license : ''].filter(Boolean).join(' · ');

  return `<div class="band band-hero">
<header class="site-head wide">
  <a class="brand" href="/"><img src="/favicon.svg" alt="" width="28" height="28" />${esc(SITE_NAME)}</a>
  <nav aria-label="Main"><a href="#finds">What it finds</a><a href="#how">How it works</a><a href="/privacy.html">Privacy</a></nav>
</header>
<section class="hero wrap">
  <div class="hero-copy">
    <h1>${esc(HEADLINE)}</h1>
    <p class="lead">${esc(SUBHEAD)}</p>
    <p class="cta">
      <a class="btn btn-primary" href="${esc(DEMO_PATH)}">Explore demo data</a>
      <a class="btn" href="${esc(APP_PATH)}">Use my own statements</a>
    </p>
    <ul class="pills" aria-label="At a glance">
      <li>${icon('user')}No account</li>
      <li>${icon('cloud')}Nothing uploaded</li>
      <li>${icon('code')}Open source</li>
    </ul>
  </div>
  <figure class="statement" aria-label="An example card statement, annotated the way the app reads it">
    <figcaption><span>Card statement, November</span><span class="st-found">4 AI charges found</span></figcaption>
    <ol>
${statement}
    </ol>
    <p class="st-foot">Invented example</p>
  </figure>
</section>
</div>
<main>
  <section class="band band-privacy" aria-labelledby="privacy-h">
    <div class="wrap">
      <h2 id="privacy-h">Your statements stay with you</h2>
      <p class="privacy-line"><strong>Private by design.</strong> ${esc(PRIVACY_SENTENCE)} <a href="/privacy.html">Privacy statement</a></p>
      <ol class="flow">
        <li><span class="flow-icon">${icon('file')}</span><strong>Your statement</strong><span>A CSV, Excel or PDF from your bank</span></li>
        <li><span class="flow-icon">${icon('browser')}</span><strong>Read in your browser</strong><span>On your device, by this page</span></li>
        <li><span class="flow-icon">${icon('disk')}</span><strong>Stored in this browser</strong><span>Clear it whenever you like</span></li>
        <li class="flow-none"><span class="flow-icon">${icon('server')}</span><strong>Our servers</strong><span>There are none</span></li>
      </ol>
    </div>
  </section>

  <section class="band" aria-labelledby="finds">
    <div class="wrap">
      <h2 id="finds">What it finds</h2>
      <p class="section-lead">From the lines on your statement to who you pay, what repeats, and where it is heading.</p>
      <div class="visuals">
        <article class="visual tone-brand">
          <div class="visual-art">
            <ul class="vendors">${vendorRows}</ul>
          </div>
          <h3>Every vendor</h3>
          <p>Each provider with its mark, what you paid this month and its share of the total.</p>
        </article>
        <article class="visual tone-overlap">
          <div class="visual-art">
            <div class="sub-card">
              <div class="sub-head">${vm('openai')}<strong>ChatGPT Plus</strong><span class="sub-amt">€109.44/mo</span></div>
              <div class="months" aria-label="Charged every month for 12 months, at a higher price since June">${months}</div>
              <div class="sub-price"><s class="was">€22.80</s> <strong>€110.13</strong> <span class="badge b-rise">▲ ×4.8</span></div>
              <div class="sub-save">Ending it saves <strong>≈ €1,313 a year</strong></div>
            </div>
          </div>
          <h3>Every subscription</h3>
          <p>Why it counts, how its price moved, and what cancelling it would save.</p>
        </article>
        <article class="visual tone-saving">
          <div class="visual-art">
            <div class="trend-head"><span class="trend-fig">€554</span><span class="badge b-rise">▲ 41% vs Oct</span></div>
            <div class="trend-sub">so far in November, ≈ €608 by month end</div>
            ${trendSvg()}
          </div>
          <h3>Every trend</h3>
          <p>Month by month, with an estimate for the month you are in and your budget beside it.</p>
        </article>
      </div>
    </div>
  </section>

  <section class="band band-soft" aria-labelledby="what">
    <div class="wrap">
      <h2 id="what">What you get</h2>
      <ul class="features">
${FEATURES.map((f) => `        <li class="feature tone-${f.tone}"><span class="feature-icon">${icon(f.icon)}</span><h3>${esc(f.title)}</h3><p>${esc(f.text)}</p></li>`).join('\n')}
      </ul>
    </div>
  </section>

  <section class="band" aria-labelledby="how">
    <div class="wrap how">
      <div>
        <h2 id="how">How it works</h2>
        <ol class="steps">
${STEPS.map((s, i) => `          <li><span class="step-n">${i + 1}</span><div><strong>${esc(s.title)}</strong><p>${esc(s.text)}</p></div></li>`).join('\n')}
        </ol>
      </div>
      <div>
        <h2 id="faq">Good to know</h2>
        <dl class="faq">
${FAQ.map((f) => `          <div><dt>${esc(f.q)}</dt><dd>${esc(f.a)}</dd></div>`).join('\n')}
        </dl>
      </div>
    </div>
  </section>

  <section class="band" aria-labelledby="try">
    <div class="wrap">
      <div class="try">
        <div>
          <h2 id="try">See it with invented data first</h2>
          <p>The demo runs the whole app on made-up charges. Nothing is saved, and you can switch to your own statements any time.</p>
        </div>
        <p class="cta"><a class="btn btn-light" href="${esc(DEMO_PATH)}">Explore demo data</a><a class="btn btn-outline-light" href="${esc(APP_PATH)}">Use my own statements</a></p>
      </div>
    </div>
  </section>
</main>
<footer class="site-foot wide">
  <p><a href="/privacy.html">Privacy statement</a> · <a href="/third-party-notices.txt">Third-party licenses</a> · <a href="mailto:${esc(CONTACT_EMAIL)}">${esc(CONTACT_EMAIL)}</a></p>
  <p class="muted">${esc(COPYRIGHT)} · ${esc(OWNERSHIP_LINE).replace(BRAND, `<a href="${esc(BRAND_URL)}" rel="noopener noreferrer">${BRAND}</a>`).replace(OWNER, `<a href="${esc(OWNER_URL)}" rel="noopener noreferrer">${OWNER}</a>`)}</p>
  <p class="muted">${esc(build)}</p>
</footer>`;
}
