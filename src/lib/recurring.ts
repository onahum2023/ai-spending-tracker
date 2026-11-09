import { addDays, addOneMonthToDate, dayOf, monthDiff, monthOf } from './dates';
import { medianCents } from './money';
import type { LedgerRow } from './types';

/*
 * Recurring-looking patterns
 * --------------------------
 * These are observations, not confirmed subscriptions. A pattern is a chain of
 * charges from the same provider where each charge:
 *   - falls in the calendar month right after the previous one,
 *   - lands within 4 days of the previous charge's day of month
 *     (or both near month-end, day 27+), and
 *   - is within 30% of the previous charge's amount.
 * Charges whose descriptor appears 3+ times in the same month are treated as usage
 * top-ups and ignored. Chains spanning 3+ consecutive months are reported, unless they explain
 * less than half of the charges on that descriptor (erratic top-ups that happen to line up). Charges with the same merchant
 * descriptor are chained first, then leftovers are chained per provider. Charges are
 * processed in date order and attach to the closest matching chain, so the result is
 * deterministic.
 */

const DAY_TOLERANCE = 4;
const AMOUNT_TOLERANCE = 0.3;
const MIN_MONTHS = 3;
/**
 * A chain on one descriptor only counts when it explains at least this share of that descriptor's
 * charges. Credit top-ups that line up by chance for 3 months, while the rest of the charges
 * land on other days, are not a subscription.
 */
const MIN_COVERAGE = 0.5;
/** A descriptor charged this many times in one month is treated as usage, not a recurring charge. */
const USAGE_CHARGES_PER_MONTH = 3;
/** A pattern still counts as active this many days after its next expected charge. */
export const GRACE_DAYS = 7;
/** A new price counts as the same subscription if it first shows up within this many months of the last old charge (1 = skipped month). */
export const PROVISIONAL_MAX_GAP = 2;

export interface RecurringPattern<T extends LedgerRow = LedgerRow> {
  provider: string;
  merchant: string;
  charges: T[];
  months: number;
  typicalCents: number;
  minCents: number;
  maxCents: number;
  typicalDay: number;
  firstDate: string;
  lastDate: string;
  nextExpected: string;
  active: boolean;
  /** Set when the user marked this stream as a subscription instead of detection finding it. */
  forced?: boolean;
  /** Detection only finds monthly patterns; a yearly one is always marked by the user. */
  cadence?: 'yearly';
  /**
   * A new price seen only once or twice after a monthly pattern ended. It is counted as the same
   * subscription at a new price straight away, instead of waiting for three charges.
   */
  provisional?: boolean;
  /** For a provisional pattern: the monthly pattern it continues. */
  replaces?: RecurringPattern<T>;
}

function daysClose(a: number, b: number): boolean {
  return Math.abs(a - b) <= DAY_TOLERANCE || (a >= 27 && b >= 27);
}

function amountsClose(a: number, b: number): boolean {
  return Math.abs(a - b) <= AMOUNT_TOLERANCE * Math.max(Math.abs(a), Math.abs(b));
}

/** Greedy month-to-month chaining in date order; each charge joins the closest matching chain. */
function buildChains<T extends LedgerRow>(rows: T[]): T[][] {
  const sorted = [...rows].sort(
    (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.amountCents - b.amountCents),
  );
  const chains: T[][] = [];
  for (const r of sorted) {
    let best: T[] | null = null;
    let bestScore = Infinity;
    for (const chain of chains) {
      const last = chain[chain.length - 1];
      if (monthDiff(monthOf(last.date), monthOf(r.date)) !== 1) continue;
      if (!daysClose(dayOf(last.date), dayOf(r.date))) continue;
      if (!amountsClose(last.amountCents, r.amountCents)) continue;
      const score = Math.abs(last.amountCents - r.amountCents) * 100 + Math.abs(dayOf(last.date) - dayOf(r.date));
      if (score < bestScore) {
        bestScore = score;
        best = chain;
      }
    }
    if (best) best.push(r);
    else chains.push([r]);
  }
  return chains;
}

