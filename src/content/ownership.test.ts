import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderNoscript } from './welcome';
import { renderPrivacyBody } from './privacy';
import { BRAND, BRAND_NOTE, BRAND_URL, CONTACT_EMAIL, COPYRIGHT, COPYRIGHT_YEAR, OWNER, OWNER_URL, OWNERSHIP_LINE, TRADING_AS } from './site';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('ownership', () => {
  it('names NeotixHQ as the brand and NuCielo ICT B.V. as the legal owner, once', () => {
    expect(BRAND).toBe('NeotixHQ');
    expect(OWNER).toBe('NuCielo ICT B.V.');
    expect(COPYRIGHT).toBe('© 2026 NuCielo ICT B.V.');
    expect(OWNERSHIP_LINE).toBe('AI Spending Tracker is a product of NeotixHQ, a brand of NuCielo ICT B.V.');
  });

  it('shows up in the page text for browsers without scripts, the About card, the app footer and the README (not in the privacy statement: ownership is not a privacy matter)', () => {
    // the footer text, with its two company links read as plain text
    expect(renderNoscript().replace(/<[^>]+>/g, '')).toContain(`${COPYRIGHT} · ${OWNERSHIP_LINE}`);
    expect(renderPrivacyBody()).not.toContain(OWNERSHIP_LINE);
    expect(renderPrivacyBody()).not.toContain(COPYRIGHT);
    expect(read('src/components/AboutCard.tsx')).toMatch(/COPYRIGHT[\s\S]*BRAND[\s\S]*OWNER/);
    expect(read('src/App.tsx')).toContain('{COPYRIGHT}');
    expect(read('README.md')).toContain('legally owned by **[NuCielo ICT B.V.](https://nucielo.io/)**');
  });

  it('has no doubled full stops in any of it', () => {
    const pages = [renderNoscript(), renderPrivacyBody(), read('src/components/AboutCard.tsx')].map((t) => t.replace(/<[^>]+>/g, ' '));
    for (const t of pages) expect(t).not.toMatch(/B\.V\.\./);
  });

  it('names NuCielo ICT B.V., trading as NeotixHQ, as the operator, with the contact address, and says NeotixHQ is not a legal entity', () => {
    expect(TRADING_AS).toBe('NuCielo ICT B.V., trading as NeotixHQ');
    expect(CONTACT_EMAIL).toBe('info@neotixhq.com');
    expect(BRAND_NOTE).toBe('NeotixHQ is a brand, not a separate legal entity.');
    const body = renderPrivacyBody();
    expect(body).toContain('Operator: NuCielo ICT B.V., trading as NeotixHQ. Contact for privacy questions: info@neotixhq.com.');
    expect(body).toContain(BRAND_NOTE);
    expect(body).not.toMatch(/Controller name: to be decided|Contact email: to be decided/);
    expect(renderNoscript()).toContain('href="mailto:info@neotixhq.com"');
  });

  it('links to the NeotixHQ and NuCielo websites from the no-script text, the privacy page (operator links), the About card and the README', () => {
    expect(BRAND_URL).toBe('https://neotixhq.com/');
    expect(OWNER_URL).toBe('https://nucielo.io/');
    const landing = renderNoscript();
    expect(landing).toContain(`<a href="${BRAND_URL}" rel="noopener noreferrer">${BRAND}</a>`);
    expect(landing).toContain(`<a href="${OWNER_URL}" rel="noopener noreferrer">${OWNER}</a>`);
    const privacy = renderPrivacyBody();
    expect(privacy).toContain(`href="${BRAND_URL}"`);
    expect(privacy).toContain(`href="${OWNER_URL}"`);
    const about = read('src/components/AboutCard.tsx');
    expect(about).toContain('href={BRAND_URL}');
    expect(about).toContain('href={OWNER_URL}');
    expect(read('README.md')).toContain('(https://neotixhq.com/)');
    expect(read('README.md')).toContain('(https://nucielo.io/)');
  });

  it('is released under Apache-2.0, with the copyright holder in NOTICE and the brand kept out of the licence', () => {
    expect(JSON.parse(read('package.json')).license).toBe('Apache-2.0');
    expect(read('LICENSE')).toMatch(/^\s*Apache License\s+Version 2\.0, January 2004/);
    expect(read('LICENSE')).toContain('END OF TERMS AND CONDITIONS');
    expect(read('NOTICE')).toContain(`Copyright ${COPYRIGHT_YEAR} ${OWNER}`);
    expect(read('NOTICE')).toMatch(/not licensed for use\s+as trademarks/);
    // the version info in the app and on the landing page picks it up from package.json
    expect(read('vite.config.ts')).toContain('(pkg as { license?: string }).license');
  });
});
