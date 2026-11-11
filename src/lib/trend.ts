/*
 * Trend arrow on the Providers list
 * ---------------------------------
 * Spending in the last 3 complete months against the 3 before, one-time charges left out (the caller leaves them out of both
 * sums). An arrow is shown only when the change is more than 5% AND more than EUR 5; anything smaller reads as flat, so a few
 * cents of drift on a small provider does not look like a trend.
 */

/** A change must be more than this share of the earlier spending... */
export const TREND_MIN_PCT = 0.05;
/** ...and more than this many cents. */
export const TREND_MIN_CENTS = 500;

export type TrendDirection = 'up' | 'down' | 'flat' | 'none';

export interface Trend {
  direction: TrendDirection;
  /** 'new': nothing before, something now. 'ended': something before, nothing now. */
  kind: 'new' | 'ended' | 'change' | 'none';
  lastCents: number;
  prevCents: number;
  deltaCents: number;
  /** Change as a share of the earlier spending, or null when there was none. */
  pct: number | null;
}

export function providerTrend(lastCents: number, prevCents: number): Trend {
  const deltaCents = lastCents - prevCents;
  const base = { lastCents, prevCents, deltaCents };
  if (lastCents === 0 && prevCents === 0) return { ...base, direction: 'none', kind: 'none', pct: null };
  const pct = prevCents === 0 ? null : deltaCents / Math.abs(prevCents);
  const kind = prevCents === 0 ? 'new' : lastCents === 0 ? 'ended' : 'change';
  const big = Math.abs(deltaCents) > TREND_MIN_CENTS && (pct === null || Math.abs(pct) > TREND_MIN_PCT);
  if (!big) return { ...base, direction: 'flat', kind, pct };
  return { ...base, direction: deltaCents > 0 ? 'up' : 'down', kind, pct };
}
