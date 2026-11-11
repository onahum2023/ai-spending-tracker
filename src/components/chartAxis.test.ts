import { describe, expect, it } from 'vitest';
import { niceAxis } from './chartAxis';

describe('niceAxis', () => {
  it('ends just above the tallest bar, not a step too high', () => {
    expect(niceAxis(420).max).toBe(500); // not 600
    expect(niceAxis(601.92 + 0).max).toBe(700);
    expect(niceAxis(458.38).max).toBe(500);
  });
  it('leaves room above a bar that sits exactly on a gridline, for its label', () => {
    expect(niceAxis(500).max).toBeGreaterThan(500);
  });
  it('starts at zero, with evenly spaced ticks and at most eight of them', () => {
    for (const peak of [12, 87, 233.92, 420, 1999, 5400, 23000]) {
      const { max, ticks } = niceAxis(peak);
      expect(ticks[0]).toBe(0);
      expect(ticks[ticks.length - 1]).toBe(max);
      expect(max).toBeGreaterThan(peak);
      expect(ticks.length).toBeLessThanOrEqual(9);
      const step = ticks[1] - ticks[0];
      ticks.forEach((t, i) => expect(t).toBeCloseTo(i * step, 6));
    }
  });
  it('copes with no spending', () => {
    expect(niceAxis(0).max).toBe(100);
  });
});
