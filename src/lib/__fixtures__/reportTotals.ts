import type { SubscriptionReport } from '../insights';

/*
 * Totals over a subscription report, for tests. The app no longer shows or stores a run-rate; these re-derive it from the
 * active subscriptions so the tests can keep checking that confirming a charge type never changes what is counted.
 */

/** Sum of each active subscription's monthly amount (a yearly one counts as a twelfth). */
export const monthlyTotal = (r: Pick<SubscriptionReport, 'active'>): number => r.active.reduce((n, s) => n + s.monthlyCents, 0);

/** Sum of each active subscription's yearly amount. */
export const yearlyTotal = (r: Pick<SubscriptionReport, 'active'>): number => r.active.reduce((n, s) => n + s.yearlyCents, 0);

/** Sum of the expected charges in the next 30 days. */
export const upcomingTotal = (r: Pick<SubscriptionReport, 'upcoming'>): number => r.upcoming.reduce((n, u) => n + u.cents, 0);
