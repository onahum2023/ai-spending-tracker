import { dataSpan, type MonthlyStackRow } from './analytics';
import { CATEGORIES, CATEGORY_NOUNS, OVERLAP_CATEGORIES, categoryOf, type Category } from './categories';
import { addDays, addMonths, addOneMonthToDate, dayOf, monthDiff, monthOf, monthShort } from './dates';
import { STALE_AFTER_DAYS } from './forecast';
import { formatEUR, medianCents } from './money';
import { overrideMap, overrideOf, streamKey, type Override } from './overrides';
import { detectRecurring, GRACE_DAYS, type RecurringPattern } from './recurring';
import type { LedgerRow } from './types';

/*
 * Insights from charge patterns
 * -----------------------------
 * A charge only has a merchant, provider, amount and date: no plan names, no usage
 * figures. Everything here is derived from the pattern of charges, so it is worded as
 * an observation ("went from X to Y", "no charges since"), never as a fact about a plan.
 *
 * "Recurring" means the existing recurring-looking pattern detection (monthly, similar
 * day, similar amount, 3+ months). Annual or irregular charges are not recurring here.
 */

/** A change of at least this fraction of the previous amount counts as a price change. */
export const PRICE_STEP = 0.1;
const PRICE_STEP_MIN_CENTS = 100;
/** How many days ahead the charge calendar looks. */
export const UPCOMING_DAYS = 30;
/** A plan switch: the new pattern starts within this many months of the old one's last charge. */
const PLAN_SWITCH_MONTHS = 1;

export interface Subscription<T extends LedgerRow = LedgerRow> {
  pattern: RecurringPattern<T>;
  provider: string;
  merchant: string;
  category: Category;
  /** The most recent charge, the best guide to what is committed now. */
  monthlyCents: number;
  yearlyCents: number;
  lastDate: string;
  /** Observations worth a second look: overlap, big price rises. */
  notes: string[];
}

export interface PriceChange {
  provider: string;
  merchant: string;
  fromCents: number;
  toCents: number;
  /** Month of the first charge at the new amount. */
  month: string;
  date: string;
  /** 'plan' = one pattern ended and another began at a different amount; 'step' = the amount moved within one pattern. */
  kind: 'plan' | 'step';
  pct: number;
}

export interface UpcomingCharge {
  date: string;
  provider: string;
  merchant: string;
  cents: number;
}

export interface StoppedSubscription<T extends LedgerRow = LedgerRow> {
  pattern: RecurringPattern<T>;
  provider: string;
  merchant: string;
  category: Category;
  lastCents: number;
  lastDate: string;
  monthsSince: number;
  /** Charges from the same stream after the last pattern charge. Empty = the cancellation looks clean. */
  chargesSince: T[];
}

export interface OverlapGroup {
  category: Category;
  members: { provider: string; monthlyCents: number }[];
  combinedMonthlyCents: number;
  sentence: string;
}

export interface SubscriptionReport<T extends LedgerRow = LedgerRow> {
  asOf: string;
  latestDate: string;
  /** False when the newest recorded charge is long ago, so anything forward-looking would be guesswork. */
  dataFresh: boolean;
  active: Subscription<T>[];
  monthlyCents: number;
  yearlyCents: number;
  upcoming: UpcomingCharge[];
  upcomingCents: number;
  priceChanges: PriceChange[];
  stopped: StoppedSubscription<T>[];
  overlaps: OverlapGroup[];
}

export interface Analysis<T extends LedgerRow = LedgerRow> {
  patterns: RecurringPattern<T>[];
  /** Charges counted as fixed: part of a recurring pattern, or marked as a subscription. */
  fixed: Set<T>;
  categoryOf: (row: T) => Category;
  report: SubscriptionReport<T>;
}

const lastOf = <T,>(xs: T[]): T => xs[xs.length - 1];

/** Same stream = same descriptor, unless the descriptor changes every time (then the provider is the stream). */
function streamMatcher<T extends LedgerRow>(p: RecurringPattern<T>): (r: LedgerRow) => boolean {
  const merchants = new Set(p.charges.map((c) => c.merchant));
  return merchants.size > 1
    ? (r) => r.provider === p.provider
    : (r) => r.provider === p.provider && r.merchant === p.merchant;
}

function stepChanges<T extends LedgerRow>(p: RecurringPattern<T>): PriceChange[] {
  const out: PriceChange[] = [];
  const cs = p.charges;
  let level = cs[0].amountCents;
  for (let i = 1; i < cs.length; i++) {
    const a = cs[i].amountCents;
    const moved = Math.abs(a - level);
    if (moved < PRICE_STEP_MIN_CENTS || moved < PRICE_STEP * level) continue;
    // A single odd charge that goes straight back is a blip, not a new price.
    // The newest charge cannot be confirmed yet; it is only believed while the pattern is still running.
    const next = cs[i + 1];
    if (next ? Math.abs(next.amountCents - level) < PRICE_STEP * level : !p.active) continue;
    out.push({
      provider: p.provider,
      merchant: p.merchant,
      fromCents: level,
      toCents: a,
      month: monthOf(cs[i].date),
      date: cs[i].date,
      kind: 'step',
      pct: ((a - level) / level) * 100,
    });
    level = a;
  }
  return out;
}

