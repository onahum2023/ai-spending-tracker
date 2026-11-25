import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderWelcomeMeta } from './welcome';
import { PRODUCTION_URL, renderSitemap } from './site';

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

  it('is what robots.txt points to, and the sitemap is built from it with only pages that may be indexed', () => {
    expect(read('public/robots.txt')).toContain(`Sitemap: ${PRODUCTION_URL}/sitemap.xml`);
    expect(existsSync(join(root, 'public/sitemap.xml'))).toBe(false); // generated at build time by vite.config.ts, with lastmod
    const config = read('vite.config.ts');
    expect(config).toContain('renderSitemap(siteUrl(), pages)');
    // the old /app address is noindex, and so is the privacy page while it is a draft: neither is advertised in the sitemap
    expect(config).not.toMatch(/path: '\/app/);
    expect(config).toContain('if (!PRIVACY_IS_DRAFT)');
    expect(read('app.html')).toContain('noindex'); // the old /app address only forwards
  });

  it('renders a sitemap with absolute addresses and an optional lastmod', () => {
    const xml = renderSitemap('https://example.org/', [{ path: '/', lastmod: '2026-11-25' }, { path: '/privacy' }]);
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual(['https://example.org/', 'https://example.org/privacy']);
    expect(xml).toContain('<lastmod>2026-11-25</lastmod>');
    expect(xml.match(/<lastmod>/g)).toHaveLength(1);
  });
});
