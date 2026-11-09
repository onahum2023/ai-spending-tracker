/** One ledger line as it appears in the CSV, with the amount held in integer cents. */
export interface LedgerRow {
  merchant: string;
  provider: string;
  /** Amount in euro cents. Integers only, so sums are exact. */
  amountCents: number;
  /** Calendar date, YYYY-MM-DD. Kept as a string to avoid time-zone shifts. */
  date: string;
}

/** A stored transaction. */
export interface Transaction extends LedgerRow {
  id: number;
  importId: number;
  /** Row number in the source file (header = row 1). */
  sourceRow: number;
}

export interface ImportRecord {
  id: number;
  fileName: string;
  importedAt: string;
  rowsInFile: number;
  added: number;
  skippedDuplicates: number;
  invalid: number;
}

export type Period =
  | { kind: 'all' }
  | { kind: 'year'; year: number }
  | { kind: 'month'; month: string };
