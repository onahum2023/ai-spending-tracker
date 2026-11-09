import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALLOWED, disallowed, licenseIds, productionDependencies } from '../../scripts/licenses.ts';

const root = resolve(__dirname, '../..');

describe('dependency licenses', () => {
  const deps = productionDependencies(root);

  it('finds the packages that ship in the app, and not the build and test tools', () => {
    const names = new Set(deps.map((d) => d.name));
    for (const n of ['react', 'recharts', 'idb', 'papaparse', 'pdfjs-dist', 'zod']) expect(names.has(n)).toBe(true);
    for (const n of ['vite', 'vitest', 'typescript', 'fake-indexeddb']) expect(names.has(n)).toBe(false);
  });

  it('uses only permissive licenses, so any license can be chosen for this app', () => {
    expect(disallowed(deps)).toEqual([]);
    expect(deps.every((d) => d.license !== 'UNKNOWN')).toBe(true);
  });

  it('understands license expressions', () => {
    expect(licenseIds('MIT AND ISC AND BSD-3-Clause')).toEqual(['MIT', 'ISC', 'BSD-3-Clause']);
    expect(licenseIds('(MIT OR Apache-2.0)')).toEqual(['MIT', 'Apache-2.0']);
    expect(disallowed([{ name: 'x', version: '1', license: 'GPL-3.0-only', path: 'node_modules/x' }])).toHaveLength(1);
    expect(ALLOWED.has('AGPL-3.0-only')).toBe(false);
  });

  it('lists every production package in public/third-party-notices.txt (run `npm run licenses` after changing dependencies)', () => {
    const notices = readFileSync(resolve(root, 'public/third-party-notices.txt'), 'utf8');
    const missing = deps.filter((d) => !notices.includes(`${d.name} ${d.version}\nLicense: ${d.license}`)).map((d) => `${d.name}@${d.version}`);
    expect(missing).toEqual([]);
  });
});
