import { addMonths } from '../lib/dates';

/**
 * The monthly totals behind the sparklines on the Overview's stat tiles. Pure helpers over `totalsByMonth`: a month with no charges
 * counts as zero, and the series starts at the first recorded month (nothing is invented before the data begins).
 */

/** The last `count` monthly totals ending at `endMonth` (YYYY-MM), oldest first, never starting before `firstMonth`. */
export function lastMonths(byMonth: Map<string, number>, endMonth: string, count: number, firstMonth: string): number[] {
  const out: number[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const m = addMonths(endMonth, -i);
    if (m < firstMonth) continue;
    out.push(byMonth.get(m) ?? 0);
  }
  return out;
}

/** Running totals: [1, 2, 3] becomes [1, 3, 6]. */
export function cumulative(values: number[]): number[] {
  let sum = 0;
  return values.map((v) => (sum += v));
}

/** Rolling average over `window` values, starting where a full window exists. */
export function rollingAverage(values: number[], window = 3): number[] {
  const out: number[] = [];
  for (let i = window - 1; i < values.length; i++) {
    let sum = 0;
    for (let j = i - window + 1; j <= i; j++) sum += values[j];
    out.push(sum / window);
  }
  return out;
}

/** A sparkline needs a shape: three points or more, and not a flat line of nothing. Otherwise there is nothing worth drawing. */
export function sparkOrUndefined(values: number[]): number[] | undefined {
  return values.length >= 3 && values.some((v) => v !== values[0]) ? values : undefined;
}
