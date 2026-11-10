import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderLandingBody } from './landing';
import { renderPrivacyBody } from './privacy';
import { BRAND, COPYRIGHT, OWNER, OWNERSHIP_LINE } from './site';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('ownership', () => {
  it('names NeotixHQ as the brand and NuCielo ICT B.V. as the legal owner, once', () => {
    expect(BRAND).toBe('NeotixHQ');
    expect(OWNER).toBe('NuCielo ICT B.V.');
    expect(COPYRIGHT).toBe('© 2026 NuCielo ICT B.V.');
    expect(OWNERSHIP_LINE).toBe('AI Spending Tracker is a product of NeotixHQ, a brand of NuCielo ICT B.V.');
  });

  it('shows up on the landing page, the privacy page, the About card, the app footer and the README', () => {
    expect(renderLandingBody({ version: '1', commit: '', license: '' })).toContain(`${COPYRIGHT} · ${OWNERSHIP_LINE}`);
    expect(renderPrivacyBody()).toContain(OWNERSHIP_LINE);
    expect(renderPrivacyBody()).toContain(COPYRIGHT);
    expect(read('src/components/AboutCard.tsx')).toMatch(/COPYRIGHT[\s\S]*BRAND[\s\S]*OWNER/);
    expect(read('src/App.tsx')).toContain('{COPYRIGHT}');
    expect(read('README.md')).toContain('legally owned by **NuCielo ICT B.V.**');
  });

  it('has no doubled full stops in any of it', () => {
    const pages = [renderLandingBody({ version: '1', commit: '', license: '' }), renderPrivacyBody(), read('src/components/AboutCard.tsx')].map((t) => t.replace(/<[^>]+>/g, ' '));
    for (const t of pages) expect(t).not.toMatch(/B\.V\.\./);
  });

  it('does not claim a licence or name a data controller by the ownership notice alone', () => {
    expect(read('package.json')).not.toMatch(/"license"/);
    expect(renderPrivacyBody()).toContain('Controller:');
    expect(renderPrivacyBody()).toMatch(/Controller: \[Controller name: to be decided\]/);
  });
});
