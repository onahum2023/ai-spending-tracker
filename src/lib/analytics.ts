import {
  addMonths,
  dayOf,
  monthLabel,
  monthOf,
  monthsBetween,
  yearOf,
} from './dates';
import { sumCents } from './money';
import type { LedgerRow, Period } from './types';

// ---------- periods ----------

export function periodKey(p: Period): string {
  return p.kind === 'all' ? 'all' : p.kind === 'year' ? String(p.year) : p.month;
}

export function parsePeriodKey(key: string): Period | null {
  if (key === 'all') return { kind: 'all' };
  if (/^\d{4}$/.test(key)) return { kind: 'year', year: Number(key) };
  if (/^\d{4}-\d{2}$/.test(key)) return { kind: 'month', month: key };
  return null;
}

export function periodLabel(p: Period): string {
  if (p.kind === 'all') return 'All time';
  if (p.kind === 'year') return String(p.year);
  return monthLabel(p.month);
}

export function inPeriod(date: string, p: Period): boolean {
  if (p.kind === 'all') return true;
  if (p.kind === 'year') return yearOf(date) === p.year;
  return monthOf(date) === p.month;
}

export function filterPeriod<T extends LedgerRow>(rows: T[], p: Period): T[] {
  return p.kind === 'all' ? rows : rows.filter((r) => inPeriod(r.date, p));
}

// ---------- basic aggregates ----------

export interface DataSpan {
  firstDate: string;
  lastDate: string;
  firstMonth: string;
  lastMonth: string;
  months: string[];
  years: number[];
}

export function dataSpan(rows: LedgerRow[]): DataSpan | null {
  if (rows.length === 0) return null;
  let firstDate = rows[0].date;
  let lastDate = rows[0].date;
  for (const r of rows) {
    if (r.date < firstDate) firstDate = r.date;
    if (r.date > lastDate) lastDate = r.date;
  }
  const firstMonth = monthOf(firstDate);
  const lastMonth = monthOf(lastDate);
  const years: number[] = [];
  for (let y = yearOf(firstDate); y <= yearOf(lastDate); y++) years.push(y);
  return { firstDate, lastDate, firstMonth, lastMonth, months: monthsBetween(firstMonth, lastMonth), years };
}

export function totalsByMonth(rows: LedgerRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = monthOf(r.date);
    m.set(k, (m.get(k) ?? 0) + r.amountCents);
  }
  return m;
}

export function monthTotal(rows: LedgerRow[], month: string): number {
  let t = 0;
  for (const r of rows) if (monthOf(r.date) === month) t += r.amountCents;
  return t;
}

/** Spending in `month` on days 1..`day` (for like-for-like comparisons with a month in progress). */
export function monthTotalThroughDay(rows: LedgerRow[], month: string, day: number): number {
  let t = 0;
  for (const r of rows) {
    if (monthOf(r.date) === month && Number(r.date.slice(8, 10)) <= day) t += r.amountCents;
  }
  return t;
}

export interface ProviderSummary {
  provider: string;
  totalCents: number;
  count: number;
  firstDate: string;
  lastDate: string;
}

/** Per-provider totals, sorted by total spend (desc), then name. */
export function summarizeProviders(rows: LedgerRow[]): ProviderSummary[] {
  const m = new Map<string, ProviderSummary>();
  for (const r of rows) {
    const s = m.get(r.provider);
    if (!s) {
      m.set(r.provider, { provider: r.provider, totalCents: r.amountCents, count: 1, firstDate: r.date, lastDate: r.date });
    } else {
      s.totalCents += r.amountCents;
      s.count += 1;
      if (r.date < s.firstDate) s.firstDate = r.date;
      if (r.date > s.lastDate) s.lastDate = r.date;
    }
  }
  return [...m.values()].sort(
    (a, b) => b.totalCents - a.totalCents || a.provider.localeCompare(b.provider),
  );
}

export function providerTotals(rows: LedgerRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.provider, (m.get(r.provider) ?? 0) + r.amountCents);
  return m;
}

// ---------- chart shapes ----------

export interface MonthlyStackRow {
  month: string;
  totalCents: number;
  /** Cents per series key. */
  cents: Record<string, number>;
}

/**
 * Monthly totals split into series. Providers not in `seriesProviders`
 * are folded into the `otherKey` series.
 */
