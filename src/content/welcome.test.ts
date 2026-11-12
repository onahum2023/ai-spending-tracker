import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_PATH, CLOSING_TITLE, DEMO_PATH, EXAMPLE_LINES, FAMILIAR, FAQ, FEATURES, HEADLINE, META_DESCRIPTION, PRIVACY_LINES, PRIVACY_TITLE, renderNoscript, renderWelcomeMeta, STEPS, SUBHEAD, TRUST_LINE } from './welcome';
import { PRIVACY_PATH, PRIVACY_SENTENCE } from './privacy';
import { PRODUCTION_URL } from './site';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('welcome page', () => {
  it('sells: the hero, the way in, the trust line and the sections come in the order of the brief', () => {
    expect(HEADLINE).toBe("You've tried a lot of AI tools. Do you know what you're still paying for?");
    expect(SUBHEAD).toBe('See every AI service on your statements, what each one costs you, and which ones you forgot about. Nothing leaves your browser.');
    expect(TRUST_LINE).toBe('No account. No upload.');
    expect(FAMILIAR).toEqual([
      "You signed up to try one thing. You're still paying for it.",
      'Two assistants that do the same job, both on monthly plans.',
      'A plan quietly doubled, and you found out three months later.',
    ]);
    expect(EXAMPLE_LINES).toHaveLength(3);
    expect(STEPS).toHaveLength(3);
    expect(CLOSING_TITLE).toBe("See what you're really paying for.");
    expect(FEATURES).toHaveLength(4); // for the no-script text
    expect(FAQ.length).toBeGreaterThanOrEqual(5);
    const page = read('src/pages/Welcome.tsx');
    expect(page).toContain('Try it with demo data');
    expect(page).toContain('Import your statements');
    expect(page).toContain('Import more data');
    expect(page).toContain('Open Overview');
    const order = ['<h1 className="w-display">', 'title="Sound familiar?"', "title=\"What you'll find out\"", 'title="How it works"', 'className="w-band"', 'title="Questions"', 'className="w-section w-closing"', '<AboutCard />'].map((t) => page.indexOf(t));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
    // one primary action, shown twice (hero and closing), and a way to import in the hero
    expect(page.match(/variant="primary"/g)).toHaveLength(2);
  });

  it('says plainly what stays in the browser and what the optional Claude assist sends', () => {
    expect(PRIVACY_TITLE).toBe('Your statements never leave your browser.');
    expect(PRIVACY_LINES).toHaveLength(2);
    expect(PRIVACY_LINES[0]).toMatch(/on your device/);
    expect(PRIVACY_LINES[1]).toMatch(/Ask Claude/);
    expect(PRIVACY_LINES[1]).toMatch(/your own Anthropic API key/);
    expect(PRIVACY_LINES[1]).toMatch(/only the statement lines you choose/);
    const page = read('src/pages/Welcome.tsx');
    expect(page).toContain('PRIVACY_PATH');
    expect(page).toContain('Privacy statement');
    // the one-line version is still the one in the README, the privacy page and the no-script text
    expect(read('src/content/welcome.ts')).toContain('PRIVACY_SENTENCE');
  });

  it('is one page: the app opens on it without data, About opens it, and the logo goes there only without data', () => {
    const app = read('src/App.tsx');
    expect(app).toContain("section === 'about'");
    expect(app).toMatch(/!hasData && NEEDS_DATA\.has\(section\)/);
    expect(app).toMatch(/href\(hasData \? \[\] : \['about'\]\)/);
    expect(app).toContain('<Welcome />');
    // no separate landing page or welcome screen is left
    expect(existsSync(join(root, 'src/landing.ts'))).toBe(false);
    expect(app).not.toContain('function Welcome');
  });

  it('serves the app from "/" with the search and social tags, and the privacy sentence for browsers without scripts', () => {
    const html = read('index.html');
    expect(html).toContain('<!--WELCOME_META-->');
    expect(html).toContain('<div id="root"></div>');
    expect([...html.matchAll(/<script[^>]*>/g)].map((m) => m[0])).toEqual(['<script type="module" src="/src/main.tsx">']);
    expect(html).not.toMatch(/(?:src|href)="https?:\/\//);
    expect(html).not.toContain('noindex');
    const noscript = renderNoscript();
    expect(noscript).toContain(PRIVACY_SENTENCE.replace(/&/g, '&amp;'));
    expect(noscript).toContain(`href="${PRIVACY_PATH}"`);
    expect(noscript).not.toMatch(/<script|\son[a-z]+=/i);
    expect(noscript.match(/<h1[ >]/g)).toHaveLength(1);
  });

  it('renders its preview and example insights live from the demo data, read-only and apart from what is stored', () => {
    const page = read('src/pages/Welcome.tsx');
    // a demo-only ledger around the whole page, and the real Overview parts in a preview nothing can reach
    expect(page).toContain('<LedgerProvider demoOnly>');
    expect(page).toContain('OverviewHero');
    expect(page).toContain('OverviewChartCard');
    expect(page).toMatch(/className="w-preview-frame" inert aria-hidden="true"/);
    expect(page).not.toMatch(/<img|<picture|screenshots\//);
    const examples = read('src/components/WelcomeExamples.tsx');
    for (const part of ['ProviderAvatar', 'Pill kind="attention"', 'ReadChip', 'Change ']) expect(examples).toContain(part);
    const store = read('src/store.tsx');
    expect(store).toContain('demoOnly');
    // the demo-only ledger never loads from or saves to storage, and never touches the demo flag
    expect(store).toMatch(/if \(!demoOnly\) void reload\(\)/);
    expect(existsSync(join(root, 'public/screenshots'))).toBe(false);
  });

  it('points at files that exist', () => {
    expect(existsSync(join(root, 'app.html'))).toBe(true);
    expect(existsSync(join(root, 'privacy.html'))).toBe(true);
    for (const f of ['favicon.svg', 'favicon-32.png', 'apple-touch-icon.png', 'og-image.png', 'third-party-notices.txt']) expect(existsSync(join(root, 'public', f))).toBe(true);
  });

  it('leaves out canonical and social image tags until there is a public address, then adds absolute ones', () => {
    const none = renderWelcomeMeta('');
    expect(none).not.toMatch(/canonical|og:image|og:url/);
    expect(none).toContain('og:title');
    expect(none).toContain(META_DESCRIPTION);
    const withUrl = renderWelcomeMeta('https://example.org');
    expect(withUrl).toContain('<link rel="canonical" href="https://example.org/" />');
    expect(withUrl).toContain('content="https://example.org/og-image.png"');
    expect(withUrl).toContain('summary_large_image');
  });
});

describe('redirects', () => {
  const vercel = JSON.parse(read('vercel.json')) as { redirects: { source: string; has?: { type: string; value: string }[]; destination: string; permanent?: boolean }[] };

  it('sends www to the apex domain with the path kept, and only for exactly that host', () => {
    const www = vercel.redirects.find((r) => r.has?.some((h) => h.value === 'www.ai-spend-tracker.neotixhq.com'))!;
    expect(www).toBeDefined();
    expect(www.has).toEqual([{ type: 'host', value: 'www.ai-spend-tracker.neotixhq.com' }]);
    expect(www.destination).toBe(`${PRODUCTION_URL}/$1`);
    expect(www.permanent).toBe(true);
  });

  it('never redirects by a wildcard or a *.vercel.app host, so previews and unrelated projects are untouched', () => {
    for (const r of vercel.redirects) {
      for (const h of r.has ?? []) expect(h.value).not.toMatch(/\*|vercel\.app/);
      expect(r.destination.startsWith(PRODUCTION_URL)).toBe(true);
      // a rule without a host condition would redirect every deployment, previews included
      expect(r.has?.some((h) => h.type === 'host')).toBe(true);
    }
  });
});

describe('old links keep working', () => {
  it('sends /app and /app.html links, with their query and "#/…" part, to the app at "/"', () => {
    const script = read('src/legacyApp.ts');
    expect(script).toContain('window.location.search');
    expect(script).toContain('window.location.hash');
    expect(script).toContain("replace(`/${");
    expect(read('app.html')).toContain('/src/legacyApp.ts');
    expect(read('app.html')).toContain('noindex');
  });

  it('starts the demo from a link', () => {
    expect(APP_PATH).toBe('/');
    expect(DEMO_PATH).toBe(`${APP_PATH}?demo=1`);
    expect(read('src/store.tsx')).toContain("params.get('demo') === '1'");
  });

  it('keeps the strict content security policy for every page', () => {
    const headers = JSON.parse(read('vercel.json')).headers;
    expect(headers).toHaveLength(1);
    expect(headers[0].source).toBe('/(.*)'); // applies to /, /app and /privacy alike
    expect(JSON.parse(read('vercel.json')).cleanUrls).toBe(true);
  });
});