/** Finds, for each pattern, the pattern of the same provider that it directly replaced. */
function planSwitches<T extends LedgerRow>(
  patterns: RecurringPattern<T>[],
): { change: PriceChange | null; from: RecurringPattern<T>; to: RecurringPattern<T> }[] {
  const out: { change: PriceChange | null; from: RecurringPattern<T>; to: RecurringPattern<T> }[] = [];
  for (const to of patterns) {
    let from: RecurringPattern<T> | null = null;
    for (const cand of patterns) {
      if (cand === to || cand.provider !== to.provider) continue;
      if (cand.lastDate >= to.firstDate) continue;
      const gap = monthDiff(monthOf(cand.lastDate), monthOf(to.firstDate));
      if (gap < 0 || gap > PLAN_SWITCH_MONTHS) continue;
      if (!from || cand.lastDate > from.lastDate) from = cand;
    }
    if (!from) continue;
    const before = lastOf(from.charges).amountCents;
    const after = to.charges[0].amountCents;
    if (Math.abs(after - before) < PRICE_STEP * before || Math.abs(after - before) < PRICE_STEP_MIN_CENTS) {
      // Same price, new day of month: the billing date moved, nothing to report as a price change.
      out.push({ change: null, from, to });
      continue;
    }
    out.push({
      change: {
        provider: to.provider,
        merchant: to.merchant,
        fromCents: before,
        toCents: after,
        month: monthOf(to.firstDate),
        date: to.firstDate,
        kind: 'plan',
        pct: ((after - before) / before) * 100,
      },
      from,
      to,
    });
  }
  return out;
}

function nextOccurrence(expected: string, asOf: string): string {
  let d = expected;
  // The next date may already be in the past when the newest import is a few weeks old: roll forward.
  for (let i = 0; i < 24 && d < asOf; i++) d = addOneMonthToDate(d);
  return d;
}

function describeOverlap(category: Category, members: { provider: string; monthlyCents: number }[], combined: number): string {
  const nouns = CATEGORY_NOUNS[category];
  return `${members.length} ${nouns.many}: ${members.map((m) => m.provider).join(', ')} · ${formatEUR(combined)}/month combined`;
}

/** A stream the user marked as a monthly subscription: every charge counts, whatever their spacing. */
function forcedPattern<T extends LedgerRow>(charges: T[], latestDate: string): RecurringPattern<T> | null {
  const cs = charges.filter((c) => c.amountCents > 0).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (cs.length === 0) return null;
  const last = lastOf(cs);
  const amounts = cs.map((c) => c.amountCents);
  const nextExpected = addOneMonthToDate(last.date);
  return {
    provider: last.provider,
    merchant: last.merchant,
    charges: cs,
    months: new Set(cs.map((c) => monthOf(c.date))).size,
    typicalCents: medianCents(amounts),
    minCents: Math.min(...amounts),
    maxCents: Math.max(...amounts),
    typicalDay: medianCents(cs.map((c) => dayOf(c.date))),
    firstDate: cs[0].date,
    lastDate: last.date,
    nextExpected,
    active: addDays(nextExpected, GRACE_DAYS) >= latestDate,
    forced: true,
  };
}

/**
 * Runs pattern detection once and derives everything the Subscriptions view needs.
 * `overrides` are the user's corrections: streams marked usage or ignore are left out of
 * detection, and streams marked as a subscription become one whether or not detection agrees.
 */
