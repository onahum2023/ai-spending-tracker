import { dataSpan, type MonthlyStackRow } from './analytics';
import { hasReference, referenceKey } from './chargeTypes';
import { CATEGORIES, CATEGORY_NOUNS, OVERLAP_CATEGORIES, categoryOf, type Category, type ProviderCategory } from './categories';
import { addDays, addMonths, addMonthsToDate, addOneMonthToDate, dayOf, monthDiff, monthOf, monthShort } from './dates';
import { STALE_AFTER_DAYS, type ExpectedCharge } from './forecast';
import { planGroups, type Label } from './labels';
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
  upcoming: UpcomingCharge[];
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
  /**
   * Recurring charges still due later this month with strong evidence: confirmed by you, or found by the pattern rule with the
   * latest charge in the previous month. Each at its charge type's last actual charge. This is all the month-end estimate adds.
   */
  expected: ExpectedCharge[];
  report: SubscriptionReport<T>;
}

const lastOf = <T,>(xs: T[]): T => xs[xs.length - 1];

/**
 * What makes two charges the same charge type in the pattern logic: the cleaned descriptor, or, when you gave two or more
 * descriptors of one provider the same label, the plan they share (see `planGroups`).
 */
type TypeKey = (r: LedgerRow) => string;
const descriptorKey: TypeKey = (r) => streamKey(r.provider, r.merchant);

/**
 * The charges that belong to the same stream as a pattern, for "does anything still charge after it stopped?".
 * As narrow as the pattern allows: the same reference when the pattern's charges actually carry one ("ACME* PLAN ABC123" is not
 * "ACME* PLAN XYZ456", two subscriptions that share a charge type), else the same charge type (a later "ACME* PLAN ABC123" still
 * counts for a plan that never showed a reference), else the whole provider (the description changes every time).
 */
function streamMatcher<T extends LedgerRow>(p: RecurringPattern<T>, key: TypeKey = descriptorKey): (r: LedgerRow) => boolean {
  const refs = new Set(p.charges.map((c) => referenceKey(c.merchant)));
  if (refs.size === 1 && p.charges.every((c) => hasReference(c.merchant))) {
    const ref = [...refs][0];
    return (r) => r.provider === p.provider && referenceKey(r.merchant) === ref;
  }
  const types = new Set(p.charges.map(key));
  const only = [...types][0];
  return types.size > 1 ? (r) => r.provider === p.provider : (r) => r.provider === p.provider && key(r) === only;
}

/**
 * How different the amount of a renewal of a pattern that is still on schedule may be: 60% of the larger of the two. A real price
 * change (20 to 30) or a discount passes; a stray charge a fraction of the amount does not take the renewal's place.
 */
export const RENEWAL_AMOUNT_TOLERANCE = 0.6;

/** How far a charge's billing day is from a pattern's (both near month-end counts as the same day). */
function billingDayGap<T extends LedgerRow>(p: RecurringPattern<T>, c: T): number {
  const day = dayOf(c.date);
  return day >= 27 && p.typicalDay >= 27 ? 0 : Math.abs(day - p.typicalDay);
}

/**
 * Could this leftover charge be the next charge of this pattern, looking only at the pattern (its dates and amount)?
 * A pattern that has stopped can be revived at any price; one still on schedule is only continued by its next monthly renewal
 * (the charge after a revival is exactly that), at a plausible amount. A charge in the same month near its day is noise or
 * another schedule.
 */
function followsOn<T extends LedgerRow>(p: RecurringPattern<T>, c: T): boolean {
  if (p.standalone || p.provider !== c.provider || p.lastDate >= c.date) return false;
  if (!daysClose(dayOf(c.date), p.typicalDay)) return false;
  if (!p.active) return true;
  if (monthDiff(monthOf(p.lastDate), monthOf(c.date)) !== 1) return false;
  const last = p.charges[p.charges.length - 1].amountCents;
  return Math.abs(c.amountCents - last) <= RENEWAL_AMOUNT_TOLERANCE * Math.max(c.amountCents, last);
}

/**
 * Did a later pattern of the same charge type pick up at the price `p` ended on (within 2%)? Then it is the same subscription
 * carrying on (a billing day that drifted, or a missed month, reads exactly like that), not a stopped one waiting to come back,
 * and a charge must not revive it next to its successor: automatic detection counts the pair once, so Confirm must too.
 */
function isSuperseded<T extends LedgerRow>(p: RecurringPattern<T>, patterns: RecurringPattern<T>[], key: TypeKey = descriptorKey): boolean {
  const was = p.charges[p.charges.length - 1].amountCents;
  const types = new Set(p.charges.map(key));
  return patterns.some((q) => {
    if (q === p || q.standalone || q.provider !== p.provider || q.firstDate <= p.lastDate) return false;
    const now = q.charges[0].amountCents;
    return Math.abs(now - was) <= 0.02 * Math.max(now, was) && q.charges.some((x) => types.has(key(x)));
  });
}

