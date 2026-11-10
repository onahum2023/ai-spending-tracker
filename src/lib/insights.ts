import { dataSpan, type MonthlyStackRow } from './analytics';
import { hasReference, referenceKey } from './chargeTypes';
import { CATEGORIES, CATEGORY_NOUNS, OVERLAP_CATEGORIES, categoryOf, type Category, type ProviderCategory } from './categories';
import { addDays, addMonths, addMonthsToDate, addOneMonthToDate, dayOf, monthDiff, monthOf, monthShort } from './dates';
import { STALE_AFTER_DAYS } from './forecast';
import { formatEUR, medianCents } from './money';
import {
  importedKind,
  overrideMap,
  overrideOf,
  overrideToInfo,
  streamKey,
  type Cadence,
  type ChargeKind,
  type Override,
  type TypeInfo,
} from './overrides';
import { daysClose, detectProvisional, detectRecurring, GRACE_DAYS, type RecurringPattern } from './recurring';
import type { LedgerRow } from './types';

/*
 * Insights from charge patterns
 * -----------------------------
 * A charge only has a merchant, provider, amount and date: no plan names, no usage figures.
 * Everything here is derived from the pattern of charges, so it is worded as an
 * observation ("went from X to Y", "no charges since"), never as a fact about a plan.
 *
 * Every charge gets one of three types (see overrides.ts): Subscription, Usage, or
 * One-time / Other. The app guesses, you correct. Detection only recognises MONTHLY
 * subscriptions (monthly, similar day, similar amount, 3+ months). A yearly subscription
 * is always marked by you: its next renewal is estimated a year after the last charge, is
 * labelled as an estimate until a real renewal has been seen, and is never reported as
 * stopped just because the date passed.
 */

/** A change of at least this fraction of the previous amount counts as a price change. */
export const PRICE_STEP = 0.1;
const PRICE_STEP_MIN_CENTS = 100;
/** How many days ahead the charge calendar looks. */
export const UPCOMING_DAYS = 30;
/** A plan switch: the new pattern starts within this many months of the old one's last charge. */
const PLAN_SWITCH_MONTHS = 1;
/** A yearly subscription whose renewal has not shown up is still counted this long past its estimated date. */
export const YEARLY_GRACE_DAYS = 60;
/** A descriptor charged this many times that is not a monthly subscription is read as usage. */
export const USAGE_REPEATS = 3;

export interface Renewal {
  /** The date the next charge is expected (yearly subscriptions only). */
  expected: string;
  /** True once a renewal has actually been seen, so the cadence is observed, not assumed. */
  confirmed: boolean;
  /** The expected date has passed and the renewal has not shown up yet. */
  overdue: boolean;
}

export interface Subscription<T extends LedgerRow = LedgerRow> {
  pattern: RecurringPattern<T>;
  provider: string;
  merchant: string;
  category: Category;
  cadence: Cadence;
  /** The most recent charge as billed: that is per month, or per year for a yearly subscription. */
  billedCents: number;
  /** Per month: the charge itself, or a twelfth of a yearly one. */
  monthlyCents: number;
  yearlyCents: number;
  lastDate: string;
  /** Yearly subscriptions only. */
  renewal: Renewal | null;
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
  cadence: Cadence;
  /** The date is an estimate (a yearly renewal not yet seen). */
  estimated: boolean;
  /** The expected date has passed without the charge showing up. */
  overdue: boolean;
}

export interface StoppedSubscription<T extends LedgerRow = LedgerRow> {
  pattern: RecurringPattern<T>;
  provider: string;
  merchant: string;
  category: Category;
  cadence: Cadence;
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
  /** Charges whose type is Subscription. */
  fixed: Set<T>;
  /** The type of one charge, and how it was decided. */
  typeOf: (row: T) => TypeInfo;
  /** The type of a stream (provider + descriptor), judged by its most recent charge. Null if there is no such stream. */
  streamInfo: (provider: string, merchant: string) => TypeInfo | null;
  categoryOf: (row: T) => Category;
  report: SubscriptionReport<T>;
}

const lastOf = <T,>(xs: T[]): T => xs[xs.length - 1];

