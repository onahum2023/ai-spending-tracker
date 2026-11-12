import { describe, expect, it } from 'vitest';
import { sparklinePath, sparklinePoints } from './sparkline';

describe('sparkline', () => {
  it('puts the lowest value at the bottom, the highest at the top, and spreads them across the width', () => {
    expect(sparklinePoints([1, 3, 2], 100, 20, 2)).toEqual([[0, 18], [50, 2], [100, 10]]);
  });
  it('draws a flat series in the middle and nothing for fewer than two values', () => {
    expect(sparklinePoints([5, 5, 5], 60, 20).map((p) => p[1])).toEqual([10, 10, 10]);
    expect(sparklinePath([], 60, 20)).toBe('');
    expect(sparklinePath([4], 60, 20)).toBe('');
  });
  it('builds a path', () => {
    expect(sparklinePath([1, 2], 10, 10, 0)).toBe('M0.0 10.0 L10.0 0.0');
  });
});