export function monthlyByProvider(
  rows: LedgerRow[],
  months: string[],
  seriesProviders: Set<string>,
  otherKey: string,
): MonthlyStackRow[] {
  const byMonth = new Map<string, MonthlyStackRow>();
  for (const m of months) byMonth.set(m, { month: m, totalCents: 0, cents: {} });
  for (const r of rows) {
    const row = byMonth.get(monthOf(r.date));
    if (!row) continue;
    const key = seriesProviders.has(r.provider) ? r.provider : otherKey;
    row.cents[key] = (row.cents[key] ?? 0) + r.amountCents;
    row.totalCents += r.amountCents;
  }
  return months.map((m) => byMonth.get(m)!);
}

// ---------- comparisons ----------

export interface ProviderChange {
  provider: string;
  beforeCents: number;
  afterCents: number;
  deltaCents: number;
}

/** Per-provider change between two sets of rows, sorted by delta. */
export function providerChanges(before: LedgerRow[], after: LedgerRow[]): ProviderChange[] {
  const b = providerTotals(before);
  const a = providerTotals(after);
  const names = new Set([...b.keys(), ...a.keys()]);
  return [...names]
    .map((provider) => {
      const beforeCents = b.get(provider) ?? 0;
      const afterCents = a.get(provider) ?? 0;
      return { provider, beforeCents, afterCents, deltaCents: afterCents - beforeCents };
    })
    .filter((c) => c.deltaCents !== 0)
    .sort((x, y) => y.deltaCents - x.deltaCents || x.provider.localeCompare(y.provider));
}

export function rowsInMonths<T extends LedgerRow>(rows: T[], from: string, to: string): T[] {
  return rows.filter((r) => {
    const m = monthOf(r.date);
    return m >= from && m <= to;
  });
}

/**
 * The most recent month that is fully over, based on the data and today's date.
 * If the latest recorded month is the current calendar month (still in progress), it's excluded.
 */
export function lastCompleteMonth(span: DataSpan, today: string): string {
  const current = monthOf(today);
  return span.lastMonth >= current ? addMonths(current, -1) : span.lastMonth;
}

// ---------- concentration ----------

export interface Concentration {
  totalCents: number;
  shares: { provider: string; cents: number; share: number }[];
  top1Share: number;
  top3Share: number;
  /** Fewest providers that together account for at least 80% of spending. */
  providersFor80: number;
}

export function concentration(rows: LedgerRow[]): Concentration {
  const summary = summarizeProviders(rows);
  const total = sumCents(rows);
  const shares = summary.map((s) => ({
    provider: s.provider,
    cents: s.totalCents,
    share: total > 0 ? s.totalCents / total : 0,
  }));
  let cum = 0;
  let providersFor80 = 0;
  for (const s of shares) {
    if (cum >= 0.8) break;
    cum += s.share;
    providersFor80++;
  }
  const top = (n: number) => shares.slice(0, n).reduce((a, s) => a + s.share, 0);
  return { totalCents: total, shares, top1Share: top(1), top3Share: top(3), providersFor80 };
}

/**
 * One month's charges for the drill-down list: largest first, ties newest first. With `throughDay`, only the first days of the
 * month (what a same-point-in-the-month comparison counts). With `only`, just the charges it accepts (one commitment type). Refunds sort last. Does not change the rows.
 */
export function monthDrillDown<T extends LedgerRow>(rows: T[], month: string, throughDay?: number, only?: (row: T) => boolean): T[] {
  return rows
    .filter((r) => monthOf(r.date) === month && (throughDay === undefined || dayOf(r.date) <= throughDay) && (!only || only(r)))
    .sort((a, b) => b.amountCents - a.amountCents || (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** Distinct merchant descriptors for a provider with counts and totals. */
export function merchantBreakdown(rows: LedgerRow[]) {
  const m = new Map<string, { merchant: string; count: number; totalCents: number; lastDate: string }>();
  for (const r of rows) {
    const s = m.get(r.merchant) ?? { merchant: r.merchant, count: 0, totalCents: 0, lastDate: r.date };
    s.count += 1;
    s.totalCents += r.amountCents;
    if (r.date > s.lastDate) s.lastDate = r.date;
    m.set(r.merchant, s);
  }
  return [...m.values()].sort((a, b) => b.totalCents - a.totalCents);
}