export function detectRecurring<T extends LedgerRow>(rows: T[], latestDate: string): RecurringPattern<T>[] {
  // Usage-style top-ups (3+ charges with the same descriptor in one month) can line up
  // by chance, so they are left out: they aren't a single recurring charge.
  const perMonth = new Map<string, number>();
  const usageKey = (r: LedgerRow) => `${r.provider}\u0000${r.merchant}\u0000${monthOf(r.date)}`;
  for (const r of rows) perMonth.set(usageKey(r), (perMonth.get(usageKey(r)) ?? 0) + 1);

  const byProvider = new Map<string, T[]>();
  for (const r of rows) {
    if (r.amountCents <= 0) continue;
    if ((perMonth.get(usageKey(r)) ?? 0) >= USAGE_CHARGES_PER_MONTH) continue;
    const list = byProvider.get(r.provider) ?? [];
    list.push(r);
    byProvider.set(r.provider, list);
  }

  const patterns: RecurringPattern<T>[] = [];
  for (const [provider, list] of byProvider) {
    // Pass 1: chain charges with the exact same merchant descriptor, so a subscription
    // isn't interrupted by unrelated charges from the same provider (e.g. API usage).
    // Pass 2: chain whatever is left at provider level, for providers whose descriptor
    // changes every time (e.g. "NAME-CHEAP.COM* <random code>").
    const byMerchant = new Map<string, T[]>();
    for (const r of list) byMerchant.set(r.merchant, [...(byMerchant.get(r.merchant) ?? []), r]);
    const chains: T[][] = [];
    const used = new Set<T>();
    for (const group of byMerchant.values()) {
      const found = buildChains(group).filter((chain) => chain.length >= MIN_MONTHS);
      const covered = found.reduce((n, chain) => n + chain.length, 0);
      if (found.length > 0 && covered / group.length < MIN_COVERAGE) {
        // Erratic charges that line up by chance: not a subscription, and not worth a second look at provider level.
        for (const r of group) used.add(r);
        continue;
      }
      for (const chain of found) {
        chains.push(chain);
        for (const c of chain) used.add(c);
      }
    }
    chains.push(...buildChains(list.filter((r) => !used.has(r))));

    for (const chain of chains) {
      if (chain.length < MIN_MONTHS) continue;
      const amounts = chain.map((c) => c.amountCents);
      const last = chain[chain.length - 1];
      const nextExpected = addOneMonthToDate(last.date);
      const merchants = new Map<string, number>();
      for (const c of chain) merchants.set(c.merchant, (merchants.get(c.merchant) ?? 0) + 1);
      const merchant = [...merchants.entries()].sort((a, b) => b[1] - a[1])[0][0];
      patterns.push({
        provider,
        merchant,
        charges: chain,
        months: chain.length,
        typicalCents: medianCents(amounts),
        minCents: Math.min(...amounts),
        maxCents: Math.max(...amounts),
        typicalDay: medianCents(chain.map((c) => dayOf(c.date))),
        firstDate: chain[0].date,
        lastDate: last.date,
        nextExpected,
        active: addDays(nextExpected, GRACE_DAYS) >= latestDate,
      });
    }
  }

  return patterns.sort(
    (a, b) =>
      Number(b.active) - Number(a.active) ||
      (a.lastDate < b.lastDate ? 1 : a.lastDate > b.lastDate ? -1 : 0) ||
      b.typicalCents - a.typicalCents,
  );
}

/**
 * Plan switches, before there are three charges at the new price.
 * After a monthly pattern ends, a charge on the same descriptor (the same provider, when the
 * descriptor changes every time) in the next month, or the one after, is read as the same
 * subscription at a new price. It is reported as a provisional pattern of 1 or 2 charges and
 * only while it is still running; a lone charge that nothing followed stays a one-off.
 * `patterns` are the ones `detectRecurring` found on the same `rows`.
 */
export function detectProvisional<T extends LedgerRow>(
  rows: T[],
  patterns: RecurringPattern<T>[],
  latestDate: string,
): RecurringPattern<T>[] {
  const taken = new Set<T>();
  for (const p of patterns) for (const c of p.charges) taken.add(c);
  const perMonth = new Map<string, number>();
  const usageKey = (r: LedgerRow) => `${r.provider}\u0000${r.merchant}\u0000${monthOf(r.date)}`;
  for (const r of rows) perMonth.set(usageKey(r), (perMonth.get(usageKey(r)) ?? 0) + 1);

  const out: RecurringPattern<T>[] = [];
  // Oldest-ending first, so results stay deterministic.
  const monthly = patterns.filter((p) => p.cadence !== 'yearly' && !p.forced).sort((a, b) => (a.lastDate < b.lastDate ? -1 : a.lastDate > b.lastDate ? 1 : 0));
  for (const old of monthly) {
    const merchants = new Set(old.charges.map((c) => c.merchant));
    const sameStream = (r: LedgerRow) =>
      r.provider === old.provider && (merchants.size > 1 || r.merchant === old.merchant);
    const candidates = rows.filter((r) => {
      if (taken.has(r) || r.amountCents <= 0 || !sameStream(r)) return false;
      if ((perMonth.get(usageKey(r)) ?? 0) >= USAGE_CHARGES_PER_MONTH) return false;
      const gap = monthDiff(monthOf(old.lastDate), monthOf(r.date));
      return r.date > old.lastDate && gap >= 1 && gap <= PROVISIONAL_MAX_GAP;
    });
    if (candidates.length === 0) continue;
    const chains = buildChains(candidates).filter((c) => c.length < MIN_MONTHS);
    const chain = chains[0];
    if (!chain) continue;
    const last = chain[chain.length - 1];
    const nextExpected = addOneMonthToDate(last.date);
    // Only while it is still running: a lone charge that nothing followed is a one-off.
    if (addDays(nextExpected, GRACE_DAYS) < latestDate) continue;
    for (const c of chain) taken.add(c);
    const amounts = chain.map((c) => c.amountCents);
    out.push({
      provider: old.provider,
      merchant: chain[0].merchant,
      charges: chain,
      months: chain.length,
      typicalCents: medianCents(amounts),
      minCents: Math.min(...amounts),
      maxCents: Math.max(...amounts),
      typicalDay: medianCents(chain.map((c) => dayOf(c.date))),
      firstDate: chain[0].date,
      lastDate: last.date,
      nextExpected,
      active: true,
      provisional: true,
      replaces: old,
    });
  }
  return out;
}
