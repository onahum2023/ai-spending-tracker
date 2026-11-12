import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_PATH, DEMO_PATH, FAQ, FEATURES, HEADLINE, META_DESCRIPTION, OVERVIEW_SHOT, renderNoscript, renderWelcomeMeta, STEPS } from './welcome';
import { PRIVACY_PATH, PRIVACY_SENTENCE } from './privacy';
import { PRODUCTION_URL } from './site';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('welcome page', () => {
  it('explains the product, says the privacy sentence, and has a demo and an import way in', () => {
    expect(HEADLINE).toBe('What do you spend on AI tools?');
    expect(FEATURES).toHaveLength(4);
    expect(STEPS.length).toBeGreaterThanOrEqual(3);
    expect(FAQ.length).toBeGreaterThanOrEqual(5);
    const page = read('src/pages/Welcome.tsx');
    expect(page).toContain('Explore demo data');
    expect(page).toContain('Import your own data');
    expect(page).toContain('PRIVACY_SENTENCE');
    expect(page).toContain('PRIVACY_PATH');
    for (const part of ['FEATURES', 'STEPS', 'FAQ']) expect(page).toContain(part);
    // the primary action is the demo, the import is secondary: one primary button on the page
    expect(page.match(/variant="primary"/g)).toHaveLength(2); // demo (no data) or back into the app (data): never both
    expect(read('src/content/privacy.ts')).toContain('PRIVACY_SENTENCE');
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

  it('shows the Overview below the buttons, with a dark version, alt text and a size', () => {
    const page = read('src/pages/Welcome.tsx');
    expect(page.indexOf('welcome-actions')).toBeLessThan(page.indexOf('<picture'));
    expect(page).toContain('prefers-color-scheme: dark');
    for (const f of [OVERVIEW_SHOT.light, OVERVIEW_SHOT.dark]) expect(existsSync(join(root, 'public', f))).toBe(true);
    expect(OVERVIEW_SHOT.alt.length).toBeGreaterThan(20);
    expect(OVERVIEW_SHOT.width).toBeGreaterThan(0);
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