/**
 * The charges that belong to the same stream as a pattern, for "does anything still charge after it stopped?".
 * As narrow as the pattern allows: the same reference when the pattern's charges actually carry one ("ACME* PLAN ABC123" is not
 * "ACME* PLAN XYZ456", two subscriptions that share a charge type), else the same charge type (a later "ACME* PLAN ABC123" still
 * counts for a plan that never showed a reference), else the whole provider (the description changes every time).
 */
function streamMatcher<T extends LedgerRow>(p: RecurringPattern<T>): (r: LedgerRow) => boolean {
  const refs = new Set(p.charges.map((c) => referenceKey(c.merchant)));
  if (refs.size === 1 && p.charges.every((c) => hasReference(c.merchant))) {
    const ref = [...refs][0];
    return (r) => r.provider === p.provider && referenceKey(r.merchant) === ref;
  }
  const types = new Set(p.charges.map((c) => streamKey(c.provider, c.merchant)));
  return types.size > 1
    ? (r) => r.provider === p.provider
    : (r) => r.provider === p.provider && streamKey(r.provider, r.merchant) === streamKey(p.provider, p.merchant);
}

/** The pattern a leftover charge of a confirmed charge type most plausibly continues: see `placeConfirmed`. */
function homePattern<T extends LedgerRow>(patterns: RecurringPattern<T>[], c: T): RecurringPattern<T> | undefined {
  const type = streamKey(c.provider, c.merchant);
  const reference = referenceKey(c.merchant);
  return patterns
    .filter(
      (p) =>
        !p.standalone &&
        // Only a pattern that has stopped can be revived. One that is still on schedule is not continued by a charge near its
        // day: that charge is noise, or another schedule, and adopting it would replace the pattern's latest charge.
        !p.active &&
        p.provider === c.provider &&
        p.lastDate < c.date &&
        daysClose(dayOf(c.date), p.typicalDay) &&
        // It has to share the charge type: two subscriptions that bill a few days apart under different descriptions are not
        // each other's continuation.
        p.charges.some((x) => streamKey(x.provider, x.merchant) === type),
    )
    .sort((a, b) => {
      const refA = a.charges.some((x) => referenceKey(x.merchant) === reference) ? 1 : 0;
      const refB = b.charges.some((x) => referenceKey(x.merchant) === reference) ? 1 : 0;
      return refB - refA || (a.lastDate < b.lastDate ? 1 : a.lastDate > b.lastDate ? -1 : 0);
    })[0];
}

/**
 * What to do with the charges of charge types you confirmed as monthly that detection could not place in a pattern.
 * Detection itself ran on everything that could be a monthly subscription (confirmed or not, together), so confirming never
 * cuts a chain in two and never disagrees with what the app already counted. For the leftovers:
 *   - one that keeps the billing day of a STOPPED pattern that has the same charge type, and comes after it, continues that
 *     pattern (a subscription that came back after a long gap), so it is added to it (the same reference first, then the latest);
 *   - the rest of a charge type that no active pattern covers are one subscription counted from its latest charge (irregular
 *     days or amounts), as a stand-in that takes no part in plan-switch matching;
 *   - the rest of a charge type that an active pattern does cover are left out: they are noise within a subscription.
 */
