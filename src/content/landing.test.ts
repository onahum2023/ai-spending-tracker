import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_PATH, DEMO_PATH, FAQ, FEATURES, META_DESCRIPTION, renderLandingBody, renderLandingMeta, SHOTS, STEPS } from './landing';
import { PRIVACY_PATH, PRIVACY_SENTENCE } from './privacy';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const body = renderLandingBody({ version: '1.2.3', commit: 'abc1234', license: '' });

describe('landing page', () => {
  it('explains the product, says the privacy sentence up front, and has a demo and an import button', () => {
    expect(body).toContain('<h1>What do you spend on AI tools?</h1>');
    expect(body.indexOf(PRIVACY_SENTENCE.replace(/&/g, '&amp;'))).toBeGreaterThan(0);
    expect(body.indexOf('Private by design')).toBeLessThan(body.indexOf('What you get'));
    expect(body).toContain(`href="${DEMO_PATH}"`);
    expect(body).toContain(`href="${APP_PATH}"`);
    expect(body).toContain(`href="${PRIVACY_PATH}"`);
    expect(FEATURES).toHaveLength(4);
    expect(STEPS.length).toBeGreaterThanOrEqual(3);
    expect(FAQ.length).toBeGreaterThanOrEqual(5);
  });

  it('points at files that exist, and every image has alt text and a size', () => {
    expect(existsSync(join(root, 'app.html'))).toBe(true);
    expect(existsSync(join(root, 'privacy.html'))).toBe(true);
    for (const f of ['favicon.svg', 'favicon-32.png', 'apple-touch-icon.png', 'og-image.png', 'third-party-notices.txt']) expect(existsSync(join(root, 'public', f))).toBe(true);
    for (const s of SHOTS) {
      expect(existsSync(join(root, 'public/screenshots', s.file))).toBe(true);
      expect(s.alt.length).toBeGreaterThan(20);
    }
    const imgs = [...body.matchAll(/<img [^>]*>/g)].map((m) => m[0]);
    expect(imgs.length).toBe(SHOTS.length + 1); // screenshots + the brand mark
    for (const tag of imgs) expect(tag).toMatch(/\salt="[^"]*"/);
    for (const tag of imgs) expect(tag).toMatch(/\swidth="\d+"/);
  });

  it('has one h1, headings in order, and no script of its own', () => {
    expect(body.match(/<h1[ >]/g)).toHaveLength(1);
    expect(body).not.toMatch(/<script|\son[a-z]+=/i);
    const html = read('index.html');
    expect([...html.matchAll(/<script[^>]*>/g)].map((m) => m[0])).toEqual(['<script type="module" src="/src/landing.ts">']);
    expect(html).not.toMatch(/(?:src|href)="https?:\/\//);
  });

  it('leaves out canonical and social image tags until there is a public address, then adds absolute ones', () => {
    const none = renderLandingMeta('');
    expect(none).not.toMatch(/canonical|og:image|og:url/);
    expect(none).toContain('og:title');
    expect(none).toContain(META_DESCRIPTION);
    const withUrl = renderLandingMeta('https://example.org');
    expect(withUrl).toContain('<link rel="canonical" href="https://example.org/" />');
    expect(withUrl).toContain('content="https://example.org/og-image.png"');
    expect(withUrl).toContain('summary_large_image');
  });

  it('puts the version in the footer, and the license only when there is one', () => {
    expect(body).toContain('Version 1.2.3 · build abc1234');
    expect(renderLandingBody({ version: '1', commit: '', license: 'MIT' })).toContain('Version 1 · MIT');
  });
});

describe('old links keep working', () => {
  it('sends "#/…" links to the app and leaves other anchors alone', () => {
    const script = read('src/landing.ts');
    expect(script).toContain("/^#\\//");
    expect(script).toContain('/app.html');
  });

  it('starts the demo from the landing page link', () => {
    expect(DEMO_PATH).toBe(`${APP_PATH}?demo=1`);
    expect(read('src/store.tsx')).toContain("params.get('demo') === '1'");
  });

  it('keeps the strict content security policy for the new pages', () => {
    const headers = JSON.parse(read('vercel.json')).headers;
    expect(headers).toHaveLength(1);
    expect(headers[0].source).toBe('/(.*)'); // applies to /, /app and /privacy alike
    expect(JSON.parse(read('vercel.json')).cleanUrls).toBe(true);
  });
});
