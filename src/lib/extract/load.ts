import Papa from 'papaparse';
import { looksLikeRevolut, parseRevolutStatement, type PdfTextItem } from './revolut';
import { readTable } from './table';
import type { ReadResult, StatementRow } from './types';

/** Picks the sheet/table that reads best (most rows) and turns it into statement rows. */
export function extractFromTables(fileName: string, tables: { name: string; table: unknown[][] }[]): ReadResult {
  let best: ReadResult | null = null;
  let firstError = '';
  for (const { name, table } of tables) {
    const r = readTable(fileName, table);
    if ('error' in r) {
      firstError ||= r.error;
      continue;
    }
    const notes = tables.length > 1 ? [`Read sheet "${name}".`, ...r.notes] : r.notes;
    if (!best || r.rows.length > best.rows.length) best = { fileName, format: r.format, rows: r.rows, notes };
  }
  return best ?? { fileName, format: 'unknown', rows: [], notes: [], error: firstError || 'No transactions found.' };
}

export function extractFromPdfItems(fileName: string, items: PdfTextItem[]): ReadResult {
  if (items.length === 0) {
    return { fileName, format: 'unknown', rows: [], notes: [], error: 'This PDF has no readable text (it may be a scan). Export the statement as CSV or Excel instead.' };
  }
  if (!looksLikeRevolut(items)) {
    return {
      fileName, format: 'unknown', rows: [], notes: [],
      error: 'Only Revolut PDF statements can be read so far. For other banks, download the transactions as CSV or Excel.',
    };
  }
  const { rows, notes } = parseRevolutStatement(fileName, items);
  return { fileName, format: 'revolut-pdf', rows, notes };
}

/** Reads one dropped file in the browser. Nothing is uploaded. */
export async function readStatementFile(file: File): Promise<ReadResult> {
  const name = file.name;
  const lower = name.toLowerCase();
  try {
    if (lower.endsWith('.pdf')) {
      const { pdfTextItems } = await import('./pdf');
      return extractFromPdfItems(name, await pdfTextItems(await file.arrayBuffer()));
    }
    if (lower.endsWith('.xlsx')) {
      const { default: readXlsxFile, readSheetNames } = await import('read-excel-file');
      const sheets = await readSheetNames(file);
      const tables = [];
      for (const sheet of sheets) tables.push({ name: sheet, table: (await readXlsxFile(file, { sheet })) as unknown[][] });
      return extractFromTables(name, tables);
    }
    if (lower.endsWith('.xls')) {
      return { fileName: name, format: 'unknown', rows: [], notes: [], error: 'Old .xls files are not supported. Open it in Excel or Numbers and save as .xlsx or .csv.' };
    }
    if (lower.endsWith('.csv') || lower.endsWith('.txt')) {
      const text = (await file.text()).replace(/^﻿/, '');
      const parsed = Papa.parse<string[]>(text, { header: false, skipEmptyLines: 'greedy' });
      return extractFromTables(name, [{ name, table: parsed.data }]);
    }
    return { fileName: name, format: 'unknown', rows: [], notes: [], error: 'Unsupported file type. Use PDF (Revolut), Excel (.xlsx) or CSV.' };
  } catch (e) {
    return { fileName: name, format: 'unknown', rows: [], notes: [], error: `Could not read this file: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Same statement line exported twice (e.g. overlapping downloads): keep the copies from one file only. */
export function mergeFiles(results: ReadResult[]): { rows: StatementRow[]; dropped: number } {
  const key = (r: StatementRow) => `${r.date}|${r.amountCents}|${r.merchant.toUpperCase()}`;
  const kept = new Map<string, number>();
  const rows: StatementRow[] = [];
  let dropped = 0;
  for (const res of results) {
    const inFile = new Map<string, number>();
    for (const r of res.rows) inFile.set(key(r), (inFile.get(key(r)) ?? 0) + 1);
    const seen = new Map<string, number>();
    for (const r of res.rows) {
      const k = key(r);
      const n = (seen.get(k) ?? 0) + 1;
      seen.set(k, n);
      if (n <= (kept.get(k) ?? 0)) {
        dropped++;
        continue;
      }
      rows.push(r);
    }
    for (const [k, c] of inFile) kept.set(k, Math.max(kept.get(k) ?? 0, c));
  }
  return { rows, dropped };
}

