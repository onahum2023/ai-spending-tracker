import { describe, expect, it } from 'vitest';
import { monthDrillDown } from './analytics';
import { commitmentOf, splitByCommitment } from './commitment';
import { analyze } from './insights';
import type { LedgerRow } from './types';

const row = (date: string, cents: number, provider: string, merchant: string): LedgerRow => ({ provider, merchant, date, amountCents: cents });

describe('commitment of a type', () => {
  it('reads subscriptions and usage as they are, and one-time only when you said so', () => {
    expect(commitmentOf({ kind: 'subscription', cadence: 'monthly', source: 'pattern' })).toBe('subscription');
    expect(commitmentOf({ kind: 'subscription', cadence: 'monthly', source: 'you' })).toBe('subscription');
    expect(commitmentOf({ kind: 'usage', source: 'repeats' })).toBe('usage');
    expect(commitmentOf({ kind: 'other', source: 'you' })).toBe('oneTime');
    // A guess is never one-time.
    expect(commitmentOf({ kind: 'other', source: 'single' })).toBe('unclassified');
    expect(commitmentOf({ kind: 'other', source: 'import' })).toBe('unclassified');
  });
});

describe('commitment split of a month', () => {
  const sub = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10'].map((m) => row(`${m}-15`, 2000, 'Acme', 'ACME PLAN'));
  const usage = [
    row('2026-08-02', 700, 'Apico', 'APICO CREDITS'),
    row('2026-09-19', 1300, 'Apico', 'APICO CREDITS'),
    row('2026-10-07', 900, 'Apico', 'APICO CREDITS'),
    row('2026-10-20', 400, 'Apico', 'APICO CREDITS'),
  ];
  const oneTimeConfirmed = row('2026-10-04', 11505, 'Cert', 'CERT EXAM');
  const guessed = row('2026-10-09', 3000, 'Gamma', 'GAMMA ONCE'); // a single charge nobody classified
  const refund = row('2026-10-11', -500, 'Acme', 'ACME REFUND');
  const rows = [...sub, ...usage, oneTimeConfirmed, guessed, refund];
  const a = analyze(rows, '2026-11-09', [{ provider: 'Cert', merchant: 'CERT EXAM', kind: 'other' }]);
  const october = monthDrillDown(rows, '2026-10');
  const split = splitByCommitment(october, a.typeOf);
  const of = (c: string) => split.lines.find((l) => l.commitment === c)!;

  it('puts every charge in exactly one line, so the lines add up to the month total', () => {
    expect(split.lines.map((l) => l.commitment)).toEqual(['subscription', 'usage', 'oneTime', 'unclassified']);
    expect(split.lines.reduce((n, l) => n + l.cents, 0)).toBe(split.totalCents);
    expect(split.lines.reduce((n, l) => n + l.count, 0)).toBe(october.length);
    expect(split.totalCents).toBe(october.reduce((n, r) => n + r.amountCents, 0));
  });

  it('counts the subscription, the usage, the confirmed one-time and the rest separately', () => {
    expect(of('subscription')).toMatchObject({ cents: 2000, count: 1 });
    expect(of('usage')).toMatchObject({ cents: 1300, count: 2 });
    expect(of('oneTime')).toMatchObject({ cents: 11505, count: 1 });
    // A single unclassified charge and a refund: never reported as one-time.
    expect(of('unclassified')).toMatchObject({ cents: 3000 - 500, count: 2 });
  });

  it('shows shares of the total', () => {
    const total = 2000 + 1300 + 11505 + 3000 - 500;
    expect(split.totalCents).toBe(total);
    expect(of('oneTime').share).toBeCloseTo(11505 / total, 10);
    expect(split.lines.reduce((n, l) => n + (l.share ?? 0), 0)).toBeCloseTo(1, 10);
  });

  it('does not call a guess one-time: without your confirmation it moves to unclassified', () => {
    const unconfirmed = analyze(rows, '2026-11-09');
    const s = splitByCommitment(october, unconfirmed.typeOf);
    expect(s.lines.find((l) => l.commitment === 'oneTime')).toMatchObject({ cents: 0, count: 0 });
    expect(s.lines.find((l) => l.commitment === 'unclassified')!.cents).toBe(11505 + 3000 - 500);
  });

  it('has no share when there is nothing to share', () => {
    expect(splitByCommitment([], a.typeOf)).toMatchObject({ totalCents: 0, lines: [{ share: null }, { share: null }, { share: null }, { share: null }] });
  });

  it('lets the drill-down filter to one of the lines', () => {
    const onlyUsage = monthDrillDown(rows, '2026-10', undefined, (r) => commitmentOf(a.typeOf(r)) === 'usage');
    expect(onlyUsage.map((r) => r.amountCents)).toEqual([900, 400]);
    expect(onlyUsage.reduce((n, r) => n + r.amountCents, 0)).toBe(of('usage').cents);
  });
});
