import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderWelcomeMeta } from './welcome';
import { PRIVACY_IS_DRAFT } from './privacy';
import { PRODUCTION_URL } from './site';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('production address', () => {
  it('is an https address with no trailing slash', () => {
    expect(PRODUCTION_URL).toMatch(/^https:\/\/[a-z0-9.-]+$/);
  });

  it('is what the Welcome page (index.html) names as canonical and as its social card', () => {
    const meta = renderWelcomeMeta(PRODUCTION_URL);
    expect(meta).toContain(`<link rel="canonical" href="${PRODUCTION_URL}/" />`);
    expect(meta).toContain(`content="${PRODUCTION_URL}/og-image.png"`);
    expect(read('vite.config.ts')).toContain('PRODUCTION_URL');
  });

  it('is what robots.txt and sitemap.xml point to, and the sitemap lists only pages that may be indexed', () => {
    expect(read('public/robots.txt')).toContain(`Sitemap: ${PRODUCTION_URL}/sitemap.xml`);
    const locs = [...read('public/sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toContain(`${PRODUCTION_URL}/`);
    // the app and the draft privacy page are noindex: they must not be advertised in a sitemap
    expect(locs.some((l) => /\/app/.test(l))).toBe(false);
    if (PRIVACY_IS_DRAFT) expect(locs.some((l) => /privacy/.test(l))).toBe(false);
    expect(read('app.html')).toContain('noindex'); // the old /app address only forwards
  });
});
