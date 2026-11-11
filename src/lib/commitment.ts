import type { TypeInfo } from './overrides';
import type { LedgerRow } from './types';

/*
 * Commitment split
 * ----------------
 * How a period's spending divides by what kind of commitment each charge is:
 *   - Subscriptions: charges read as a subscription, confirmed or suggested,
 *   - Usage: charges read as pay-as-you-go, confirmed or suggested,
 *   - One-time: charges you confirmed as One-time / Other. Only your word counts,
 *   - Unclassified: everything else, i.e. charges the app only guesses are one-time or knows nothing about
 *     (a descriptor seen once or twice, a file's Type column, a refund).
 * A guess is never reported as one-time. Every charge lands in exactly one of the four, so the parts add up to the total.
 */

export type Commitment = 'subscription' | 'usage' | 'oneTime' | 'unclassified';

export const COMMITMENTS: Commitment[] = ['subscription', 'usage', 'oneTime', 'unclassified'];

export const COMMITMENT_LABELS: Record<Commitment, string> = {
  subscription: 'Subscriptions',
  usage: 'Usage',
  oneTime: 'One-time',
  unclassified: 'Unclassified',
};

export function commitmentOf(info: TypeInfo): Commitment {
  if (info.kind === 'subscription') return 'subscription';
  if (info.kind === 'usage') return 'usage';
  return info.source === 'you' ? 'oneTime' : 'unclassified';
}

export interface CommitmentLine {
  commitment: Commitment;
  cents: number;
  count: number;
  /** Share of the total (0 to 1), or null when the total is not positive. */
  share: number | null;
}

export interface CommitmentSplit {
  totalCents: number;
  /** Always all four, in `COMMITMENTS` order, so a caller can drop the empty ones. */
  lines: CommitmentLine[];
}

export function splitByCommitment<T extends LedgerRow>(rows: T[], typeOf: (row: T) => TypeInfo): CommitmentSplit {
  const cents: Record<Commitment, number> = { subscription: 0, usage: 0, oneTime: 0, unclassified: 0 };
  const count: Record<Commitment, number> = { subscription: 0, usage: 0, oneTime: 0, unclassified: 0 };
  let totalCents = 0;
  for (const r of rows) {
    const c = commitmentOf(typeOf(r));
    cents[c] += r.amountCents;
    count[c] += 1;
    totalCents += r.amountCents;
  }
  return {
    totalCents,
    lines: COMMITMENTS.map((commitment) => ({
      commitment,
      cents: cents[commitment],
      count: count[commitment],
      share: totalCents > 0 ? cents[commitment] / totalCents : null,
    })),
  };
}
