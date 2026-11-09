import { dataSpan, type DataSpan } from './analytics';
import { addDays, addMonths, dayOf, daysInMonth, monthOf } from './dates';
import { medianCents } from './money';
import { detectRecurring, type RecurringPattern } from './recurring';
import type { LedgerRow } from './types';

/*
 * Current-month estimate
 * ----------------------
 * Plain, deterministic, explainable:
 *   1. Actual = everything recorded so far in the current month.
 *   2. For each of the 3 previous full months, add up what was spent AFTER
 *      today's day of the month (e.g. on the 10th–31st if today is the 9th).
 *   3. Estimated additional = the median of those three amounts.
 *      Low / high = the smallest and largest of the three.
 *   4. Projected month-end total = actual + estimated additional.
 *
 * No forecast is shown when there is less than 3 months of history before the
 * current month, or when the latest transaction is more than 45 days old.
 */

export const LOOKBACK_MONTHS = 3;
export const STALE_AFTER_DAYS = 45;

export interface ForecastSample {
  month: string;
  /** Spent after the as-of day in that month. */
  remainingCents: number;
  fullMonthCents: number;
}

export type Forecast =
  | {
      status: 'ok';
      month: string;
      asOf: string;
      asOfDay: number;
      daysInMonth: number;
      actualCents: number;
      estimatedAdditionalCents: number;
      projectedCents: number;
      lowCents: number;
      highCents: number;
      samples: ForecastSample[];
      /** Active recurring-looking patterns usually charged later this month. */
      upcoming: RecurringPattern[];
    }
  | { status: 'insufficient'; month: string; asOf: string; actualCents: number; reason: string };

/**
 * `span` defaults to the span of `rows`. Pass the whole ledger's span when forecasting a
 * subset (one category), so the history and freshness checks are about the data, not the subset.
 */
export function forecastCurrentMonth(
  rows: LedgerRow[],
  today: string,
  span: DataSpan | null = dataSpan(rows),
  /** Patterns to list as "usually charged later this month". Defaults to automatic detection on `rows`. */
  patterns?: RecurringPattern[],
): Forecast {
  // If the data runs past "today" (e.g. a clock mismatch), forecast from the latest record.
  const asOf = span && span.lastDate > today ? span.lastDate : today;
  const month = monthOf(asOf);
  const asOfDay = dayOf(asOf);
  let actualCents = 0;
  for (const r of rows) if (monthOf(r.date) === month) actualCents += r.amountCents;

  if (!span) {
    return { status: 'insufficient', month, asOf, actualCents, reason: 'There is no recorded spending yet.' };
  }
  const firstLookback = addMonths(month, -LOOKBACK_MONTHS);
  if (span.firstMonth > firstLookback) {
    return {
      status: 'insufficient',
      month,
      asOf,
      actualCents,
      reason: `An estimate needs at least ${LOOKBACK_MONTHS} full months of history before this month.`,
    };
  }
  if (addDays(span.lastDate, STALE_AFTER_DAYS) < asOf) {
    return {
      status: 'insufficient',
      month,
      asOf,
      actualCents,
      reason: `The latest recorded transaction is more than ${STALE_AFTER_DAYS} days old, so an estimate for this month would be guesswork. Import recent transactions to enable it.`,
    };
  }

  const samples: ForecastSample[] = [];
  for (let i = LOOKBACK_MONTHS; i >= 1; i--) {
    const m = addMonths(month, -i);
    let remainingCents = 0;
    let fullMonthCents = 0;
    for (const r of rows) {
      if (monthOf(r.date) !== m) continue;
      fullMonthCents += r.amountCents;
      if (dayOf(r.date) > asOfDay) remainingCents += r.amountCents;
    }
    samples.push({ month: m, remainingCents, fullMonthCents });
  }

  const dim = daysInMonth(month);
  const remaining = samples.map((s) => s.remainingCents);
  const monthOver = asOfDay >= dim;
  const estimatedAdditionalCents = monthOver ? 0 : medianCents(remaining);
  const lowCents = monthOver ? 0 : Math.min(...remaining);
  const highCents = monthOver ? 0 : Math.max(...remaining);

  const upcoming = (patterns ?? detectRecurring(rows, span.lastDate)).filter((p) => {
    if (!p.active) return false;
    // Expected later this month: next expected date falls in this month after the as-of day.
    return monthOf(p.nextExpected) === month && p.nextExpected > asOf;
  });

  return {
    status: 'ok',
    month,
    asOf,
    asOfDay,
    daysInMonth: dim,
    actualCents,
    estimatedAdditionalCents,
    projectedCents: actualCents + estimatedAdditionalCents,
    lowCents: actualCents + lowCents,
    highCents: actualCents + highCents,
    samples,
    upcoming,
  };
}
