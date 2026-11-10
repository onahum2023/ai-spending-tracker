import { describe, expect, it } from 'vitest';
import { analyze } from './insights';
import type { Override } from './overrides';
import type { LedgerRow } from './types';

/*
 * Property: confirming every charge type of a provider as a monthly subscription never lowers what the app already counts.
 * A reviewer kept finding cases where Confirm and automatic detection disagreed (concurrent plans, a plan that came back, refunds,
 * a description that alternates between two charge types), so this generates many ledgers with several schedules, missed months,
 * returns after a gap, refunds, stable and changing references, and alternating descriptions, and checks the invariant on all of them.
 */

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const pad = (n: number) => String(n).padStart(2, '0');
const date = (m: number, d: number) => `${2026 + Math.floor(m / 12)}-${pad((m % 12) + 1)}-${pad(d)}`;

function ledger(seed: number): LedgerRow[] {
  const r = rng(seed);
  const rows: LedgerRow[] = [];
  const names = ['ACME* PLAN', 'ACME* RENEWAL'];
  const schedules = 1 + Math.floor(r() * 3);
  for (let k = 0; k < schedules; k++) {
    const day = 3 + k * 9 + Math.floor(r() * 3);
    const amount = 1000 * (1 + Math.floor(r() * 9));
    const start = Math.floor(r() * 3);
    const length = 3 + Math.floor(r() * 6);
    const ref = r() < 0.5 ? (r() < 0.5 ? `A${k}B9C${k}` : '') : 'CHANGING';
    const alternate = r() < 0.3;
    for (let m = start; m < start + length; m++) {
      if (r() < 0.12) continue; // a missed month
      const suffix = ref === 'CHANGING' ? ` R${Math.floor(r() * 90 + 10)}X9Z` : ref ? ` ${ref}` : '';
      rows.push({ provider: 'Acme', merchant: `${alternate ? names[m % 2] : names[0]}${suffix}`, date: date(m, day), amountCents: amount });
    }
    if (r() < 0.3) rows.push({ provider: 'Acme', merchant: `${names[0]}${ref && ref !== 'CHANGING' ? ` ${ref}` : ''}`, date: date(start + length + 3, day), amountCents: amount }); // comes back
    if (r() < 0.2) rows.push({ provider: 'Acme', merchant: names[0], date: date(start + 1, day + 1), amountCents: -amount }); // refund
  }
  rows.push({ provider: 'Other', merchant: 'OTHER', date: date(12, 1), amountCents: 100 });
  return rows;
}

describe('confirming never lowers what is already counted', () => {
  it('holds on 1500 generated ledgers', () => {
    const lower: string[] = [];
    for (let seed = 1; seed <= 1500; seed++) {
      const rows = ledger(seed);
      const types = [...new Set(rows.filter((x) => x.provider === 'Acme').map((x) => x.merchant))];
      const confirmAll: Override[] = types.map((merchant) => ({ provider: 'Acme', merchant, kind: 'monthly' }));
      const auto = analyze(rows, date(12, 2)).report.monthlyCents;
      const confirmed = analyze(rows, date(12, 2), confirmAll).report.monthlyCents;
      if (confirmed < auto) lower.push(`seed ${seed}: ${confirmed} < ${auto}`);
    }
    expect(lower).toEqual([]);
  });
});
