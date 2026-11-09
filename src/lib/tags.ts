import { MAX_TAG_LENGTH } from './csv';
import { monthOf } from './dates';
import type { LedgerRow } from './types';

/*
 * Tags
 * ----
 * One optional label per charge: Personal, Business, a client or a project. Saved with
 * the charge in this browser, and carried in an optional Tag column of the ledger CSV.
 * The quarter report lists charges as they were charged. The ledger has no VAT figures,
 * so amounts are never split into net and VAT.
 *
 * A tag rule ("tag new charges from this provider as Business") is applied when charges are
 * imported, to charges that arrive without a tag. A tag in the file always wins, and charges
 * already stored are never changed by a rule: tag those with the bulk tag control.
 */

export const SUGGESTED_TAGS = ['Personal', 'Business'];
export const UNTAGGED = 'Untagged';

export function cleanTag(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, MAX_TAG_LENGTH);
}

/** "2026-04-17" -> "2026-Q2" */
export function quarterOf(date: string): string {
  const m = Number(monthOf(date).slice(5, 7));
  return `${date.slice(0, 4)}-Q${Math.floor((m - 1) / 3) + 1}`;
}

export function quarterLabel(q: string): string {
  return `${q.slice(5)} ${q.slice(0, 4)}`;
}

/** Distinct quarters that contain charges, newest first. */
export function quartersIn(rows: LedgerRow[]): string[] {
  return [...new Set(rows.map((r) => quarterOf(r.date)))].sort().reverse();
}

/** Distinct tags in use, most used first, then A–Z. */
export function tagsInUse(rows: LedgerRow[]): string[] {
  const count = new Map<string, number>();
  for (const r of rows) if (r.tag) count.set(r.tag, (count.get(r.tag) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
}

export interface TagTotal {
  tag: string;
  count: number;
  totalCents: number;
}

export interface QuarterReport<T extends LedgerRow> {
  quarter: string;
  rows: T[];
  totals: TagTotal[];
  totalCents: number;
}

/** Charges of one quarter (optionally one tag) with totals per tag. */
export function quarterReport<T extends LedgerRow>(rows: T[], quarter: string, tag: string | null = null): QuarterReport<T> {
  const inQ = rows
    .filter((r) => quarterOf(r.date) === quarter && (tag === null || (tag === UNTAGGED ? !r.tag : r.tag === tag)))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.provider.localeCompare(b.provider)));
  const by = new Map<string, TagTotal>();
  for (const r of inQ) {
    const key = r.tag ?? UNTAGGED;
    const t = by.get(key) ?? { tag: key, count: 0, totalCents: 0 };
    t.count += 1;
    t.totalCents += r.amountCents;
    by.set(key, t);
  }
  const totals = [...by.values()].sort((a, b) => b.totalCents - a.totalCents || a.tag.localeCompare(b.tag));
  return { quarter, rows: inQ, totals, totalCents: inQ.reduce((a, r) => a + r.amountCents, 0) };
}

export interface TagRule {
  provider: string;
  tag: string;
}

/** Sets the rule for one provider, or with an empty tag or null removes it. */
export function withTagRule(list: TagRule[], provider: string, tag: string | null): TagRule[] {
  const rest = list.filter((r) => r.provider !== provider);
  const clean = tag === null ? '' : cleanTag(tag);
  return clean ? [...rest, { provider, tag: clean }] : rest;
}

/** Cleans anything read from storage. */
export function normalizeTagRules(raw: unknown): TagRule[] {
  if (!Array.isArray(raw)) return [];
  const out = new Map<string, TagRule>();
  for (const r of raw as Record<string, unknown>[]) {
    if (typeof r?.provider !== 'string' || typeof r.tag !== 'string' || !r.provider) continue;
    const tag = cleanTag(r.tag);
    if (tag) out.set(r.provider, { provider: r.provider, tag });
  }
  return [...out.values()].sort((a, b) => a.provider.localeCompare(b.provider));
}

/** Gives rows that arrive without a tag the tag of their provider's rule. Rows with a tag are left alone. */
export function applyTagRules<T extends LedgerRow>(rows: T[], rules: TagRule[]): { rows: T[]; tagged: number } {
  if (rules.length === 0) return { rows, tagged: 0 };
  const byProvider = new Map(rules.map((r) => [r.provider, r.tag]));
  let tagged = 0;
  const out = rows.map((r) => {
    const tag = r.tag ? undefined : byProvider.get(r.provider);
    if (!tag) return r;
    tagged++;
    return { ...r, tag };
  });
  return { rows: out, tagged };
}
