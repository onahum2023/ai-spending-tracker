import { describe, expect, it } from 'vitest';
import { evaluateBudgets } from './budgets';
import { forecastCurrentMonth } from './forecast';
import { analyze } from './insights';
import type { LedgerRow } from './types';

const row = (date: string, cents: number, provider = 'Acme', merchant = 'ACME PLAN'): LedgerRow => ({ provider, merchant, date, amountCents: cents });
/** One charge a month on `day`, for the given months. */
const series = (months: string[], day: number, cents: number | number[], provider = 'Acme', merchant = 'ACME PLAN') =>
  months.map((m, i) => row(`${m}-${String(day).padStart(2, '0')}`, Array.isArray(cents) ? cents[i] : cents, provider, merchant));

const JUN_OCT = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
const TODAY = '2026-11-09';

function estimate(rows: LedgerRow[], today = TODAY, overrides: Parameters<typeof analyze>[2] = []) {
  const a = analyze(rows, today, overrides);
  return { a, f: forecastCurrentMonth(rows, today, undefined, a.expected, a.typeOf) };
}

describe('month-end estimate: the floor', () => {
  it('adds a pattern-rule subscription whose latest charge was last month, at its last actual charge, not an average', () => {
    const rows = series(JUN_OCT, 15, [2000, 2000, 2000, 2000, 2400]);
    const { f } = estimate(rows);
    expect(f.status).toBe('ok');
    if (f.status !== 'ok') return;
    expect(f.expected).toHaveLength(1);
    expect(f.expected[0]).toMatchObject({ provider: 'Acme', date: '2026-11-15', cents: 2400, confirmed: false, cadence: 'monthly' });
    expect(f.actualCents).toBe(0);
    expect(f.stillToComeCents).toBe(2400); // 24.00 (the last charge), not the 20.80 average
    expect(f.atLeastCents).toBe(2400);
  });

  it('counts what is recorded as it is, and adds still-to-come on top', () => {
    const rows = [...series(JUN_OCT, 15, 2000), row('2026-11-03', 999, 'Other', 'OTHER ONE')];
    const { f } = estimate(rows);
    if (f.status !== 'ok') throw new Error('expected an estimate');
    expect(f.actualCents).toBe(999);
    expect(f.atLeastCents).toBe(999 + 2000);
  });

  it('does not add a charge that already landed this month', () => {
    const rows = [...series(JUN_OCT, 5, 2000), row('2026-11-05', 2000)];
    const { f } = estimate(rows);
    if (f.status !== 'ok') throw new Error('expected an estimate');
    expect(f.expected).toEqual([]);
    expect(f.atLeastCents).toBe(2000);
  });

  it('does not add a charge whose day has already passed without it appearing', () => {
    const { f } = estimate(series(JUN_OCT, 5, 2000)); // due Nov 5, today is Nov 9
    if (f.status !== 'ok') throw new Error('expected an estimate');
    expect(f.expected).toEqual([]);
  });

  it('does not add a pattern whose latest charge is older than last month, unless you confirmed it', () => {
    // Last charge Sep 28: still within its grace on Nov 3, but not "last month".
    const rows = series(['2026-06', '2026-07', '2026-08', '2026-09'], 28, 2000);
    const today = '2026-11-03';
    const unconfirmed = estimate(rows, today);
    expect(unconfirmed.a.report.active).toHaveLength(1);
    expect(unconfirmed.a.expected).toEqual([]);
    const confirmed = estimate(rows, today, [{ provider: 'Acme', merchant: 'ACME PLAN', kind: 'monthly' }]);
    expect(confirmed.a.expected).toMatchObject([{ date: '2026-11-28', cents: 2000, confirmed: true }]);
  });

  it('adds a charge you confirmed even when detection would not find it', () => {
    const rows = [row('2026-09-14', 1500, 'Acme', 'ACME'), row('2026-10-30', 1500, 'Acme', 'ACME')];
    expect(estimate(rows, '2026-11-05').a.expected).toEqual([]);
    const { f } = estimate(rows, '2026-11-05', [{ provider: 'Acme', merchant: 'ACME', kind: 'monthly' }]);
    if (f.status !== 'ok') throw new Error('expected an estimate');
    expect(f.expected).toMatchObject([{ provider: 'Acme', date: '2026-11-30', cents: 1500, confirmed: true }]);
    expect(f.atLeastCents).toBe(1500);
  });

  it('adds a confirmed yearly renewal due later this month, at its last charge', () => {
    const rows = [row('2025-11-20', 12000, 'Acme', 'ACME YEARLY'), row('2026-11-02', 500, 'Other', 'OTHER ONE')];
    const { f } = estimate(rows, '2026-11-09', [{ provider: 'Acme', merchant: 'ACME YEARLY', kind: 'yearly' }]);
    if (f.status !== 'ok') throw new Error('expected an estimate');
    expect(f.expected).toMatchObject([{ date: '2026-11-20', cents: 12000, confirmed: true, cadence: 'yearly' }]);
  });

  it('ignores a new price seen only once or twice (not yet a confirmed pattern)', () => {
    const rows = [...series(['2026-04', '2026-05', '2026-06', '2026-07'], 12, 2000), ...series(['2026-09', '2026-10'], 12, 4000)];
    const { a } = estimate(rows, '2026-11-09');
    expect(a.report.active.some((s) => s.pattern.provisional)).toBe(true);
    expect(a.expected).toEqual([]);
  });

  it('leaves out a stream you set to one-time or usage', () => {
    const rows = series(JUN_OCT, 15, 2000);
    expect(estimate(rows, TODAY, [{ provider: 'Acme', merchant: 'ACME PLAN', kind: 'other' }]).a.expected).toEqual([]);
    expect(estimate(rows, TODAY, [{ provider: 'Acme', merchant: 'ACME PLAN', kind: 'usage' }]).a.expected).toEqual([]);
  });
});

