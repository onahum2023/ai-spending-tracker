import { describe, expect, it } from 'vitest';
import { dayOf } from './dates';
import { analyze, RENEWAL_AMOUNT_TOLERANCE } from './insights';
import { streamKey, type Override } from './overrides';
import type { LedgerRow } from './types';

/*
 * Property: confirming some charge types of a provider as monthly subscriptions never makes the app count less than it already did
 * for a subscription it had found, except by treating a later charge as that subscription's next renewal at a plausible amount.
 * A reviewer kept finding cases where Confirm and automatic detection disagreed, so this generates many ledgers and checks it.
 * Precisely, for every subscription automatic detection finds that is active:
 *   - schedule identity: it is still there, whole, inside an active confirmed one (confirming can add to a schedule, never split
 *     it, drop it or swap its charges), and the confirmed one has no fewer subscriptions than before;
 *   - latest amount and date: the confirmed one's latest charge is not older, and its amount is within the renewal tolerance of the
 *     amount automatic detection had (a renewal at a real price change or discount is accepted; a stray charge a fraction of the
 *     amount does not take its place).
 *   - a genuine return is not lost to a stray: when automatic detection has a stopped pattern of the same charge type, billing day
 *     and amount (and no later pattern of that type picked up at its price: then the pair is one subscription), the return ends up in a
 *     confirmed pattern. (This covers stopped schedules that come back, which the checks above,
 *     about active ones, do not.)
 * A charge a few days from a schedule's billing day, at a plausible amount, in the month after it, cannot be told from a discounted
 * renewal; if it is really another schedule's charge, Confirm will show the lower amount. That is the one case this does not rule out.
 * It is built to bite:
 *   - the ledger is cut at a random charge date and judged just after it, so many subscriptions are active at the time,
 *   - a random subset of the charge types is confirmed (not always all of them),
 *   - billing days are only 2-6 days apart, so schedules sit close together,
 *   - schedules miss months, come back after a gap (with or without their reference) and renew again, get refunds, carry stable or
 *     changing references, sometimes alternate between two descriptions, and have small stray charges around the billing day.
 * It also checks that it is not vacuous: in a good share of the cases the automatic run-rate is above zero.
 */

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const pad = (n: number) => String(n).padStart(2, '0');
const date = (m: number, d: number) => `${2026 + Math.floor(m / 12)}-${pad((m % 12) + 1)}-${pad(d)}`;
const NAMES = ['ACME* PLAN', 'ACME* RENEWAL', 'ACME* SERVICE'];
/** The genuine returns and renewals after a gap, which the generator knows are real (a stray is never one). */
const RETURNS = new WeakSet<LedgerRow>();

function ledger(seed: number): LedgerRow[] {
  const r = rng(seed);
  const rows: LedgerRow[] = [];
  const schedules = 1 + Math.floor(r() * 3);
  const base = 3 + Math.floor(r() * 4);
  for (let k = 0; k < schedules; k++) {
    const day = base + k * (2 + Math.floor(r() * 5));
    const amount = 1000 * (1 + Math.floor(r() * 9));
    const start = Math.floor(r() * 3);
    const length = 3 + Math.floor(r() * 7);
    const ref = r() < 0.5 ? (r() < 0.5 ? `A${k}B9C${k}` : '') : 'CHANGING';
    const nameA = NAMES[Math.floor(r() * 3)];
    const nameB = r() < 0.3 ? NAMES[Math.floor(r() * 3)] : nameA;
    for (let m = start; m < start + length; m++) {
      if (r() < 0.12) continue; // a missed month
      const suffix = ref === 'CHANGING' ? ` R${Math.floor(r() * 90 + 10)}X9Z` : ref ? ` ${ref}` : '';
      rows.push({ provider: 'Acme', merchant: `${m % 2 ? nameB : nameA}${suffix}`, date: date(m, day), amountCents: amount });
    }
    if (r() < 0.3) {
      const back = start + length + 2 + Math.floor(r() * 5);
      // comes back with the reference it had, without one, or under a NEW one (a subscription renewing with a new code)
      const pick = r();
      const backRef = ref && ref !== 'CHANGING' && pick < 0.4 ? ` ${ref}` : pick < 0.7 ? ` N${k}W7Q${Math.floor(r() * 9)}` : '';
      const comeBack: LedgerRow = { provider: 'Acme', merchant: `${nameA}${backRef}`, date: date(back, day), amountCents: amount };
      RETURNS.add(comeBack);
      rows.push(comeBack);
      // a stray with no reference in the same month, a couple of days before the real return
      if (r() < 0.5) rows.push({ provider: 'Acme', merchant: nameA, date: date(back, Math.max(1, day - 2)), amountCents: 300 });
      if (r() < 0.5) rows.push({ provider: 'Acme', merchant: `${nameA}${backRef}`, date: date(back + 1, day), amountCents: r() < 0.5 ? amount : amount + 1000 }); // and renews
    }
    // small stray charges close to the billing day, even before the real renewal in the same month (they can crowd it)
    if (r() < 0.3) {
      const month = start + 1 + Math.floor(r() * length);
      // a flat 3 against schedules of 10 or more: clearly not a renewal (a 4 against a 10 could be a discounted one, and is left to the app)
      rows.push({ provider: 'Acme', merchant: nameA, date: date(month, Math.max(1, day - 2)), amountCents: 300 });
      if (r() < 0.5) rows.push({ provider: 'Acme', merchant: nameA, date: date(month, day + 2), amountCents: 300 });
    }
    if (r() < 0.2) rows.push({ provider: 'Acme', merchant: nameA, date: date(start + 1, day + 1), amountCents: -amount }); // refund
  }
  return rows;
}