function placeConfirmed<T extends LedgerRow>(patterns: RecurringPattern<T>[], confirmed: Set<T>, latestDate: string): void {
  const explained = new Set(patterns.flatMap((p) => p.charges));
  const byType = new Map<string, T[]>();
  for (const c of confirmed) {
    const k = streamKey(c.provider, c.merchant);
    byType.set(k, [...(byType.get(k) ?? []), c]);
  }
  for (const typeCharges of byType.values()) {
    const leftover = typeCharges
      .filter((c) => c.amountCents > 0 && !explained.has(c))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const unplaced: T[] = [];
    for (const c of leftover) {
      const home = homePattern(patterns, c);
      const grown = home ? forcedPattern([...home.charges, c], 'monthly', latestDate) : null;
      if (home && grown) {
        // Grow it in place: plan-switch links (`replaces`) point at these very objects.
        const { forced: _f, cadence: _c, ...fields } = grown;
        Object.assign(home, fields);
      } else {
        unplaced.push(c);
      }
    }
    if (unplaced.length === 0) continue;
    const covered = patterns.some((p) => p.active && p.charges.some((c) => typeCharges.includes(c)));
    if (covered) continue;
    const one = forcedPattern(typeCharges, 'monthly', latestDate);
    if (one) patterns.push({ ...one, standalone: true });
  }
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

/** Finds, for each pattern, the monthly pattern of the same provider that it directly replaced. */
function planSwitches<T extends LedgerRow>(
  patterns: RecurringPattern<T>[],
): { change: PriceChange | null; from: RecurringPattern<T>; to: RecurringPattern<T> }[] {
  // A stand-in pattern says nothing about what replaced what.
  const monthly = patterns.filter((p) => p.cadence !== 'yearly' && !p.standalone);
  const out: { change: PriceChange | null; from: RecurringPattern<T>; to: RecurringPattern<T> }[] = [];
  for (const to of monthly) {
    let from: RecurringPattern<T> | null = to.replaces ?? null;
    for (const cand of from ? [] : monthly) {
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

/** A stream the user marked as a subscription: every charge counts, whatever their spacing. */
function forcedPattern<T extends LedgerRow>(charges: T[], cadence: Cadence, latestDate: string): RecurringPattern<T> | null {
  const cs = charges.filter((c) => c.amountCents > 0).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (cs.length === 0) return null;
  const last = lastOf(cs);
  const amounts = cs.map((c) => c.amountCents);
  const yearly = cadence === 'yearly';
  const nextExpected = yearly ? addMonthsToDate(last.date, 12) : addOneMonthToDate(last.date);
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
    active: addDays(nextExpected, yearly ? YEARLY_GRACE_DAYS : GRACE_DAYS) >= latestDate,
    forced: true,
    ...(yearly ? { cadence: 'yearly' as const } : {}),
  };
}

/**
 * Runs pattern detection once and derives everything the Subscriptions view needs.
 * `overrides` are the user's corrections: a charge type set to usage or one-time / other is left
 * out of detection, and a stream set to monthly or yearly becomes a subscription whether
 * or not detection agrees.
 */
export function analyze<T extends LedgerRow>(
  rows: T[],
  today: string,
  overrides: Override[] = [],
  providerCategories: ProviderCategory[] = [],
): Analysis<T> {
  const span = dataSpan(rows);
  const latestDate = span?.lastDate ?? today;
  const asOf = latestDate > today ? latestDate : today;
  const ov = overrideMap(overrides);
  const kindFor = (r: T) => overrideOf(ov, r);

  // Detection runs ONCE, on everything that could be a monthly subscription: charges you have not classified and charges of types
  // you confirmed as monthly, together. (A charge type set to Usage or One-time, or confirmed as yearly, is left out.)
  const pool: T[] = [];
  const confirmed = new Set<T>();
  const yearly = new Map<string, T[]>();
  const counts = new Map<string, number>();
  for (const r of rows) {
    const key = streamKey(r.provider, r.merchant);
    if (r.amountCents > 0) counts.set(key, (counts.get(key) ?? 0) + 1);
    const kind = kindFor(r);
    if (!kind) pool.push(r);
    else if (kind === 'monthly') {
      pool.push(r);
      confirmed.add(r);
    } else if (kind === 'yearly') {
      // A single renewal a year cannot be detected, so each yearly charge type is one subscription from its latest charge.
      yearly.set(key, [...(yearly.get(key) ?? []), r]);
    }
  }
  const found = span ? detectRecurring(pool, latestDate) : [];
  const monthlyPatterns = span ? [...found, ...detectProvisional(pool, found, latestDate)] : [];
  if (span) placeConfirmed(monthlyPatterns, confirmed, latestDate);
  // A pattern that contains charges of a type you confirmed is marked as yours ("You marked this as a monthly subscription").
  for (const p of monthlyPatterns) if (p.charges.some((c) => confirmed.has(c))) p.forced = true;
  const yearlyPatterns = span ? [...yearly.values()].flatMap((charges) => forcedPattern(charges, 'yearly', latestDate) ?? []) : [];
  const patterns = [...monthlyPatterns, ...yearlyPatterns].sort(
    (a, b) =>
      Number(b.active) - Number(a.active) ||
      (a.lastDate < b.lastDate ? 1 : a.lastDate > b.lastDate ? -1 : 0) ||
      b.typicalCents - a.typicalCents,
  );

  // ---- the type of every charge
  const inPattern = new Set<T>();
  // Your setting for a charge type comes first in `typeOf`, so charges of confirmed types can be listed here harmlessly.
  for (const p of patterns) for (const c of p.charges) inPattern.add(c);
  const typeOf = (row: T): TypeInfo => {
    const o = kindFor(row);
    if (o) return overrideToInfo(o);
    if (inPattern.has(row)) return { kind: 'subscription', cadence: 'monthly', source: 'pattern' };
    const imported = importedKind(row.type);
    if (imported) return { kind: imported, source: 'import' };
    if (row.amountCents <= 0) return { kind: 'other', source: 'single' };
    return (counts.get(streamKey(row.provider, row.merchant)) ?? 0) >= USAGE_REPEATS
      ? { kind: 'usage', source: 'repeats' }
      : { kind: 'other', source: 'single' };
  };
  // The type of a charge type is judged by its most recent real charge: a refund after three subscription charges is not
  // a one-time charge, so refunds only count when there is nothing else.
  const newest = new Map<string, T>();
  const newestAny = new Map<string, T>();
  for (const r of rows) {
    const k = streamKey(r.provider, r.merchant);
    const anyPrev = newestAny.get(k);
    if (!anyPrev || r.date >= anyPrev.date) newestAny.set(k, r);
    if (r.amountCents <= 0) continue;
    const prev = newest.get(k);
    if (!prev || r.date >= prev.date) newest.set(k, r);
  }
  const streamInfo = (provider: string, merchant: string): TypeInfo | null => {
    const k = streamKey(provider, merchant);
    const r = newest.get(k) ?? newestAny.get(k);
    return r ? typeOf(r) : null;
  };

  const fixed = new Set<T>();
  for (const r of rows) if (typeOf(r).kind === 'subscription') fixed.add(r);

  const ownCategory = new Map(providerCategories.map((c) => [c.provider, c.category]));
  const category = (row: T): Category => {
    // The user's category for a provider beats the built-in map and the charge's type.
    const own = ownCategory.get(row.provider);
    if (own) return own;
    const info = typeOf(row);
    if (info.source === 'you') {
      // The user's word beats the charge's own Type: a stream they call usage is API-style usage.
      if (info.kind === 'subscription') return categoryOf({ ...row, type: 'subscription' }, true);
      if (info.kind === 'usage') return categoryOf({ ...row, type: 'usage' }, false);
      const keep = row.type === 'subscription' || row.type === 'usage' ? undefined : row.type;
      return categoryOf({ ...row, type: keep }, false);
    }
    return categoryOf(row, info.kind === 'subscription');
  };

  const switches = planSwitches(patterns);
  const superseded = new Set(switches.map((s) => s.from));
  const priceChanges: PriceChange[] = [
    ...switches.flatMap((s) => (s.change ? [s.change] : [])),
    ...patterns.flatMap(stepChanges),
  ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.provider.localeCompare(b.provider)));

  // ---- active subscriptions
  const active: Subscription<T>[] = patterns
    .filter((p) => p.active && !superseded.has(p))
    .map((p) => {
      const last = lastOf(p.charges);
      const yearly = p.cadence === 'yearly';
      return {
        pattern: p,
        provider: p.provider,
        merchant: p.merchant,
        category: category(last),
        cadence: yearly ? ('yearly' as const) : ('monthly' as const),
        billedCents: last.amountCents,
        monthlyCents: yearly ? Math.round(last.amountCents / 12) : last.amountCents,
        yearlyCents: yearly ? last.amountCents : last.amountCents * 12,
        lastDate: last.date,
        renewal: yearly
          ? { expected: p.nextExpected, confirmed: p.charges.length >= 2, overdue: p.nextExpected < asOf }
          : null,
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
    if (s.pattern.forced) s.notes.push(`You marked this as a ${s.cadence} subscription`);
    if (s.pattern.provisional) {
      const n = s.pattern.charges.length;
      s.notes.push(`New price seen ${n === 1 ? 'once' : 'twice'}: counted as the same subscription until three charges confirm it`);
    }
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
        .map((s): UpcomingCharge => {
          const yearly = s.cadence === 'yearly';
          return {
            date: yearly ? s.renewal!.expected : nextOccurrence(s.pattern.nextExpected, asOf),
            provider: s.provider,
            merchant: s.merchant,
            cents: s.billedCents,
            cadence: s.cadence,
            estimated: yearly && !s.renewal!.confirmed,
            overdue: yearly && s.renewal!.overdue,
          };
        })
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
        cadence: p.cadence === 'yearly' ? ('yearly' as const) : ('monthly' as const),
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
    typeOf,
    streamInfo,
    categoryOf: category,
    report: {
      asOf,
      latestDate,
      dataFresh,
      active,
      monthlyCents,
      yearlyCents: active.reduce((a, s) => a + s.yearlyCents, 0),
      upcoming,
      upcomingCents: upcoming.reduce((a, u) => a + u.cents, 0),
      priceChanges,
      stopped,
      overlaps,
    },
  };
}

// ---------- subscription, usage and one-time over time ----------

export interface TypeMonth {
  month: string;
  subscriptionCents: number;
  usageCents: number;
  otherCents: number;
}

const BUCKET: Record<ChargeKind, 'subscriptionCents' | 'usageCents' | 'otherCents'> = {
  subscription: 'subscriptionCents',
  usage: 'usageCents',
  other: 'otherCents',
};

export function typeByMonth<T extends LedgerRow>(rows: T[], months: string[], typeOf: (row: T) => TypeInfo): TypeMonth[] {
  const by = new Map<string, TypeMonth>(months.map((m) => [m, { month: m, subscriptionCents: 0, usageCents: 0, otherCents: 0 }]));
  for (const r of rows) {
    const row = by.get(monthOf(r.date));
    if (row) row[BUCKET[typeOf(r).kind]] += r.amountCents;
  }
  return months.map((m) => by.get(m)!);
}

export interface TypeTotals {
  subscriptionCents: number;
  usageCents: number;
  otherCents: number;
  /** Providers with subscription charges. */
  tools: number;
}

export interface TypeChange {
  beforeFrom: string;
  beforeTo: string;
  afterFrom: string;
  afterTo: string;
  before: TypeTotals;
  after: TypeTotals;
}

/** Last 3 complete months against the 3 before, split by charge type. */
export function typeChange<T extends LedgerRow>(rows: T[], typeOf: (row: T) => TypeInfo, lastCompleteMonth: string): TypeChange {
  const afterFrom = addMonths(lastCompleteMonth, -2);
  const beforeTo = addMonths(lastCompleteMonth, -3);
  const beforeFrom = addMonths(lastCompleteMonth, -5);
  const sum = (from: string, to: string): TypeTotals => {
    const t: TypeTotals = { subscriptionCents: 0, usageCents: 0, otherCents: 0, tools: 0 };
    const tools = new Set<string>();
    for (const r of rows) {
      const m = monthOf(r.date);
      if (m < from || m > to) continue;
      const kind = typeOf(r).kind;
      t[BUCKET[kind]] += r.amountCents;
      if (kind === 'subscription') tools.add(r.provider);
    }
    t.tools = tools.size;
    return t;
  };
  return { beforeFrom, beforeTo, afterFrom, afterTo: lastCompleteMonth, before: sum(beforeFrom, beforeTo), after: sum(afterFrom, lastCompleteMonth) };
}

/** One plain sentence answering "more tools or more usage?". Null when nothing changed. */
export function typeSentence(c: TypeChange): string | null {
  const dSub = c.after.subscriptionCents - c.before.subscriptionCents;
  const dUsage = c.after.usageCents - c.before.usageCents;
  const dOther = c.after.otherCents - c.before.otherCents;
  const total = dSub + dUsage + dOther;
  if (dSub === 0 && dUsage === 0 && dOther === 0) return null;
  const range = `${monthShort(c.afterFrom)}–${monthShort(c.afterTo)} vs ${monthShort(c.beforeFrom)}–${monthShort(c.beforeTo)}`;
  const signed = (n: number) => `${n >= 0 ? '+' : '−'}${formatEUR(Math.abs(n))}`;
  const toolsDelta = c.after.tools - c.before.tools;
  const tools = toolsDelta === 0 ? '' : ` (${toolsDelta > 0 ? '+' : '−'}${Math.abs(toolsDelta)} provider${Math.abs(toolsDelta) === 1 ? '' : 's'} with subscriptions)`;
  return `${total >= 0 ? 'Spending rose' : 'Spending fell'} ${signed(total)} (${range}): subscriptions ${signed(dSub)}${tools}, usage ${signed(dUsage)}, one-time ${signed(dOther)}.`;
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