/**
 * Can this leftover charge continue this pattern? See `placeConfirmed`. `replacerOf` maps a pattern to the one a plan switch
 * already continued it with.
 */
function canContinue<T extends LedgerRow>(p: RecurringPattern<T>, c: T, replacerOf: Map<RecurringPattern<T>, RecurringPattern<T>>, superseded: Set<RecurringPattern<T>>, key: TypeKey = descriptorKey): boolean {
  if (!followsOn(p, c) || superseded.has(p)) return false;
  // A pattern that a plan switch already continued is not revived by a charge that its replacer can take as its own next
  // renewal, nor by one that sits no closer to its billing day than to its replacer's. Only a charge the replacer cannot take and
  // that keeps the old billing day is the old pattern's return. (A superseded pattern is not revived at all: see `isSuperseded`.)
  const replacer = replacerOf.get(p);
  if (replacer && (followsOn(replacer, c) || billingDayGap(p, c) >= billingDayGap(replacer, c))) return false;
  // It has to share the charge type: two subscriptions that bill a few days apart under different descriptions are not each
  // other's continuation.
  const type = key(c);
  return p.charges.some((x) => key(x) === type);
}

/** How a leftover charge ranks against a pattern it can continue; lower is better. See `fit`. */
type Fit = [known: number, implausible: number, dayGap: number, moneyGap: number, date: string, patternEnd: string];

/**
 * How well a leftover charge fits a pattern it can continue; lower is better, compared in order:
 * 0/1  whether the charge carries a reference that this pattern has shown before. Only a MATCH counts, as an identity: a charge
 *      without a reference, or with one the pattern has never shown (a subscription renewing under a new code), says nothing
 *      against the pattern, so it must never lose to a charge that merely has no reference,
 * 0/1  whether the amount is far from the pattern's last one (beyond the renewal tolerance): a stray a fraction of the price must
 *      not beat the real renewal because it happens to land on the exact day (a pattern that has stopped can still come back at
 *      any price when nothing plausible competes),
 * the distance between billing days, the distance between amounts, then the earlier charge, then the pattern that ended latest.
 */
function fit<T extends LedgerRow>(p: RecurringPattern<T>, c: T): Fit {
  const reference = referenceKey(c.merchant);
  const known = hasReference(c.merchant) && p.charges.some((x) => referenceKey(x.merchant) === reference) ? 0 : 1;
  const last = p.charges[p.charges.length - 1].amountCents;
  const moneyGap = Math.abs(c.amountCents - last);
  const implausible = moneyGap > RENEWAL_AMOUNT_TOLERANCE * Math.max(c.amountCents, last) ? 1 : 0;
  return [known, implausible, billingDayGap(p, c), moneyGap, c.date, p.lastDate];
}

function betterFit(a: Fit, b: Fit): boolean {
  for (let i = 0; i < 4; i++) if (a[i] !== b[i]) return (a[i] as number) < (b[i] as number);
  // The earlier charge first, then the pattern that ended latest (the live one, not the one that was already continued).
  return a[4] !== b[4] ? a[4] < b[4] : a[5] > b[5];
}

/**
 * What to do with the charges of charge types you confirmed as monthly that detection could not place in a pattern.
 * Detection itself ran on everything that could be a monthly subscription (confirmed or not, together), so confirming never
 * cuts a chain in two and never disagrees with what the app already counted. For the leftovers:
 *   - they are matched to patterns they can continue (`canContinue`) by best fit, best pair first, not in date order: an early
 *     stray charge must not take the slot of the renewal that fits exactly, whatever reference either carries (`fit`). A matched
 *     charge is added to its pattern;
 *   - the rest of a charge type that no active pattern covers are one subscription counted from its latest charge (irregular
 *     days or amounts), as a stand-in that takes no part in plan-switch matching;
 *   - the rest of a charge type that an active pattern does cover are left out: they are noise within a subscription.
 */
