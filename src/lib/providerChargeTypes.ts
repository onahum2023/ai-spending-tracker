import { cleanDescriptor } from './chargeTypes';
import type { StoppedSubscription, Subscription, SubscriptionReport } from './insights';
import { labelMap, labelOf, type Label } from './labels';
import { overrideMap, streamKey, type Override, type OverrideKind, type TypeInfo } from './overrides';
import type { LedgerRow } from './types';

/*
 * The charge types of a provider, as the Provider page lists them. One row per charge type (see chargeTypes.ts) with what
 * you need to decide what it is: how many charges, how much, when last, what the app guesses, and what you set.
 * A charge type with no setting of yours is "to review": it shows the app's guess until you confirm or change it.
 */

export interface ChargeTypeSummary {
  /** Provider plus cleaned description. */
  key: string;
  provider: string;
  /** The most common raw description. Settings are saved under it, and match every charge of the charge type. */
  merchant: string;
  /** Your label, else the cleaned description. */
  name: string;
  label: string | undefined;
  /** The cleaned description, which is what the charges have in common. */
  descriptor: string;
  /** How many different raw descriptions it covers (reference codes and cities make them differ). */
  rawVariants: number;
  count: number;
  totalCents: number;
  firstDate: string;
  lastDate: string;
  /** What you set, or null while it is still to review. */
  setting: OverrideKind | null;
  /** What the app reads it as, judged by the most recent charge. Only meaningful while `setting` is null. */
  guess: TypeInfo;
}

/** The setting that confirms the app's guess as it stands. A guess can only be a monthly subscription, never yearly. */
export function suggestedSetting(guess: TypeInfo): OverrideKind {
  if (guess.kind === 'subscription') return guess.cadence === 'yearly' ? 'yearly' : 'monthly';
  return guess.kind;
}

/** Charge types of the given charges (normally one provider's), biggest first. */
export function listChargeTypes<T extends LedgerRow>(
  rows: T[],
  overrides: Override[],
  labels: Label[],
  typeOf: (row: T) => TypeInfo,
): ChargeTypeSummary[] {
  const set = overrideMap(overrides);
  const names = labelMap(labels);
  const groups = new Map<string, T[]>();
  for (const r of rows) {
    const k = streamKey(r.provider, r.merchant);
    const list = groups.get(k);
    if (list) list.push(r);
    else groups.set(k, [r]);
  }
  const out: ChargeTypeSummary[] = [];
  for (const [key, list] of groups) {
    const raw = new Map<string, number>();
    for (const r of list) raw.set(r.merchant, (raw.get(r.merchant) ?? 0) + 1);
    const merchant = [...raw.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
    const newest = list.reduce((a, b) => (b.date >= a.date ? b : a));
    // Judge it by the most recent real charge, not a refund that came after (see analyze's streamInfo).
    const real = list.filter((r) => r.amountCents > 0);
    const judged = real.length ? real.reduce((a, b) => (b.date >= a.date ? b : a)) : newest;
    const label = labelOf(names, newest.provider, merchant);
    const descriptor = cleanDescriptor(merchant);
    out.push({
      key,
      provider: newest.provider,
      merchant,
      name: label ?? descriptor,
      label,
      descriptor,
      rawVariants: raw.size,
      count: list.length,
      totalCents: list.reduce((n, r) => n + r.amountCents, 0),
      firstDate: list.reduce((a, r) => (r.date < a ? r.date : a), list[0].date),
      lastDate: newest.date,
      setting: set.get(key) ?? null,
      guess: typeOf(judged),
    });
  }
  return out.sort((a, b) => b.totalCents - a.totalCents || b.count - a.count || a.name.localeCompare(b.name));
}

/** How many charge types of each provider are still to review, for the badges. Providers with none are left out. */
export function reviewCounts(rows: LedgerRow[], overrides: Override[]): Map<string, number> {
  const set = overrideMap(overrides);
  const seen = new Set<string>();
  const out = new Map<string, number>();
  for (const r of rows) {
    const k = streamKey(r.provider, r.merchant);
    if (seen.has(k)) continue;
    seen.add(k);
    if (!set.has(k)) out.set(r.provider, (out.get(r.provider) ?? 0) + 1);
  }
  return out;
}

/** The recurring charges the app found that end in one charge type. */
export interface TypePatterns<T extends LedgerRow = LedgerRow> {
  active: Subscription<T>[];
  stopped: StoppedSubscription<T>[];
}

/**
 * Attaches each recurring charge the app found (active and stopped) to the charge type of its latest charge, keyed like
 * `ChargeTypeSummary.key`, so the Provider page can show what the app reads under the charge type it concerns. Each one lands
 * under exactly one charge type, even when a pattern spans several descriptors.
 */
export function patternsByChargeType<T extends LedgerRow>(report: SubscriptionReport<T>): Map<string, TypePatterns<T>> {
  const out = new Map<string, TypePatterns<T>>();
  const slot = (key: string) => out.get(key) ?? out.set(key, { active: [], stopped: [] }).get(key)!;
  const keyOf = (charges: T[]) => {
    const last = charges[charges.length - 1];
    return streamKey(last.provider, last.merchant);
  };
  for (const s of report.active) slot(keyOf(s.pattern.charges)).active.push(s);
  for (const s of report.stopped) slot(keyOf(s.pattern.charges)).stopped.push(s);
  return out;
}