describe('confirming never splits, drops or swaps a schedule that is already counted', () => {
  it('holds on 2500 generated ledgers, judged while subscriptions are active, with partial confirms', { timeout: 60000 }, () => {
    const failures: string[] = [];
    let active = 0;
    let judged = 0;
    for (let seed = 1; seed <= 2500; seed++) {
      const r = rng(seed * 7 + 1);
      const full = ledger(seed);
      const dates = [...new Set(full.map((x) => x.date))].sort();
      const cut = dates[Math.floor(r() * dates.length)];
      const rows = [...full.filter((x) => x.date <= cut), { provider: 'Other', merchant: 'OTHER', date: cut, amountCents: 100 }];
      const types = [...new Set(rows.filter((x) => x.provider === 'Acme').map((x) => x.merchant))];
      const chosen = types.filter(() => r() < 0.6);
      if (chosen.length === 0) continue;
      const confirm: Override[] = chosen.map((merchant) => ({ provider: 'Acme', merchant, kind: 'monthly' }));
      const automatic = analyze(rows, cut);
      const confirmedAnalysis = analyze(rows, cut, confirm);
      const auto = automatic.report;
      const confirmed = confirmedAnalysis.report;
      judged++;
      if (auto.monthlyCents > 0) active++;
      if (confirmed.active.length < auto.active.length) failures.push(`seed ${seed}: active ${confirmed.active.length} < ${auto.active.length}`);
      for (const p of automatic.patterns.filter((q) => q.active && q.provider === 'Acme')) {
        const home = confirmedAnalysis.patterns.find((q) => q.active && p.charges.every((x) => q.charges.includes(x)));
        if (!home) {
          failures.push(`seed ${seed}: an active schedule from ${p.firstDate} to ${p.lastDate} was split or dropped`);
          continue;
        }
        const before = p.charges[p.charges.length - 1];
        const after = home.charges[home.charges.length - 1];
        if (after.date < before.date) failures.push(`seed ${seed}: the latest charge went back in time`);
        if (Math.abs(after.amountCents - before.amountCents) > RENEWAL_AMOUNT_TOLERANCE * Math.max(after.amountCents, before.amountCents)) {
          failures.push(`seed ${seed}: the latest amount ${after.amountCents} is not a plausible renewal of ${before.amountCents}`);
        }
      }
      // A genuine return is not lost to a stray: when automatic detection has a stopped pattern of the same charge type, billing day
      // and amount, and the type is confirmed, the return ends up in some confirmed pattern (stopped schedules that come back, which
      // the checks above, about active ones, do not cover).
      const chosenTypes = new Set(chosen.map((m) => streamKey('Acme', m)));
      const placed = new Set(confirmedAnalysis.patterns.flatMap((q) => q.charges));
      for (const ret of rows.filter((x) => RETURNS.has(x) && chosenTypes.has(streamKey('Acme', x.merchant)))) {
        const stopped = automatic.patterns.find(
          (q) =>
            q.provider === 'Acme' &&
            !q.active &&
            q.lastDate < ret.date &&
            Math.abs(dayOf(ret.date) - q.typicalDay) <= 2 &&
            q.charges.some((x) => streamKey('Acme', x.merchant) === streamKey('Acme', ret.merchant)) &&
            q.charges[q.charges.length - 1].amountCents === ret.amountCents,
        );
        // A stopped schedule that a later pattern of the same charge type picked up at the same price is not "waiting to come back":
        // automatic detection counts the pair once (a missed month or a drifted billing day looks like that), and so must Confirm.
        const successor =
          stopped &&
          automatic.patterns.some(
            (q) =>
              q !== stopped &&
              q.provider === 'Acme' &&
              q.firstDate > stopped.lastDate &&
              Math.abs(q.charges[0].amountCents - stopped.charges[stopped.charges.length - 1].amountCents) <= 0.02 * stopped.charges[stopped.charges.length - 1].amountCents &&
              q.charges.some((x) => stopped.charges.some((y) => streamKey('Acme', x.merchant) === streamKey('Acme', y.merchant))),
          );
        if (stopped && !successor && !placed.has(ret)) failures.push(`seed ${seed}: the return ${ret.date} ${ret.amountCents} was left out although its stopped schedule exists`);
      }
    }
    expect(failures).toEqual([]);
    expect(active / judged).toBeGreaterThan(0.3); // not vacuous
  });
});

