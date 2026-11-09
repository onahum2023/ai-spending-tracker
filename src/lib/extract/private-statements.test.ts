import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { classifyRows, summarize } from './classify';
import { extractFromPdfItems, extractFromTables } from './load';
import type { PdfTextItem } from './revolut';
import type { ReadResult } from './types';

/*
 * Optional checks against real statements in inbox/ (git-ignored, never committed).
 * Skipped when the folder is empty or missing. Asserts no specific figures.
 * Run with SHOW_EXTRACT=1 to print a per-provider summary locally.
 */
const dir = resolve(__dirname, '../../../inbox');
const files = existsSync(dir) ? readdirSync(dir).filter((f) => /\.(pdf|xlsx|csv)$/i.test(f)).sort() : [];

async function readNode(file: string): Promise<ReadResult> {
  const path = resolve(dir, file);
  if (/\.pdf$/i.test(file)) {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await getDocument({ data: new Uint8Array(readFileSync(path)), isEvalSupported: false, verbosity: 0 }).promise;
    const items: PdfTextItem[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      for (const it of (await (await doc.getPage(p)).getTextContent()).items) {
        if ('str' in it && it.str.trim()) items.push({ page: p, x: it.transform[4], y: it.transform[5], str: it.str });
      }
    }
    return extractFromPdfItems(file, items);
  }
  if (/\.xlsx$/i.test(file)) {
    const { default: readXlsxFile, readSheetNames } = await import('read-excel-file/node');
    const tables = [];
    for (const sheet of await readSheetNames(path)) tables.push({ name: sheet, table: (await readXlsxFile(path, { sheet })) as unknown[][] });
    return extractFromTables(file, tables);
  }
  const Papa = (await import('papaparse')).default;
  return extractFromTables(file, [{ name: file, table: Papa.parse<string[]>(readFileSync(path, 'utf8'), { skipEmptyLines: 'greedy' }).data }]);
}

describe.skipIf(files.length === 0)('real statements in inbox/ (local only)', () => {
  it('reads every file and classifies every row with reasons', async () => {
    const results = await Promise.all(files.map(readNode));
    for (const r of results) {
      expect(r.error, `${r.fileName}: ${r.error}`).toBeUndefined();
      expect(r.rows.length).toBeGreaterThan(0);
    }
    const all = results.flatMap((r) => r.rows);
    const classified = classifyRows(all);
    for (const c of classified) {
      expect(c.reasons.length).toBeGreaterThan(0);
      if (c.decision === 'include') {
        expect(c.provider).toBeTruthy();
        expect(c.type).toBeTruthy();
        expect(['payment', 'internal']).not.toContain(c.row.kind);
      }
    }

    if (process.env.SHOW_EXTRACT) {
      for (const r of results) console.log(`${r.fileName}: ${r.format}, ${r.rows.length} rows. ${r.notes.join(' ')}`);
      const s = summarize(classified);
      console.log(`include ${s.include}, review ${s.review}, exclude ${s.exclude}`);
      const inc = classified.filter((c) => c.decision === 'include');
      const byProv = new Map<string, { n: number; cents: number; types: Set<string> }>();
      for (const c of inc) {
        const e = byProv.get(c.provider!) ?? { n: 0, cents: 0, types: new Set() };
        e.n++;
        e.cents += c.row.amountCents;
        e.types.add(c.type!);
        byProv.set(c.provider!, e);
      }
      console.log(`TOTAL ${inc.length} rows, ${inc.reduce((a, c) => a + c.row.amountCents, 0)} cents`);
      for (const [p, e] of [...byProv].sort((a, b) => b[1].cents - a[1].cents)) console.log(`  ${p}: ${e.n} rows, ${e.cents} cents, types ${[...e.types].join('/')}`);
      console.log('REVIEW:');
      for (const c of classified.filter((x) => x.decision === 'review')) console.log(`  ${c.row.date} ${c.row.merchant} | ${c.row.label ?? ''} | ${c.row.amountCents} | ${c.reasons.join('; ')}`);
      if (process.env.SHOW_EXTRACT === 'all') {
        console.log('INCLUDED:');
        for (const c of inc) console.log(`  ${c.row.date} ${c.provider} ${c.type} ${c.row.amountCents} | ${c.row.merchant} | ${c.reasons.at(-1)}`);
      }
    }
  }, 120_000);
});
