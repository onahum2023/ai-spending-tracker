import { oneLine, parseLooseAmount, parseLooseDate } from './parse';
import type { StatementRow } from './types';

/** A piece of text on a PDF page with its position (PDF units, y grows upwards). */
export interface PdfTextItem {
  page: number;
  x: number;
  y: number;
  str: string;
}

const DATE_RE = /^[A-Z][a-z]{2} \d{1,2}, \d{4}$/;
const MONEY_RE = /^-?[€$£₪]-?[\d,]+\.\d{2}$/;

interface Line {
  page: number;
  items: { x: number; str: string }[];
  text: string;
}

function toLines(items: PdfTextItem[]): Line[] {
  const byKey = new Map<string, Line>();
  for (const it of items) {
    const s = it.str.trim();
    if (!s) continue;
    const key = `${it.page}:${Math.round(it.y)}`;
    let line = byKey.get(key);
    if (!line) byKey.set(key, (line = { page: it.page, items: [], text: '' }));
    line.items.push({ x: it.x, str: s });
  }
  const lines = [...byKey.entries()]
    .map(([k, l]) => ({ y: Number(k.split(':')[1]), l }))
    .sort((a, b) => a.l.page - b.l.page || b.y - a.y)
    .map(({ l }) => {
      l.items.sort((a, b) => a.x - b.x);
      l.text = l.items.map((i) => i.str).join(' ');
      return l;
    });
  return lines;
}

/** True when the text looks like a Revolut account statement. */
export function looksLikeRevolut(items: PdfTextItem[]): boolean {
  const head = items.filter((i) => i.page === 1).map((i) => i.str).join(' ');
  return /Revolut/i.test(head) && /Statement/i.test(head);
}

type Section = 'account' | 'skip';

/**
 * Parses a Revolut account statement (PDF, EUR). Only the "Account transactions"
 * section is used: pending, reverted, pocket and deposit movements are skipped.
 */
export function parseRevolutStatement(fileName: string, items: PdfTextItem[]): { rows: StatementRow[]; notes: string[] } {
  const lines = toLines(items);
  const notes: string[] = [];
  const rows: StatementRow[] = [];
  let section: Section = 'skip';
  let cols: { out: number; in: number; balance: number } | null = null;
  const skippedSections = new Set<string>();
  let current: (StatementRow & { lines: string[] }) | null = null;
  let seq = 0;

  const finish = () => {
    if (!current) return;
    const { lines: extra, ...row } = current;
    const to = extra.find((l) => /^(To|From):/.test(l));
    if (to) row.merchant = to.replace(/^(To|From):\s*/, '');
    const fx = extra.find((l) => /^Revolut Rate/.test(l));
    const ref = extra.find((l) => /^Reference:/.test(l));
    row.details = [fx, ref].filter(Boolean).join(' · ') || undefined;
    if (extra.some((l) => /^Card:/.test(l))) row.kind = 'card';
    else if (/^(Transfer|Payment from|To pocket|From pocket|Exchanged|Top-up|Revpoints|Deposit|Withdrawal)/i.test(row.label ?? '')) row.kind = 'internal';
    else if (/^(To|From):\s*[A-Z]/.test(to ?? '')) row.kind = 'transfer';
    else row.kind = 'other';
    if (row.label && row.label.toLowerCase() === row.merchant.toLowerCase()) delete row.label;
    rows.push(row);
    current = null;
  };

  for (const line of lines) {
    const t = line.text;
    const sectionMatch = /^(Account transactions|Pending|Reverted|Personal and Group Pockets transactions|Deposit transactions|[A-Za-z ]*transactions) from /.exec(t);
    if (sectionMatch) {
      finish();
      section = /^Account transactions/.test(t) ? 'account' : 'skip';
      if (section === 'skip') skippedSections.add(sectionMatch[1]);
      continue;
    }
    const outItem = line.items.find((i) => i.str === 'Money out');
    const inItem = line.items.find((i) => i.str === 'Money in');
    const balItem = line.items.find((i) => i.str === 'Balance');
    if (outItem && inItem) {
      cols = { out: outItem.x, in: inItem.x, balance: balItem?.x ?? inItem.x + 100 };
      continue;
    }
    const first = line.items[0];
    if (DATE_RE.test(first.str) && first.x < 80) {
      finish();
      if (section !== 'account' || !cols) continue;
      const money = line.items.filter((i) => MONEY_RE.test(i.str));
      const desc = line.items.filter((i) => i !== first && !MONEY_RE.test(i.str)).map((i) => i.str).join(' ');
      // Assign each amount to the nearest column header.
      let out: number | null = null;
      let inn: number | null = null;
      for (const m of money) {
        const dist = { out: Math.abs(m.x - cols.out), in: Math.abs(m.x - cols.in), balance: Math.abs(m.x - cols.balance) };
        const col = (Object.keys(dist) as (keyof typeof dist)[]).sort((a, b) => dist[a] - dist[b])[0];
        if (col === 'out') out = parseLooseAmount(m.str);
        else if (col === 'in') inn = parseLooseAmount(m.str);
      }
      const date = parseLooseDate(first.str);
      if (!date || (out === null && inn === null)) continue;
      current = {
        id: `${fileName}#${++seq}`,
        source: fileName,
        format: 'revolut-pdf',
        date,
        amountCents: out !== null ? Math.abs(out) : -Math.abs(inn!),
        merchant: oneLine(desc),
        label: oneLine(desc),
        kind: 'other',
        lines: [],
      };
      continue;
    }
    // Continuation lines are indented under the description.
    if (current && first.x >= 100 && /^(To:|From:|Card:|Revolut Rate|Reference:|Fee:)/.test(t)) {
      current.lines.push(t);
    }
  }
  finish();
  if (skippedSections.size) notes.push(`Skipped sections: ${[...skippedSections].join(', ')} (not settled card spending).`);
  return { rows, notes };
}
