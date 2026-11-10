import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUILD_INFO } from '../buildInfo';

describe('build info', () => {
  it('carries the package version and a build date, and no license until one is chosen', () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf8')) as { version: string; license?: string };
    expect(BUILD_INFO.version).toBe(pkg.version);
    expect(BUILD_INFO.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(BUILD_INFO.commit).toMatch(/^([0-9a-f]{7})?$/);
    expect(BUILD_INFO.license).toBe(pkg.license ?? '');
  });
});
