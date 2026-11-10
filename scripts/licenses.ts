/*
 * Dependency license audit and third-party notices.
 *
 * Walks the production dependency tree from package-lock.json (what ends up in the app a visitor
 * downloads, not the build and test tools), checks every license against an allowlist of
 * permissive licenses, and writes public/third-party-notices.txt with each package's license text.
 *
 * Usage:
 *   node scripts/licenses.ts            rewrite public/third-party-notices.txt
 *   node scripts/licenses.ts --check    fail if a license is not allowed or the notices file is out of date
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Licenses that allow use in a closed or open product as long as the notice is kept. */
export const ALLOWED = new Set(['MIT', 'ISC', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD', 'Unlicense', 'CC0-1.0', 'BlueOak-1.0.0']);

export interface Dependency {
  name: string;
  version: string;
  license: string;
  /** Path inside node_modules, relative to the project root. */
  path: string;
}

interface LockEntry {
  version: string;
  license?: string;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

/** Every package reachable from the root's dependencies, resolved the way Node resolves them. */
export function productionDependencies(root: string): Dependency[] {
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8')) as { packages: Record<string, LockEntry> };
  const pk = lock.packages;
  const resolveFrom = (from: string, name: string): string | null => {
    let base = from;
    for (;;) {
      const cand = `${base ? base + '/' : ''}node_modules/${name}`;
      if (cand in pk) return cand;
      if (!base) return null;
      const i = base.lastIndexOf('/node_modules/');
      base = i < 0 ? '' : base.slice(0, i);
    }
  };
  const seen = new Map<string, LockEntry>();
  const stack: [string, string][] = Object.keys(pk['']?.dependencies ?? {}).map((n) => ['', n]);
  while (stack.length) {
    const [from, name] = stack.pop()!;
    const path = resolveFrom(from, name);
    if (!path || seen.has(path)) continue;
    const entry = pk[path];
    seen.set(path, entry);
    for (const d of [...Object.keys(entry.dependencies ?? {}), ...Object.keys(entry.optionalDependencies ?? {})]) stack.push([path, d]);
  }
  return [...seen.entries()]
    .map(([path, e]) => ({ name: path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length), version: e.version, license: e.license ?? 'UNKNOWN', path }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
}

/** Splits "MIT AND ISC", "(MIT OR Apache-2.0)" into its identifiers. */
export const licenseIds = (expr: string): string[] => expr.split(/\s+(?:AND|OR)\s+|[()]/).map((s) => s.trim()).filter(Boolean);

export const disallowed = (deps: Dependency[]): Dependency[] => deps.filter((d) => !licenseIds(d.license).every((id) => ALLOWED.has(id)));

const FILE = /^(licen[cs]e|copying|notice)([-_.].*)?$/i;

function readNoticeFiles(root: string, dep: Dependency): { file: string; text: string }[] {
  const dir = join(root, dep.path);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => FILE.test(f) && !/\.(js|mjs|cjs|ts)$/i.test(f))
    .sort()
    .map((file) => ({ file, text: readFileSync(join(dir, file), 'utf8').trim() }));
}

export function buildNotices(root: string, deps = productionDependencies(root)): string {
  const lines: string[] = [
    'Third-party notices',
    '',
    'This app includes the open source software below. Each package is listed with its license and the',
    'license text it ships with. The list is generated from package-lock.json by `npm run licenses`.',
    '',
    `${deps.length} packages, licenses: ${[...new Set(deps.map((d) => d.license))].sort().join(', ')}`,
    '',
  ];
  for (const dep of deps) {
    lines.push('='.repeat(78), `${dep.name} ${dep.version}`, `License: ${dep.license}`, '');
    const files = readNoticeFiles(root, dep);
    if (files.length === 0) lines.push(`(The package ships no license file; its package.json declares ${dep.license}.)`, '');
    for (const f of files) lines.push(f.text, '');
  }
  return lines.join('\n').replace(/\r\n/g, '\n');
}

function main() {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const out = join(root, 'public/third-party-notices.txt');
  const deps = productionDependencies(root);
  const bad = disallowed(deps);
  if (bad.length) {
    console.error('Licenses not on the allowlist (check them before shipping):');
    for (const d of bad) console.error(`  ${d.name}@${d.version}: ${d.license}`);
    process.exit(1);
  }
  const text = buildNotices(root, deps);
  if (process.argv.includes('--check')) {
    if (!existsSync(out) || readFileSync(out, 'utf8') !== text) {
      console.error('public/third-party-notices.txt is out of date. Run: npm run licenses');
      process.exit(1);
    }
    console.log(`OK: ${deps.length} production packages, all licenses allowed, notices up to date.`);
    return;
  }
  writeFileSync(out, text);
  console.log(`Wrote ${out} (${deps.length} packages, ${(text.length / 1024).toFixed(0)} KB)`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
