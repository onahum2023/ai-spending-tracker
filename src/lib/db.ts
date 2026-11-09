import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { ParsedRow } from './csv';
import { planImport } from './dedupe';
import type { ImportRecord, Transaction } from './types';

interface LedgerDB extends DBSchema {
  transactions: { key: number; value: Transaction; indexes: { date: string } };
  imports: { key: number; value: ImportRecord };
}

export const DB_NAME = 'ai-spending-tracker';

let dbPromise: Promise<IDBPDatabase<LedgerDB>> | null = null;

function db() {
  if (!dbPromise) {
    dbPromise = openDB<LedgerDB>(DB_NAME, 1, {
      upgrade(d) {
        const tx = d.createObjectStore('transactions', { keyPath: 'id', autoIncrement: true });
        tx.createIndex('date', 'date');
        d.createObjectStore('imports', { keyPath: 'id', autoIncrement: true });
      },
    });
  }
  return dbPromise;
}

/** Stable order: by date, then by insertion order. */
function sortTransactions(rows: Transaction[]): Transaction[] {
  return rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
}

export async function loadAll(): Promise<{ transactions: Transaction[]; imports: ImportRecord[] }> {
  const d = await db();
  const [transactions, imports] = await Promise.all([d.getAll('transactions'), d.getAll('imports')]);
  return { transactions: sortTransactions(transactions), imports };
}

export interface CommitResult {
  importRecord: ImportRecord;
  added: number;
  skippedDuplicates: number;
}

/**
 * Writes an import in a single IndexedDB transaction. The duplicate check is
 * re-run against what is stored at commit time, so the result is authoritative
 * even if the preview was computed earlier.
 */
export async function commitImport(
  fileName: string,
  rows: ParsedRow[],
  rowsInFile: number,
  invalid: number,
): Promise<CommitResult> {
  const d = await db();
  const tx = d.transaction(['transactions', 'imports'], 'readwrite');
  const txStore = tx.objectStore('transactions');
  const existing = await txStore.getAll();
  const plan = planImport(rows, existing);

  const record: Omit<ImportRecord, 'id'> = {
    fileName,
    importedAt: new Date().toISOString(),
    rowsInFile,
    added: plan.toAdd.length,
    skippedDuplicates: plan.duplicates.length,
    invalid,
  };
  const importId = await tx.objectStore('imports').add(record as ImportRecord);
  for (const r of plan.toAdd) {
    await txStore.add({
      merchant: r.merchant,
      provider: r.provider,
      amountCents: r.amountCents,
      date: r.date,
      sourceRow: r.sourceRow,
      importId,
    } as Transaction);
  }
  await tx.done;
  return {
    importRecord: { ...record, id: importId },
    added: plan.toAdd.length,
    skippedDuplicates: plan.duplicates.length,
  };
}

export async function clearAll(): Promise<void> {
  const d = await db();
  const tx = d.transaction(['transactions', 'imports'], 'readwrite');
  await Promise.all([tx.objectStore('transactions').clear(), tx.objectStore('imports').clear()]);
  await tx.done;
}

/** For tests: drop the cached connection. */
export async function closeDb(): Promise<void> {
  if (dbPromise) (await dbPromise).close();
  dbPromise = null;
}
