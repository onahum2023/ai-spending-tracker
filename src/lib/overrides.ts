import { normalizeDescriptor } from './chargeTypes';
import type { ServiceType } from './extract/types';
import type { LedgerRow } from './types';

/*
 * Charge types, and your corrections to them
 * ------------------------------------------
 * Every charge is one of three things, by how it is billed:
 *
 *   Subscription  A fixed amount on a schedule, monthly or yearly.
 *   Usage         Pay as you go: API credits, top-ups, overages. Amounts and timing vary.
 *   One-time / Other  Everything else.
 *
 * The app guesses (see insights.ts); you correct it. Detection can only recognise a
 * monthly subscription. A yearly one is always your call, because one renewal a year
 * cannot be told from a one-off charge.
 *
 * A correction applies to a charge type: every charge with the same provider and the same cleaned
 * description (see chargeTypes.ts), past and future. Precedence: your setting for the charge type >
 * detection > import > repeats > single. A correction never changes a charge or a total, only how the
 * charge is read.
 */

export type ChargeKind = 'subscription' | 'usage' | 'other';
export type Cadence = 'monthly' | 'yearly';

/** What you can set a stream to. */
export type OverrideKind = 'monthly' | 'yearly' | 'usage' | 'other';

export interface Override {
  provider: string;
  merchant: string;
  kind: OverrideKind;
}

/** How a charge's type was decided. */
export type TypeSource =
  | 'you' // you set it
  | 'pattern' // it repeats monthly on a similar day and amount
  | 'import' // the statement import or a Type column said so
  | 'repeats' // charged 3+ times with that descriptor, but not on a monthly schedule
  | 'single'; // fewer than 3 charges with that descriptor

export interface TypeInfo {
  kind: ChargeKind;
  /** Only for subscriptions, and only when known (a Type column cannot say). */
  cadence?: Cadence;
  source: TypeSource;
}

export const KIND_LABELS: Record<ChargeKind, string> = {
  subscription: 'Subscription',
  usage: 'Usage',
  other: 'One-time / Other',
};

export const OVERRIDE_LABELS: Record<OverrideKind, string> = {
  monthly: 'Subscription · monthly',
  yearly: 'Subscription · yearly',
  usage: 'Usage',
  other: 'One-time / Other',
};

export const OVERRIDE_HELP: Record<OverrideKind, string> = {
  monthly: 'Counted as a monthly subscription, even if the charges do not form a clean pattern.',
  yearly: 'Counted as a yearly subscription. The next renewal is estimated a year after the last charge until a real one shows up.',
  usage: 'Pay as you go: never a subscription.',
  other: 'Not a subscription and not usage.',
};

export function typeLabel(t: TypeInfo): string {
  if (t.kind !== 'subscription') return KIND_LABELS[t.kind];
  return t.cadence ? `Subscription · ${t.cadence}` : 'Subscription';
}

export const WHY: Record<TypeSource, string> = {
  you: 'You set this',
  pattern: 'Repeats monthly on a similar day and amount',
  import: 'From the statement import or the file’s Type column',
  repeats: 'Charged 3 or more times with this descriptor, but not on a monthly schedule',
  single: 'Fewer than 3 charges with this descriptor',
};

export function overrideToInfo(kind: OverrideKind): TypeInfo {
  if (kind === 'monthly') return { kind: 'subscription', cadence: 'monthly', source: 'you' };
  if (kind === 'yearly') return { kind: 'subscription', cadence: 'yearly', source: 'you' };
  return { kind, source: 'you' };
}

/** The extractor's finer types, as the three. Certification, Domains, Hosting and Other are one-time / other. */
export function importedKind(type: ServiceType | undefined): ChargeKind | null {
  if (!type) return null;
  if (type === 'subscription') return 'subscription';
  if (type === 'usage') return 'usage';
  return 'other';
}

/** One charge type: a provider plus its cleaned description. Settings stored under a raw description still match. */
export const streamKey = (provider: string, merchant: string) => `${provider}\u0000${normalizeDescriptor(merchant)}`;

export type OverrideMap = Map<string, OverrideKind>;

export function overrideMap(list: Override[]): OverrideMap {
  return new Map(list.map((o) => [streamKey(o.provider, o.merchant), o.kind]));
}

export const overrideOf = (map: OverrideMap, row: Pick<LedgerRow, 'provider' | 'merchant'>): OverrideKind | undefined =>
  map.get(streamKey(row.provider, row.merchant));

/** Sets the override for one stream, or with null removes it (back to automatic). */
export function withOverride(list: Override[], provider: string, merchant: string, kind: OverrideKind | null): Override[] {
  const rest = list.filter((o) => streamKey(o.provider, o.merchant) !== streamKey(provider, merchant));
  return kind ? [...rest, { provider, merchant, kind }] : rest;
}

/** How many charges share this charge type, so the UI can say what a change affects. */
export function streamSize(rows: Pick<LedgerRow, 'provider' | 'merchant'>[], provider: string, merchant: string): number {
  const key = streamKey(provider, merchant);
  let n = 0;
  for (const r of rows) if (streamKey(r.provider, r.merchant) === key) n++;
  return n;
}

const KINDS: readonly string[] = ['monthly', 'yearly', 'usage', 'other'];
/** Earlier versions saved 'subscription' and 'ignore'. */
const LEGACY: Record<string, OverrideKind> = { subscription: 'monthly', ignore: 'other' };

/** Cleans anything read from storage, converting corrections saved by earlier versions. */
export function normalizeOverrides(raw: unknown): Override[] {
  if (!Array.isArray(raw)) return [];
  const out = new Map<string, Override>();
  for (const r of raw as Record<string, unknown>[]) {
    if (typeof r?.provider !== 'string' || typeof r.merchant !== 'string' || !r.provider || !r.merchant) continue;
    if (typeof r.kind !== 'string') continue;
    const kind = KINDS.includes(r.kind) ? (r.kind as OverrideKind) : LEGACY[r.kind];
    if (!kind) continue;
    out.set(streamKey(r.provider, r.merchant), { provider: r.provider, merchant: r.merchant, kind });
  }
  return [...out.values()].sort((a, b) => a.provider.localeCompare(b.provider) || a.merchant.localeCompare(b.merchant));
}
