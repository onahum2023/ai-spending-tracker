import { describe, expect, it } from 'vitest';
import { analyze } from './insights';
import { providerTrend, TREND_MIN_CENTS } from './trend';
import { addMonths } from './dates';
import { providerTotals, rowsInMonths } from './analytics';
import type { LedgerRow } from './types';

describe('provider trend', () => {
  it('shows an arrow only when the change is more than 5% and more than 5 euro', () => {
    expect(providerTrend(11000, 10000)).toMatchObject({ direction: 'up', kind: 'change' }); // +10%, +10.00
    expect(providerTrend(9000, 10000)).toMatchObject({ direction: 'down' });
    // More than 5% but not more than 5 euro: flat.
    expect(providerTrend(1400, 1000)).toMatchObject({ direction: 'flat' }); // +40%, +4.00
    // More than 5 euro but not more than 5%: flat.
    expect(providerTrend(100_800, 100_000)).toMatchObject({ direction: 'flat' }); // +0.8%, +8.00
  });

  it('needs both, strictly: exactly 5% or exactly 5 euro is still flat, just over both is an arrow', () => {
    expect(providerTrend(10_500, 10_000).direction).toBe('flat'); // exactly +5%
    expect(providerTrend(1000 + TREND_MIN_CENTS, 1000).direction).toBe('flat'); // exactly +5.00 (and +50%)
    expect(providerTrend(10_501, 10_000).direction).toBe('up'); // +5.01% and +5.01: just over both
  });

  it('a new or ended provider follows the same euro rule', () => {
    expect(providerTrend(2500, 0)).toMatchObject({ direction: 'up', kind: 'new', pct: null });
    expect(providerTrend(300, 0)).toMatchObject({ direction: 'flat', kind: 'new' });
    expect(providerTrend(0, 2500)).toMatchObject({ direction: 'down', kind: 'ended' });
    expect(providerTrend(0, 300)).toMatchObject({ direction: 'flat', kind: 'ended' });
  });

  it('says nothing when there was no spending in either period', () => {
    expect(providerTrend(0, 0)).toMatchObject({ direction: 'none', pct: null });
  });

  it('reports the figures it compared', () => {
    expect(providerTrend(12_000, 10_000)).toMatchObject({ lastCents: 12_000, prevCents: 10_000, deltaCents: 2000, pct: 0.2 });
  });
});

describe('trend leaves one-time charges out', () => {
  const row = (date: string, cents: number, provider: string, merchant: string): LedgerRow => ({ provider, merchant, date, amountCents: cents });
  const L = '2026-10';
  const rows = [
    // A steady subscription, plus a big one-time charge in the earlier window.
    ...['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'].map((m) => row(`${m}-15`, 2000, 'Acme', 'ACME PLAN')),
    row('2026-05-03', 90_000, 'Acme', 'ACME EXAM'),
  ];
  const a = analyze(rows, '2026-11-09');
  const sums = (keepOneTime: boolean) => {
    const keep = (r: LedgerRow) => keepOneTime || a.typeOf(r).kind !== 'other';
    return {
      last: providerTotals(rowsInMonths(rows, addMonths(L, -2), L).filter(keep)).get('Acme') ?? 0,
      prev: providerTotals(rowsInMonths(rows, addMonths(L, -5), addMonths(L, -3)).filter(keep)).get('Acme') ?? 0,
    };
  };

  it('with the one-time charge the provider looks like it dropped; without it, flat', () => {
    expect(a.typeOf(rows[rows.length - 1]).kind).toBe('other');
    const withIt = sums(true);
    const without = sums(false);
    expect(providerTrend(withIt.last, withIt.prev).direction).toBe('down');
    expect(providerTrend(without.last, without.prev)).toMatchObject({ direction: 'flat', prevCents: 6000, lastCents: 6000 });
  });
});
