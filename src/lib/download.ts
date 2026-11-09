import { toLedgerCsv } from './csv';
import type { LedgerRow } from './types';

/** Saves rows as a ledger CSV file in the browser (no network). */
export function exportCsv(rows: LedgerRow[], fileName?: string) {
  const blob = new Blob([toLedgerCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName ?? `ai-spending-export-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