export function analyze<T extends LedgerRow>(rows: T[], today: string, overrides: Override[] = []): Analysis<T> {
  const span = dataSpan(rows);
  const latestDate = span?.lastDate ?? today;
  const asOf = latestDate > today ? latestDate : today;
  const ov = overrideMap(overrides);

  const forcedStreams = new Map<string, T[]>();
  const auto: T[] = [];
  for (const r of rows) {
    const kind = overrideOf(ov, r);
    if (!kind) auto.push(r);
    else if (kind === 'subscription') forcedStreams.set(streamKey(r.provider, r.merchant), [...(forcedStreams.get(streamKey(r.provider, r.merchant)) ?? []), r]);
  }
  const forced = [...forcedStreams.values()].map((cs) => forcedPattern(cs, latestDate)).filter((p): p is RecurringPattern<T> => p !== null);
  const patterns = span
    ? [...detectRecurring(auto, latestDate), ...forced].sort(
        (a, b) =>
          Number(b.active) - Number(a.active) ||
          (a.lastDate < b.lastDate ? 1 : a.lastDate > b.lastDate ? -1 : 0) ||
          b.typicalCents - a.typicalCents,
      )
    : [];

  const fixed = new Set<T>();
  for (const p of patterns) for (const c of p.charges) fixed.add(c);
  for (const r of rows) if (r.type === 'subscription' && !overrideOf(ov, r)) fixed.add(r);
  const category = (row: T) => {
    const kind = overrideOf(ov, row);
    // The user's word beats the charge's own Type: a stream they call usage is API-style usage.
    if (kind === 'usage') return categoryOf({ ...row, type: 'usage' }, false);
    if (kind === 'subscription') return categoryOf({ ...row, type: 'subscription' }, true);
    return categoryOf(row, fixed.has(row));
  };

  const switches = planSwitches(patterns);
  const superseded = new Set(switches.map((s) => s.from));
  const priceChanges: PriceChange[] = [
    ...switches.flatMap((s) => (s.change ? [s.change] : [])),
    ...patterns.flatMap(stepChanges),
  ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.provider.localeCompare(b.provider)));

  // ---- active subscriptions
  const active: Subscription<T>[] = patterns
    .filter((p) => p.active)
    .map((p) => {
      const last = lastOf(p.charges);
      return {
        pattern: p,
        provider: p.provider,
        merchant: p.merchant,
        category: category(last),
        monthlyCents: last.amountCents,
        yearlyCents: last.amountCents * 12,
        lastDate: last.date,
        notes: [],
      };
    })
    .sort((a, b) => b.monthlyCents - a.monthlyCents || a.provider.localeCompare(b.provider));

  // ---- overlap (one entry per provider, so two plans at one provider do not count twice)
  const overlaps: OverlapGroup[] = [];
  for (const cat of OVERLAP_CATEGORIES) {
    const byProvider = new Map<string, number>();
    for (const s of active) if (s.category === cat) byProvider.set(s.provider, (byProvider.get(s.provider) ?? 0) + s.monthlyCents);
    if (byProvider.size < 2) continue;
    const members = [...byProvider.entries()]
      .map(([provider, monthlyCents]) => ({ provider, monthlyCents }))
      .sort((a, b) => b.monthlyCents - a.monthlyCents || a.provider.localeCompare(b.provider));
    const combined = members.reduce((a, m) => a + m.monthlyCents, 0);
    overlaps.push({ category: cat, members, combinedMonthlyCents: combined, sentence: describeOverlap(cat, members, combined) });
  }
  overlaps.sort((a, b) => b.combinedMonthlyCents - a.combinedMonthlyCents);

  // ---- notes on active subscriptions
  for (const s of active) {
    if (s.pattern.forced) s.notes.push('You marked this as a monthly subscription');
    const group = overlaps.find((o) => o.category === s.category);
    if (group) {
      const others = group.members.filter((m) => m.provider !== s.provider).map((m) => m.provider);
      if (others.length) s.notes.push(`Overlaps with ${others.join(', ')} (${CATEGORY_NOUNS[s.category].many})`);
    }
    const rise = priceChanges.find((c) => c.provider === s.provider && c.pct >= 50 && c.date >= addMonths(monthOf(latestDate), -6) + '-01');
    if (rise) {
      s.notes.push(`${formatEUR(rise.fromCents)} → ${formatEUR(rise.toCents)} in ${monthShort(rise.month)}`);
    }
  }

  // ---- upcoming charges
  const dataFresh = addDays(latestDate, STALE_AFTER_DAYS) >= today;
  const horizon = addDays(asOf, UPCOMING_DAYS);
  const upcoming: UpcomingCharge[] = dataFresh
    ? active
        .map((s) => ({
          date: nextOccurrence(s.pattern.nextExpected, asOf),
          provider: s.provider,
          merchant: s.merchant,
          cents: s.monthlyCents,
        }))
        .filter((u) => u.date <= horizon)
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : b.cents - a.cents))
    : [];

  // ---- stopped subscriptions
  const stopped: StoppedSubscription<T>[] = patterns
    .filter((p) => !p.active && !superseded.has(p))
    .map((p) => {
      const last = lastOf(p.charges);
      const same = streamMatcher(p);
      return {
        pattern: p,
        provider: p.provider,
        merchant: p.merchant,
        category: category(last),
        lastCents: last.amountCents,
        lastDate: last.date,
        monthsSince: Math.max(0, monthDiff(monthOf(last.date), monthOf(latestDate))),
        chargesSince: rows.filter((r) => r.date > last.date && r.amountCents > 0 && same(r)),
      };
    })
    .sort((a, b) => (a.lastDate < b.lastDate ? 1 : a.lastDate > b.lastDate ? -1 : 0));

  const monthlyCents = active.reduce((a, s) => a + s.monthlyCents, 0);
  return {
    patterns,
    fixed,
    categoryOf: category,
    report: {
      asOf,
      latestDate,
      dataFresh,
      active,
      monthlyCents,
      yearlyCents: monthlyCents * 12,
      upcoming,
      upcomingCents: upcoming.reduce((a, u) => a + u.cents, 0),
      priceChanges,
      stopped,
      overlaps,
    },
  };
}

