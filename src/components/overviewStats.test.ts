import { describe, expect, it } from 'vitest';
import { cumulative, lastMonths, rollingAverage, sparkOrUndefined } from './overviewStats';

const totals = new Map([['2026-01', 100], ['2026-02', 200], ['2026-04', 400], ['2026-05', 500]]);

describe('overview stats', () => {
  it('takes the last N monthly totals, counting a month without charges as zero', () => {
    expect(lastMonths(totals, '2026-05', 4, '2026-01')).toEqual([200, 0, 400, 500]);
  });
  it('does not reach back before the first recorded month', () => {
    expect(lastMonths(totals, '2026-02', 12, '2026-01')).toEqual([100, 200]);
  });
  it('crosses a year boundary', () => {
    expect(lastMonths(new Map([['2025-12', 7], ['2026-01', 9]]), '2026-01', 3, '2025-11')).toEqual([0, 7, 9]);
  });
  it('builds running totals and rolling averages', () => {
    expect(cumulative([1, 2, 3])).toEqual([1, 3, 6]);
    expect(rollingAverage([3, 6, 9, 12], 3)).toEqual([6, 9]);
    expect(rollingAverage([1, 2], 3)).toEqual([]);
  });
  it('draws a sparkline only when it has a shape', () => {
    expect(sparkOrUndefined([1, 2])).toBeUndefined();
    expect(sparkOrUndefined([5, 5, 5])).toBeUndefined();
    expect(sparkOrUndefined([1, 2, 3])).toEqual([1, 2, 3]);
  });
});
