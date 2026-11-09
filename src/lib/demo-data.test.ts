import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildPack, generateDemo, PACK_FILES } from './demoData';
import { parseLedgerCsv } from './csv';
import { planImport, recordKey } from './dedupe';
import { forecastCurrentMonth } from './forecast';
import { sumCents } from './money';
import { detectRecurring } from './recurring';

const dir = resolve(__dirname, '../../public/demo');
const read = (f: string) => readFileSync(resolve(dir, f), 'utf8');
const manifest = JSON.parse(read('manifest.json')) as { seed: number; end: string; rows: number; providers: number; totalCents: number };

describe('synthetic demo pack', () => {
  it('committed files match the generator for the recorded seed and end date', () => {
    const pack = buildPack({ seed: manifest.seed, end: manifest.end });
    for (const [name, text] of Object.entries(pack.files)) expect(read(name)).toBe(text);
  });

  it('is deterministic, and earlier months do not change when the end date moves', () => {
    expect(generateDemo({ seed: 7, end: '2026-11-09' })).toEqual(generateDemo({ seed: 7, end: '2026-11-09' }));
    const short = generateDemo({ seed: 7, end: '2026-06-30' });
    const long = generateDemo({ seed: 7, end: '2027-03-15' }).filter((r) => r.date <= '2026-06-30');
    expect(long).toEqual(short);
    expect(generateDemo({ seed: 8, end: '2026-11-09' })).not.toEqual(generateDemo({ seed: 7, end: '2026-11-09' }));
  });

  it('imports cleanly with 24 providers and matches the manifest', () => {
    const p = parseLedgerCsv(read(PACK_FILES.full));
    expect(p.fatal).toBeNull();
    expect(p.errors).toEqual([]);
    expect(p.rows).toHaveLength(manifest.rows);
    expect(new Set(p.rows.map((r) => r.provider)).size).toBe(24);
    expect(manifest.providers).toBe(24);
    expect(sumCents(p.rows)).toBe(manifest.totalCents);
    expect(p.rows.every((r) => r.date <= manifest.end && r.amountCents > 0)).toBe(true);
  });

  it('contains exactly one pair of identical charges, which is kept on import', () => {
    const rows = parseLedgerCsv(read(PACK_FILES.full)).rows;
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(recordKey(r), (counts.get(recordKey(r)) ?? 0) + 1);
    expect([...counts.values()].filter((c) => c > 1)).toEqual([2]);
    expect(planImport(rows, []).toAdd).toHaveLength(rows.length);
  });

  it('part 1 + part 2 rebuild the full history, with only the overlap skipped', () => {
    const full = parseLedgerCsv(read(PACK_FILES.full)).rows;
    const p1 = parseLedgerCsv(read(PACK_FILES.part1)).rows;
    const p2 = parseLedgerCsv(read(PACK_FILES.part2)).rows;
    const plan = planImport(p2, p1);
    expect(plan.duplicates.length).toBeGreaterThan(0);
    expect(p1.length + plan.toAdd.length).toBe(full.length);
    expect(sumCents(p1) + sumCents(plan.toAdd)).toBe(sumCents(full));
  });

  it('errors file has 6 invalid rows and nothing new to add', () => {
    const full = parseLedgerCsv(read(PACK_FILES.full)).rows;
    const p = parseLedgerCsv(read(PACK_FILES.errors));
    expect(p.errors).toHaveLength(6);
    expect(planImport(p.rows, full).toAdd).toHaveLength(0);
  });

  it('supports the demo story: forecast available and recurring patterns found', () => {
    const rows = parseLedgerCsv(read(PACK_FILES.full)).rows;
    expect(forecastCurrentMonth(rows, manifest.end).status).toBe('ok');
    const providers = new Set(detectRecurring(rows, manifest.end).map((p) => p.provider));
    for (const p of ['OpenAI', 'Anthropic', 'GitHub', 'Midjourney', 'Cursor', 'ElevenLabs']) expect(providers).toContain(p);
  });

  it('public/ (everything that gets deployed) contains no CSV except the synthetic pack', () => {
    const files = readdirSync(resolve(__dirname, '../../public'), { recursive: true }).map(String);
    const csvs = files.filter((f) => f.toLowerCase().endsWith('.csv')).map((f) => f.split(/[\\/]/).pop());
    expect(csvs.sort()).toEqual(Object.values(PACK_FILES).sort());
  });
});