describe('month-end estimate: usage and one-time', () => {
  // Usage: the same descriptor charged 3+ times, no monthly rhythm.
  const usage = [
    row('2026-08-02', 700, 'Apico', 'APICO CREDITS'),
    row('2026-09-19', 1300, 'Apico', 'APICO CREDITS'),
    row('2026-10-07', 900, 'Apico', 'APICO CREDITS'),
    row('2026-11-02', 1100, 'Apico', 'APICO CREDITS'),
    row('2026-11-06', 400, 'Apico', 'APICO CREDITS'),
  ];

  it('shows usage so far on its own line and does not project it', () => {
    const rows = [...series(JUN_OCT, 15, 2000), ...usage];
    const { a, f } = estimate(rows);
    if (f.status !== 'ok') throw new Error('expected an estimate');
    expect(a.typeOf(usage[0]).kind).toBe('usage');
    expect(f.usageSoFarCents).toBe(1500);
    expect(f.actualCents).toBe(1500); // recorded still includes it
    expect(f.stillToComeCents).toBe(2000); // only the subscription is still to come
    expect(f.atLeastCents).toBe(1500 + 2000);
    // Past usage months do not change what is still to come.
    const lighter = estimate([...series(JUN_OCT, 15, 2000), ...usage.slice(3)]).f;
    if (lighter.status !== 'ok') throw new Error('expected an estimate');
    expect(lighter.stillToComeCents).toBe(2000);
  });

  it('leaves usage out when the type of each charge is not known', () => {
    const f = forecastCurrentMonth(usage, TODAY);
    if (f.status !== 'ok') throw new Error('expected an estimate');
    expect(f.usageSoFarCents).toBeNull();
  });

  it('never lets one-time charges feed what is still to come, however large or recent', () => {
    const base = series(JUN_OCT, 15, 2000);
    const oneTime = [row('2026-10-20', 90000, 'Course', 'COURSE FEE'), row('2026-09-02', 45000, 'Cert', 'CERT EXAM')];
    const without = estimate(base).f;
    const withOne = estimate([...base, ...oneTime]).f;
    if (without.status !== 'ok' || withOne.status !== 'ok') throw new Error('expected estimates');
    expect(withOne.stillToComeCents).toBe(without.stillToComeCents);
    expect(withOne.expected).toEqual(without.expected);
  });

  it('counts a one-time charge in recorded when it happens this month, but never in usage or still-to-come', () => {
    const rows = [...series(JUN_OCT, 15, 2000), row('2026-11-04', 11505, 'Anthropic', 'ANTHROPIC ONE OFF')];
    const { f } = estimate(rows);
    if (f.status !== 'ok') throw new Error('expected an estimate');
    expect(f.actualCents).toBe(11505);
    expect(f.usageSoFarCents).toBe(0);
    expect(f.stillToComeCents).toBe(2000);
  });
});

describe('month-end estimate: when there is none', () => {
  it('declines with no data, and when the latest transaction is more than 45 days old', () => {
    expect(forecastCurrentMonth([], TODAY).status).toBe('insufficient');
    const stale = forecastCurrentMonth(series(JUN_OCT, 15, 2000), '2027-01-20');
    expect(stale.status).toBe('insufficient');
    if (stale.status === 'insufficient') expect(stale.reason).toMatch(/45 days/);
  });

  it('is deterministic', () => {
    const rows = series(JUN_OCT, 15, 2000);
    expect(estimate(rows).f).toEqual(estimate(rows).f);
  });

  it('only counts charges due later this month, whatever it is given', () => {
    const f = forecastCurrentMonth([row('2026-10-15', 2000)], TODAY, undefined, [
      { provider: 'Acme', merchant: 'ACME PLAN', category: 'chat', date: '2026-11-08', cents: 500, confirmed: true, cadence: 'monthly' },
      { provider: 'Acme', merchant: 'ACME PLAN', category: 'chat', date: '2026-12-02', cents: 700, confirmed: true, cadence: 'monthly' },
      { provider: 'Acme', merchant: 'ACME PLAN', category: 'chat', date: '2026-11-20', cents: 900, confirmed: true, cadence: 'monthly' },
    ]);
    if (f.status !== 'ok') throw new Error('expected an estimate');
    expect(f.stillToComeCents).toBe(900);
  });
});

describe('budgets use the floor', () => {
  it('evaluates a category budget against that category, with only its own still-due charges', () => {
    const rows = [
      ...series(JUN_OCT, 15, 2000, 'Chatco', 'CHATCO PLAN'), // chat
      ...series(JUN_OCT, 20, 3000, 'Hostco', 'HOSTCO PLAN'),
    ];
    const a = analyze(rows, TODAY, [], [
      { provider: 'Chatco', category: 'chat' },
      { provider: 'Hostco', category: 'hosting' },
    ]);
    const cat = (name: string) => a.expected.find((e) => e.provider === name)!.category;
    expect(cat('Chatco')).not.toBe(cat('Hostco'));
    const rep = evaluateBudgets(rows, { totalCents: 4900, byCategory: { [cat('Chatco')]: 1500 } }, TODAY, a.categoryOf, a.expected, a.typeOf);
    const total = rep.lines.find((l) => l.key === 'total')!;
    const chat = rep.lines.find((l) => l.key === cat('Chatco'))!;
    expect(total.atLeastCents).toBe(5000);
    expect(total.status).toBe('at-risk');
    expect(chat.atLeastCents).toBe(2000);
    expect(chat.summary).toBe('Expected to exceed by at least €5.00');
  });
});