/*
 * One subscription is one subscription. The ledgers above keep each schedule's billing day fixed; real ones drift (the 5th, then the
 * 7th after a weekend, then the 5th again), skip months and come back. For a single schedule at a single price, Confirm must never
 * count more subscriptions, or a higher run-rate, than automatic detection (a reviewer found one schedule counted twice when one
 * charge landed two days off and the next went back to the usual day).
 */
function drifting(seed: number): LedgerRow[] {
  const r = rng(seed * 31 + 5);
  const day = 4 + Math.floor(r() * 20);
  const amount = 1000 * (1 + Math.floor(r() * 9));
  const ref = r() < 0.5 ? ' ABC123' : '';
  const rows: LedgerRow[] = [];
  const months = 4 + Math.floor(r() * 8);
  for (let m = 0; m < months; m++) {
    if (r() < 0.2) continue; // a missed month
    const drift = r() < 0.35 ? (r() < 0.5 ? -1 : 1) * (1 + Math.floor(r() * 3)) : 0;
    rows.push({ provider: 'Acme', merchant: `ACME* PLAN${ref && r() < 0.8 ? ref : ''}`, date: date(m, day + drift), amountCents: amount });
  }
  return rows;
}

describe('confirming one subscription with drifting billing days', () => {
  it('never counts it twice, on 3000 generated ledgers', () => {
    const failures: string[] = [];
    let counted = 0;
    for (let seed = 1; seed <= 3000; seed++) {
      const full = drifting(seed);
      if (full.length < 3) continue;
      const r = rng(seed);
      const dates = [...new Set(full.map((x) => x.date))].sort();
      const cut = dates[Math.floor(r() * dates.length)];
      const rows = full.filter((x) => x.date <= cut);
      const asOf = date(Number(cut.slice(5, 7)) - 1 + (Number(cut.slice(0, 4)) - 2026) * 12, Math.min(28, Number(cut.slice(8)) + 1));
      const auto = analyze(rows, asOf).report;
      const confirmed = analyze(rows, asOf, [{ provider: 'Acme', merchant: 'ACME* PLAN', kind: 'monthly' }]).report;
      if (auto.active.length > 0) counted++;
      if (confirmed.active.length > Math.max(1, auto.active.length)) failures.push(`seed ${seed}: ${confirmed.active.length} active, automatic ${auto.active.length}`);
      if (auto.monthlyCents > 0 && confirmed.monthlyCents > auto.monthlyCents) failures.push(`seed ${seed}: run-rate ${confirmed.monthlyCents} > ${auto.monthlyCents}`);
    }
    expect(failures).toEqual([]);
    expect(counted).toBeGreaterThan(300);
  });
});