// ---------- fixed vs variable ----------

export interface FixedVariableMonth {
  month: string;
  fixedCents: number;
  variableCents: number;
}

export function fixedVariableByMonth<T extends LedgerRow>(rows: T[], months: string[], fixed: Set<T>): FixedVariableMonth[] {
  const by = new Map<string, FixedVariableMonth>(months.map((m) => [m, { month: m, fixedCents: 0, variableCents: 0 }]));
  for (const r of rows) {
    const row = by.get(monthOf(r.date));
    if (!row) continue;
    if (fixed.has(r)) row.fixedCents += r.amountCents;
    else row.variableCents += r.amountCents;
  }
  return months.map((m) => by.get(m)!);
}

export interface FixedVariableChange {
  beforeFrom: string;
  beforeTo: string;
  afterFrom: string;
  afterTo: string;
  before: { fixedCents: number; variableCents: number; tools: number };
  after: { fixedCents: number; variableCents: number; tools: number };
}

/** Last 3 complete months against the 3 before, split into recurring and everything else. */
export function fixedVariableChange<T extends LedgerRow>(
  rows: T[],
  fixed: Set<T>,
  lastCompleteMonth: string,
): FixedVariableChange {
  const afterFrom = addMonths(lastCompleteMonth, -2);
  const beforeTo = addMonths(lastCompleteMonth, -3);
  const beforeFrom = addMonths(lastCompleteMonth, -5);
  const sum = (from: string, to: string) => {
    let fixedCents = 0;
    let variableCents = 0;
    const tools = new Set<string>();
    for (const r of rows) {
      const m = monthOf(r.date);
      if (m < from || m > to) continue;
      if (fixed.has(r)) {
        fixedCents += r.amountCents;
        tools.add(r.provider);
      } else variableCents += r.amountCents;
    }
    return { fixedCents, variableCents, tools: tools.size };
  };
  return {
    beforeFrom,
    beforeTo,
    afterFrom,
    afterTo: lastCompleteMonth,
    before: sum(beforeFrom, beforeTo),
    after: sum(afterFrom, lastCompleteMonth),
  };
}

/** One plain sentence answering "more tools or more usage?". Null when nothing changed to speak of. */
export function fixedVariableSentence(c: FixedVariableChange): string | null {
  const dFixed = c.after.fixedCents - c.before.fixedCents;
  const dVar = c.after.variableCents - c.before.variableCents;
  const total = dFixed + dVar;
  if (total === 0 && dFixed === 0) return null;
  const range = `${monthShort(c.afterFrom)}–${monthShort(c.afterTo)} vs ${monthShort(c.beforeFrom)}–${monthShort(c.beforeTo)}`;
  const signed = (n: number) => `${n >= 0 ? '+' : '−'}${formatEUR(Math.abs(n))}`;
  const toolsDelta = c.after.tools - c.before.tools;
  const tools =
    toolsDelta === 0 ? '' : ` (${toolsDelta > 0 ? '+' : '−'}${Math.abs(toolsDelta)} provider${Math.abs(toolsDelta) === 1 ? '' : 's'} with recurring charges)`;
  const lead = total >= 0 ? 'Spending rose' : 'Spending fell';
  return `${lead} ${signed(total)} (${range}): recurring charges ${signed(dFixed)}${tools}, other charges ${signed(dVar)}.`;
}

// ---------- categories over time ----------

export function monthlyByCategory<T extends LedgerRow>(
  rows: T[],
  months: string[],
  categoryFor: (row: T) => Category,
): MonthlyStackRow[] {
  const by = new Map<string, MonthlyStackRow>(months.map((m) => [m, { month: m, totalCents: 0, cents: {} }]));
  for (const r of rows) {
    const row = by.get(monthOf(r.date));
    if (!row) continue;
    const k = categoryFor(r);
    row.cents[k] = (row.cents[k] ?? 0) + r.amountCents;
    row.totalCents += r.amountCents;
  }
  return months.map((m) => by.get(m)!);
}

export function categoryTotals<T extends LedgerRow>(rows: T[], categoryFor: (row: T) => Category): Record<Category, number> {
  const out = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
  for (const r of rows) out[categoryFor(r)] += r.amountCents;
  return out;
}
