import { dataSpan, type DataSpan } from './analytics';
import type { Category } from './categories';
import { addDays, dayOf, daysInMonth, monthOf } from './dates';
import type { TypeInfo } from './overrides';
import type { LedgerRow } from './types';

/*
 * Month-end estimate
 * ------------------
 * Conservative on purpose: a floor, not a forecast.
 *   1. Recorded so far = everything dated in the current month, exactly as recorded.
 *   2. Still to come = only recurring charges with strong evidence that are due later this month: a subscription you
 *      confirmed, or one the pattern rule found (monthly, similar day and amount, 3+ months) whose latest charge was in
 *      the previous month. Each counts at its charge type's last actual charge, never an average. "Later" is counted from
 *      the latest recorded charge, not from today: a charge due after the data ends has not been seen yet, even if its
 *      usual day has passed; one due before the data ends that never arrived is not coming.
 *   3. At least = recorded + still to come.
 * Usage is not projected and not in the headline: what was spent on usage so far is shown on its own line. One-time
 * charges never feed the estimate (they are in "recorded" only because they happened).
 *
 * No estimate is shown when there is no data, or when the latest transaction is more than 45 days old.
 */

export const STALE_AFTER_DAYS = 45;
/** The latest recorded charge is called old, and the card says so, when it is more than this many days before today. */
export const OLD_DATA_DAYS = 7;

/** A recurring charge the app expects later this month, and why it is trusted. */
export interface ExpectedCharge {
  provider: string;
  merchant: string;
  category: Category;
  /** The date it is expected, later this month. */
  date: string;
  /** The charge type's last actual charge. */
  cents: number;
  /** You confirmed it as a subscription. Otherwise the pattern rule found it and its latest charge was last month. */
  confirmed: boolean;
  cadence: 'monthly' | 'yearly';
}

export type Forecast =
  | {
      status: 'ok';
      month: string;
      asOf: string;
      asOfDay: number;
      daysInMonth: number;
      /** The date of the latest recorded charge: "still to come" is counted from here. */
      dataEnd: string;
      /** The latest recorded charge is more than a week old, so the estimate is missing recent statements. */
      dataOld: boolean;
      /** Recorded so far this month. */
      actualCents: number;
      /** Recurring charges with strong evidence that are still due this month. */
      stillToComeCents: number;
      /** Recorded + still to come: the month will cost at least this. */
      atLeastCents: number;
      expected: ExpectedCharge[];
      /** Usage charges so far this month, not projected. Null when the type of each charge is not known. */
      usageSoFarCents: number | null;
    }
  | { status: 'insufficient'; month: string; asOf: string; actualCents: number; reason: string };

/**
 * `span` defaults to the span of `rows`. Pass the whole ledger's span when estimating a subset (one category), so the
 * freshness check is about the data, not the subset. `expected` comes from `analyze`; without it nothing is still to come.
 */
export function forecastCurrentMonth<T extends LedgerRow>(
  rows: T[],
  today: string,
  span: DataSpan | null = dataSpan(rows),
  expected: ExpectedCharge[] = [],
  typeOf?: (row: T) => TypeInfo,
): Forecast {
  // If the data runs past "today" (e.g. a clock mismatch), estimate from the latest record.
  const asOf = span && span.lastDate > today ? span.lastDate : today;
  const month = monthOf(asOf);
  const asOfDay = dayOf(asOf);
  let actualCents = 0;
  let usage = 0;
  for (const r of rows) {
    if (monthOf(r.date) !== month) continue;
    actualCents += r.amountCents;
    if (typeOf && typeOf(r).kind === 'usage') usage += r.amountCents;
  }

  if (!span) {
    return { status: 'insufficient', month, asOf, actualCents, reason: 'There is no recorded spending yet.' };
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

  // Only what is due this month after the latest recorded charge.
  const due = expected
    .filter((e) => monthOf(e.date) === month && e.date > span.lastDate)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : b.cents - a.cents));
  const stillToComeCents = due.reduce((n, e) => n + e.cents, 0);

  return {
    status: 'ok',
    month,
    asOf,
    asOfDay,
    daysInMonth: daysInMonth(month),
    dataEnd: span.lastDate,
    dataOld: addDays(span.lastDate, OLD_DATA_DAYS) < asOf,
    actualCents,
    stillToComeCents,
    atLeastCents: actualCents + stillToComeCents,
    expected: due,
    usageSoFarCents: typeOf ? usage : null,
  };
}
