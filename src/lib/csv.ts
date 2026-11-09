import Papa from 'papaparse';
import { isValidDate } from './dates';
import { centsToPlain, parseAmountToCents } from './money';
import { parseServiceType, SERVICE_TYPE_LABELS } from './extract/types';
import type { LedgerRow } from './types';

export const REQUIRED_COLUMNS = ['Merchant', 'Provider', 'Amount', 'Date'] as const;
/** Optional: what the charge was for (Subscription, Usage, ...). */
export const TYPE_COLUMN = 'Type';

export interface ParsedRow extends LedgerRow {
  /** Row number in the file, counting the header as row 1. */
  sourceRow: number;
}

export interface RowError {
  sourceRow: number;
  message: string;
  raw: string;
}

export interface ParseResult {
  rows: ParsedRow[];
  errors: RowError[];
  /** Set when the file as a whole can't be read (missing header columns, empty file). */
  fatal: string | null;
  warnings: string[];
  rowsInFile: number;
}

/**
 * Parses and validates a ledger CSV with the columns Merchant, Provider, Amount, Date.
 * Column order and header case don't matter. Valid rows are returned even when
 * other rows fail, so the caller can show both and let the user decide.
 */
export function parseLedgerCsv(text: string): ParseResult {
  const result: ParseResult = { rows: [], errors: [], fatal: null, warnings: [], rowsInFile: 0 };
  const clean = text.replace(/^﻿/, '');
  if (clean.trim() === '') {
    result.fatal = 'The file is empty.';
    return result;
  }

  const parsed = Papa.parse<string[]>(clean, { header: false, skipEmptyLines: 'greedy' });
  const table = parsed.data;
  const header = (table[0] ?? []).map((h) => h.trim());
  const index: Record<string, number> = {};
  for (const col of REQUIRED_COLUMNS) {
    const i = header.findIndex((h) => h.toLowerCase() === col.toLowerCase());
    if (i >= 0) index[col] = i;
  }
  const missing = REQUIRED_COLUMNS.filter((c) => index[c] === undefined);
  if (missing.length > 0) {
    result.fatal =
      `The header row is missing ${missing.join(', ')}. ` +
      `Expected the columns: ${REQUIRED_COLUMNS.join(', ')}. Found: ${header.join(', ') || '(nothing)'}.`;
    return result;
  }
  const typeIndex = header.findIndex((h) => h.toLowerCase() === TYPE_COLUMN.toLowerCase());
  const extra = header.filter(
    (h) => !REQUIRED_COLUMNS.some((c) => c.toLowerCase() === h.toLowerCase()) && h.toLowerCase() !== TYPE_COLUMN.toLowerCase(),
  );
  if (extra.length > 0) result.warnings.push(`Ignoring extra column(s): ${extra.join(', ')}.`);

  const parseErrorsByRow = new Map<number, string>();
  for (const e of parsed.errors) {
    if (typeof e.row === 'number') parseErrorsByRow.set(e.row, e.message);
  }

  result.rowsInFile = table.length - 1;
  for (let i = 1; i < table.length; i++) {
    const cells = table[i];
    const sourceRow = i + 1;
    const raw = cells.join(',');
    const fail = (message: string) => result.errors.push({ sourceRow, message, raw });

    const parseError = parseErrorsByRow.get(i);
    if (parseError) {
      fail(`Could not read this row: ${parseError}`);
      continue;
    }
    if (cells.length !== header.length) {
      fail(`Expected ${header.length} fields but found ${cells.length}.`);
      continue;
    }
    const merchant = cells[index.Merchant].trim();
    const provider = cells[index.Provider].trim();
    const amountRaw = cells[index.Amount].trim();
    const date = cells[index.Date].trim();

    const problems: string[] = [];
    if (!merchant) problems.push('Merchant is empty');
    if (!provider) problems.push('Provider is empty');
    const amountCents = parseAmountToCents(amountRaw);
    if (!amountRaw) problems.push('Amount is empty');
    else if (amountCents === null)
      problems.push(`Amount "${amountRaw}" is not a number like 12.34 (dot decimal, no symbols)`);
    if (!date) problems.push('Date is empty');
    else if (!isValidDate(date)) problems.push(`Date "${date}" is not a valid YYYY-MM-DD date`);

    if (problems.length > 0) {
      fail(problems.join('; ') + '.');
      continue;
    }
    const type = typeIndex >= 0 ? parseServiceType(cells[typeIndex] ?? '') : null;
    result.rows.push({ merchant, provider, amountCents: amountCents!, date, sourceRow, ...(type ? { type } : {}) });
  }
  return result;
}

/** Serializes rows to CSV (RFC 4180, CRLF line endings) in the import format; adds a Type column when any row has one. */
export function toLedgerCsv(rows: LedgerRow[]): string {
  const withType = rows.some((r) => r.type);
  return Papa.unparse(
    {
      fields: withType ? [...REQUIRED_COLUMNS, TYPE_COLUMN] : [...REQUIRED_COLUMNS],
      data: rows.map((r) => {
        const base = [r.merchant, r.provider, centsToPlain(r.amountCents), r.date];
        return withType ? [...base, r.type ? SERVICE_TYPE_LABELS[r.type] : ''] : base;
      }),
    },
    { newline: '\r\n' },
  ) + '\r\n';
}
