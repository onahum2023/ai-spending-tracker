import type { LedgerRow } from './types';

/*
 * Your corrections to the automatic detection
 * -------------------------------------------
 * Pattern detection guesses. These overrides are the user's answer, kept per stream: all
 * charges with the same provider and merchant descriptor, which is how detection chains
 * charges too.
 *
 *   subscription  A monthly subscription, even if the charges do not form a clean pattern
 *                 (a new plan with one or two charges, a changed billing day).
 *   usage         Usage or credits only: never a subscription. Counts as usage, not recurring.
 *   ignore        Not worth tracking as a subscription: left out of the subscription views.
 *
 * None of them delete or change a charge. Spending totals stay exactly as recorded.
 */

export type OverrideKind = 'subscription' | 'usage' | 'ignore';

export interface Override {
  provider: string;
  merchant: string;
  kind: OverrideKind;
}

export const OVERRIDE_LABELS: Record<OverrideKind, string> = {
  subscription: 'Monthly subscription',
  usage: 'Usage only',
  ignore: 'Ignore',
};

export const streamKey = (provider: string, merchant: string) => `${provider}\u0000${merchant}`;

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

/** How many charges share this stream, so the UI can say what a change affects. */
export function streamSize(rows: Pick<LedgerRow, 'provider' | 'merchant'>[], provider: string, merchant: string): number {
  let n = 0;
  for (const r of rows) if (r.provider === provider && r.merchant === merchant) n++;
  return n;
}

const KINDS: readonly string[] = ['subscription', 'usage', 'ignore'];

/** Cleans anything read from storage. */
export function normalizeOverrides(raw: unknown): Override[] {
  if (!Array.isArray(raw)) return [];
  const out = new Map<string, Override>();
  for (const r of raw as Record<string, unknown>[]) {
    if (typeof r?.provider !== 'string' || typeof r.merchant !== 'string' || !r.provider || !r.merchant) continue;
    if (typeof r.kind !== 'string' || !KINDS.includes(r.kind)) continue;
    out.set(streamKey(r.provider, r.merchant), { provider: r.provider, merchant: r.merchant, kind: r.kind as OverrideKind });
  }
  return [...out.values()].sort((a, b) => a.provider.localeCompare(b.provider) || a.merchant.localeCompare(b.merchant));
}
