import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { ParsedRow } from './csv';
import { applyTagRules, type TagRule } from './tags';
import { planImport } from './dedupe';
import type { ImportRecord, Transaction } from './types';

interface LedgerDB extends DBSchema {
  transactions: { key: number; value: Transaction; indexes: { date: string } };
  imports: { key: number; value: ImportRecord };
  /** Small key/value settings, e.g. budgets. */
  settings: { key: string; value: unknown };
}

export const DB_NAME = 'ai-spending-tracker';

let dbPromise: Promise<IDBPDatabase<LedgerDB>> | null = null;

function db() {
  if (!dbPromise) {
    dbPromise = openDB<LedgerDB>(DB_NAME, 2, {
      upgrade(d, oldVersion) {
        if (oldVersion < 1) {
          const tx = d.createObjectStore('transactions', { keyPath: 'id', autoIncrement: true });
          tx.createIndex('date', 'date');
          d.createObjectStore('imports', { keyPath: 'id', autoIncrement: true });
        }
        if (oldVersion < 2) d.createObjectStore('settings');
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
  /** Added charges that got their tag from a tag rule. */
  taggedByRule: number;
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
  tagRules: TagRule[] = [],
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
  // A tag in the file wins; charges that arrive without one get their provider's rule.
  const { rows: toAdd, tagged } = applyTagRules(plan.toAdd, tagRules);
  for (const r of toAdd) {
    await txStore.add({
      merchant: r.merchant,
      provider: r.provider,
      amountCents: r.amountCents,
      date: r.date,
      ...(r.type ? { type: r.type } : {}),
      ...(r.tag ? { tag: r.tag } : {}),
      sourceRow: r.sourceRow,
      importId,
    } as Transaction);
  }
  await tx.done;
  return {
    importRecord: { ...record, id: importId },
    added: plan.toAdd.length,
    skippedDuplicates: plan.duplicates.length,
    taggedByRule: tagged,
  };
}

/** Sets (or, with null, removes) the tag on the given transactions, in one IndexedDB transaction. */
export async function setTags(ids: number[], tag: string | null): Promise<void> {
  const d = await db();
  const tx = d.transaction('transactions', 'readwrite');
  const store = tx.objectStore('transactions');
  for (const id of ids) {
    const row = await store.get(id);
    if (!row) continue;
    const { tag: _old, ...rest } = row;
    await store.put(tag ? { ...rest, tag } : rest);
  }
  await tx.done;
}

export async function loadSetting(key: string): Promise<unknown> {
  return (await db()).get('settings', key);
}

export async function saveSetting(key: string, value: unknown): Promise<void> {
  await (await db()).put('settings', value, key);
}

/** Removes everything: transactions, import history, tags, budgets, corrections, labels, categories and tag rules. */
export async function clearAll(): Promise<void> {
  const d = await db();
  const tx = d.transaction(['transactions', 'imports', 'settings'], 'readwrite');
  await Promise.all([
    tx.objectStore('transactions').clear(),
    tx.objectStore('imports').clear(),
    tx.objectStore('settings').clear(),
  ]);
  await tx.done;
}

/** For tests: drop the cached connection. */
export async function closeDb(): Promise<void> {
  if (dbPromise) (await dbPromise).close();
  dbPromise = null;
}
