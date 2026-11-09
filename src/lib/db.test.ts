import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseLedgerCsv, toLedgerCsv } from './csv';
import { clearAll, closeDb, commitImport, loadAll } from './db';
import { sumCents } from './money';

const csvText = readFileSync(resolve(__dirname, '__fixtures__/ledger.csv'), 'utf8');

describe('IndexedDB storage', () => {
  beforeEach(async () => {
    await clearAll();
  });

  it('stores the fixture ledger and reads it back after reconnecting', async () => {
    const p = parseLedgerCsv(csvText);
    const res = await commitImport('ledger.csv', p.rows, p.rowsInFile, 0);
    expect(res.added).toBe(296);
    await closeDb(); // simulate a page reload
    const { transactions, imports } = await loadAll();
    expect(transactions).toHaveLength(296);
    expect(sumCents(transactions)).toBe(581003);
    expect(new Set(transactions.map((t) => t.provider)).size).toBe(24);
    expect(imports).toHaveLength(1);
    expect(imports[0]).toMatchObject({ fileName: 'ledger.csv', added: 296, skippedDuplicates: 0 });
  });

  it('exports and re-imports without creating duplicates', async () => {
    const p = parseLedgerCsv(csvText);
    await commitImport('ledger.csv', p.rows, p.rowsInFile, 0);
    const { transactions } = await loadAll();
    const exported = parseLedgerCsv(toLedgerCsv(transactions));
    const res = await commitImport('export.csv', exported.rows, exported.rowsInFile, 0);
    expect(res.added).toBe(0);
    expect(res.skippedDuplicates).toBe(296);
    const after = await loadAll();
    expect(after.transactions).toHaveLength(296);
    expect(sumCents(after.transactions)).toBe(581003);
  });

  it('adds only new records from an overlapping file', async () => {
    const p = parseLedgerCsv(csvText);
    await commitImport('ledger.csv', p.rows.slice(0, 100), 100, 0);
    const res = await commitImport('ledger.csv', p.rows, p.rowsInFile, 0);
    expect(res.added).toBe(196);
    expect(res.skippedDuplicates).toBe(100);
    expect((await loadAll()).transactions).toHaveLength(296);
  });

  it('clears all data', async () => {
    const p = parseLedgerCsv(csvText);
    await commitImport('ledger.csv', p.rows, p.rowsInFile, 0);
    await clearAll();
    const { transactions, imports } = await loadAll();
    expect(transactions).toHaveLength(0);
    expect(imports).toHaveLength(0);
  });
});
