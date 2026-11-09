/*
 * Writes the synthetic demo pack to disk (for presenters and manual import demos).
 * The app itself generates the same demo data in the browser, ending today.
 *
 * Usage:
 *   node scripts/generate-demo-data.ts [--end YYYY-MM-DD] [--seed N] [--out public/demo]
 *   (--end defaults to today)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildPack, DEFAULT_SEED, todayLocal } from '../src/lib/demoData.ts';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const seed = Number(arg('seed') ?? DEFAULT_SEED);
const end = arg('end') ?? todayLocal();
const out = resolve(arg('out') ?? 'public/demo');
const pack = buildPack({ seed, end });
mkdirSync(out, { recursive: true });
for (const [name, text] of Object.entries(pack.files)) writeFileSync(join(out, name), text);
writeFileSync(join(out, 'manifest.json'), JSON.stringify(pack.manifest, null, 2) + '\n');
const m = pack.manifest;
console.log(`Wrote synthetic demo pack to ${out}`);
console.log(`  ${m.rows} rows · ${m.providers} providers · ${m.total} · ${m.firstDate} → ${m.lastDate} (seed ${seed})`);
