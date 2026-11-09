import 'fake-indexeddb/auto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseLedgerCsv, toLedgerCsv } from './csv';
import { clearAll, commitImport, loadAll } from './db';
import { planImport } from './dedupe';
import { sumCents } from './money';

/*
 * Optional checks against your own ledgers in private/ (git-ignored, never committed).
 * Skipped when the folder is empty or missing, e.g. on a fresh clone or in CI.
 * Deliberately asserts no specific figures, so nothing about the data ends up in the repo.
 */
const dir = resolve(__dirname, '../../private');
const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.csv')) : [];

describe.skipIf(files.length === 0)('private ledgers (local only)', () => {
  for (const file of files) {
    const text = readFileSync(resolve(dir, file), 'utf8');
    const parsed = parseLedgerCsv(text);

    it(`${file}: every row is valid`, () => {
      expect(parsed.fatal).toBeNull();
      expect(parsed.errors).toEqual([]);
      expect(parsed.rows.length).toBe(parsed.rowsInFile);
    });

    it(`${file}: export round-trips without changing any record`, () => {
      const again = parseLedgerCsv(toLedgerCsv(parsed.rows)).rows;
      expect(again.map(({ sourceRow: _s, ...r }) => r)).toEqual(parsed.rows.map(({ sourceRow: _s, ...r }) => r));
    });

    it(`${file}: stores every row and the exact total, and re-import adds nothing`, async () => {
      await clearAll();
      await commitImport(file, parsed.rows, parsed.rowsInFile, 0);
      const { transactions } = await loadAll();
      expect(transactions).toHaveLength(parsed.rows.length);
      expect(sumCents(transactions)).toBe(sumCents(parsed.rows));
      expect(planImport(parsed.rows, transactions).toAdd).toHaveLength(0);
      await clearAll();
    });
  }
});
