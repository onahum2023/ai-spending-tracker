import type { LedgerRow } from './types';

/*
 * Duplicate-detection policy
 * --------------------------
 * The source data has no transaction IDs, so a record is identified by all four
 * of its values: date, provider, merchant descriptor and amount (exact match,
 * after trimming surrounding whitespace).
 *
 * Two identical charges on the same day can be legitimate, so we never collapse
 * identical rows inside one file. Instead we compare counts:
 *
 *   If a file contains a record N times and the store already holds it M times,
 *   we add max(0, N − M) copies.
 *
 * Re-importing the same file (or an export) therefore adds nothing, while a newer
 * statement that contains an extra identical charge still adds that extra copy.
 * Every skipped row is listed in the import preview; nothing is dropped silently.
 */

export function recordKey(r: LedgerRow): string {
  return JSON.stringify([r.date, r.provider, r.merchant, r.amountCents]);
}

export interface ImportPlan<T extends LedgerRow> {
  toAdd: T[];
  /** Rows skipped because the same record is already stored. */
  duplicates: T[];
  /** Records that appear more than once inside the incoming file (all kept unless already stored). */
  repeatedInFile: { row: T; count: number }[];
}

export function planImport<T extends LedgerRow>(incoming: T[], existing: LedgerRow[]): ImportPlan<T> {
  const stored = new Map<string, number>();
  for (const r of existing) {
    const k = recordKey(r);
    stored.set(k, (stored.get(k) ?? 0) + 1);
  }

  const seen = new Map<string, number>();
  const firstRow = new Map<string, T>();
  const toAdd: T[] = [];
  const duplicates: T[] = [];
  for (const r of incoming) {
    const k = recordKey(r);
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    if (!firstRow.has(k)) firstRow.set(k, r);
    if (n <= (stored.get(k) ?? 0)) duplicates.push(r);
    else toAdd.push(r);
  }

  const repeatedInFile: { row: T; count: number }[] = [];
  for (const [k, count] of seen) {
    if (count > 1) repeatedInFile.push({ row: firstRow.get(k)!, count });
  }
  return { toAdd, duplicates, repeatedInFile };
}
