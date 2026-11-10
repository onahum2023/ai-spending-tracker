import { describe, expect, it } from 'vitest';
import { analyze } from './insights';
import type { Override } from './overrides';
import type { LedgerRow } from './types';

/*
 * Property: confirming some charge types of a provider as monthly subscriptions never lowers what the app already counts, in
 * money or in the number of active subscriptions. A reviewer kept finding cases where Confirm and automatic detection disagreed,
 * so this generates many ledgers and checks it. It is built to bite:
 *   - the ledger is cut at a random charge date and judged just after it, so many subscriptions are active at the time,
 *   - a random subset of the charge types is confirmed (not always all of them),
 *   - billing days are only 2-6 days apart, so schedules sit close together,
 *   - schedules miss months, come back after a gap, get refunds, carry stable or changing references, and sometimes alternate
 *     between two descriptions.
 * It also checks that it is not vacuous: in a good share of the cases the automatic run-rate is above zero.
 */

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const pad = (n: number) => String(n).padStart(2, '0');
const date = (m: number, d: number) => `${2026 + Math.floor(m / 12)}-${pad((m % 12) + 1)}-${pad(d)}`;
const NAMES = ['ACME* PLAN', 'ACME* RENEWAL', 'ACME* SERVICE'];

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
      rows.push({ provider: 'Acme', merchant: `${nameA}${ref && ref !== 'CHANGING' ? ` ${ref}` : ''}`, date: date(back, day), amountCents: amount }); // comes back
    }
    if (r() < 0.2) rows.push({ provider: 'Acme', merchant: nameA, date: date(start + 1, day + 1), amountCents: -amount }); // refund
  }
  return rows;
}

describe('confirming never lowers what is already counted', () => {
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
      const auto = analyze(rows, cut).report;
      const confirmed = analyze(rows, cut, confirm).report;
      judged++;
      if (auto.monthlyCents > 0) active++;
      if (confirmed.monthlyCents < auto.monthlyCents) failures.push(`seed ${seed}: run-rate ${confirmed.monthlyCents} < ${auto.monthlyCents}`);
      if (confirmed.active.length < auto.active.length) failures.push(`seed ${seed}: active ${confirmed.active.length} < ${auto.active.length}`);
    }
    expect(failures).toEqual([]);
    expect(active / judged).toBeGreaterThan(0.3); // not vacuous
  });
});