function placeConfirmed<T extends LedgerRow>(patterns: RecurringPattern<T>[], confirmed: Set<T>, latestDate: string, key: TypeKey = descriptorKey): void {
  const explained = new Set(patterns.flatMap((p) => p.charges));
  // All the leftovers compete together, whatever their charge type: matching one type first would move a pattern's last date past
  // an earlier charge of another type, which could then no longer continue it.
  let leftover = [...confirmed].filter((c) => c.amountCents > 0 && !explained.has(c));
  for (;;) {
    const replacerOf = new Map(patterns.flatMap((p) => (p.replaces ? [[p.replaces, p] as const] : [])));
    const superseded = new Set(patterns.filter((p) => isSuperseded(p, patterns, key)));
    let best: { p: RecurringPattern<T>; c: T; score: Fit } | null = null;
    for (const c of leftover) {
      for (const p of patterns) {
        if (!canContinue(p, c, replacerOf, superseded, key)) continue;
        const score = fit(p, c);
        if (!best || betterFit(score, best.score)) best = { p, c, score };
      }
    }
    if (!best) break;
    const grown = forcedPattern([...best.p.charges, best.c], 'monthly', latestDate);
    if (!grown) break;
    // Grow it in place: plan-switch links (`replaces`) point at these very objects.
    const { forced: _f, cadence: _c, ...fields } = grown;
    Object.assign(best.p, fields);
    // A pattern that comes back on its own billing day was not replaced after all: drop the plan-switch claim, so it is counted
    // again alongside the pattern that was read as its new price.
    const replacer = replacerOf.get(best.p);
    if (replacer) {
      delete replacer.replaces;
      replacer.noSwitch = true;
    }
    const placed = best.c;
    leftover = leftover.filter((c) => c !== placed);
  }
  // What no pattern could take: per charge type.
  const byType = new Map<string, T[]>();
  for (const c of confirmed) {
    const k = key(c);
    byType.set(k, [...(byType.get(k) ?? []), c]);
  }
  for (const typeCharges of byType.values()) {
    if (!leftover.some((c) => typeCharges.includes(c))) continue;
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
    for (const cand of from || to.noSwitch ? [] : monthly) {
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
  /** Labels you gave charge types. Descriptors of one provider that share a label are read as one plan. */
  labels: Label[] = [],
): Analysis<T> {
  const span = dataSpan(rows);
  const latestDate = span?.lastDate ?? today;
  const asOf = latestDate > today ? latestDate : today;
  const ov = overrideMap(overrides);
  const kindFor = (r: T) => overrideOf(ov, r);
  const plans = planGroups(labels);
  const typeKey: TypeKey = (r) => plans.get(streamKey(r.provider, r.merchant)) ?? streamKey(r.provider, r.merchant);
  /** Only grouped descriptors are given a shared identity; everything else is detected exactly as before. */
  const planOf = plans.size ? (r: LedgerRow) => plans.get(streamKey(r.provider, r.merchant)) : undefined;

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
  const found = span ? detectRecurring(pool, latestDate, planOf) : [];
  const monthlyPatterns = span ? [...found, ...detectProvisional(pool, found, latestDate, planOf)] : [];
  if (span) placeConfirmed(monthlyPatterns, confirmed, latestDate, typeKey);
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
  /** The newest real charge of each charge type, a plan counting as one: what the month-end estimate adds. */
  const newestOfType = new Map<string, T>();
  for (const r of rows) {
    if (r.amountCents > 0) {
      const tk = typeKey(r);
      const prevT = newestOfType.get(tk);
      if (!prevT || r.date >= prevT.date) newestOfType.set(tk, r);
    }
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
  // A plan you grouped under one label (descriptors that share it) is stopped only when none of its descriptors is still running.
  const runningPlans = new Set(
    active.flatMap((s) => {
      const last = lastOf(s.pattern.charges);
      return plans.has(streamKey(last.provider, last.merchant)) ? [typeKey(last)] : [];
    }),
  );
  const planRuns = (p: RecurringPattern<T>) => {
    const last = lastOf(p.charges);
    return plans.has(streamKey(last.provider, last.merchant)) && runningPlans.has(typeKey(last));
  };
  const stopped: StoppedSubscription<T>[] = patterns
    .filter((p) => !p.active && !superseded.has(p) && !planRuns(p))
    .map((p) => {
      const last = lastOf(p.charges);
      const same = streamMatcher(p, typeKey);
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

  // ---- strongly expected later this month (the month-end estimate adds only these)
  const thisMonth = monthOf(asOf);
  const lastMonth = addMonths(thisMonth, -1);
  const expected: ExpectedCharge[] = span
    ? active.flatMap((s): ExpectedCharge[] => {
        const p = s.pattern;
        const confirmedByYou = Boolean(p.forced);
        // The pattern rule is trusted only while it is current: its latest charge was last month, and it is not a new price seen once or twice.
        if (!confirmedByYou && (p.provisional || monthOf(p.lastDate) !== lastMonth)) return [];
        const yearly = s.cadence === 'yearly';
        const date = yearly ? s.renewal!.expected : nextOccurrence(p.nextExpected, asOf);
        if (monthOf(date) !== thisMonth || date <= asOf) return [];
        const last = lastOf(p.charges);
        const cents = newestOfType.get(typeKey(last))?.amountCents ?? s.billedCents;
        return [{ provider: s.provider, merchant: s.merchant, category: s.category, date, cents, confirmed: confirmedByYou, cadence: s.cadence }];
      })
    : [];

  return {
    patterns,
    fixed,
    typeOf,
    streamInfo,
    categoryOf: category,
    expected,
    report: {
      asOf,
      latestDate,
      dataFresh,
      active,
      upcoming,
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
