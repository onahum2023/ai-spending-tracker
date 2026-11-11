import { describe, expect, it } from 'vitest';
import { analyze } from './insights';
import { sumCents } from './money';
import { describeOneTime, oneTimeNote } from './oneTime';
import type { LedgerRow } from './types';

const row = (date: string, cents: number, provider: string, merchant: string): LedgerRow => ({ provider, merchant, date, amountCents: cents });
const kindOf = (kind: 'other' | 'subscription' | 'usage') => () => ({ kind });

describe('one-time charges in a comparison', () => {
  const cur = [row('2026-11-04', 11505, 'Anthropic', 'EXAM'), row('2026-11-06', 2000, 'Acme', 'ACME')];
  const earlier = [row('2026-10-06', 2000, 'Acme', 'ACME'), row('2026-10-07', 5000, 'Acme', 'ACME USAGE')];
  const typeOf = (r: LedgerRow) => ({ kind: (r.merchant === 'EXAM' ? 'other' : r.merchant === 'ACME USAGE' ? 'usage' : 'subscription') as 'other' | 'usage' | 'subscription' });

  it('is null when neither period has one: no change to the card', () => {
    expect(oneTimeNote(earlier, earlier, typeOf, sumCents)).toBeNull();
    expect(oneTimeNote([], [], typeOf, sumCents)).toBeNull();
  });

  it('names the one-time amount and provider, and the comparison without it', () => {
    const n = oneTimeNote(cur, earlier, typeOf, sumCents)!;
    // With it: 13505 vs 7000 = +6505. Without it: 2000 vs 7000 = -5000.
    expect(n).toMatchObject({ currentCents: 11505, currentProviders: ['Anthropic'], earlierCents: 0, withoutCents: -5000 });
    expect(describeOneTime(n)).toBe('Includes one-time €115.05 (Anthropic). Without it: −€50.00');
  });

  it('handles a one-time charge in the earlier period, and in both', () => {
    const n = oneTimeNote(earlier, cur, typeOf, sumCents)!;
    expect(n.earlierCents).toBe(11505);
    expect(describeOneTime(n)).toBe('The other period includes one-time €115.05 (Anthropic). Without it: +€50.00');
    const both = oneTimeNote(cur, [...earlier, row('2026-10-09', 3000, 'Namecheap', 'EXAM')], typeOf, sumCents)!;
    expect(describeOneTime(both)).toBe('Includes one-time €115.05 (Anthropic); the other period €30.00 (Namecheap). Without them: −€50.00');
  });

  it('shortens a long list of providers', () => {
    const many = ['A', 'B', 'C', 'D'].map((p, i) => row('2026-11-0' + (i + 1), 1000 + i, p, 'EXAM'));
    const n = oneTimeNote(many, [], typeOf, sumCents)!;
    expect(describeOneTime(n)).toMatch(/\(D, C and 2 more\)/);
  });

  it('does not treat refunds or usage as one-time', () => {
    const rows = [row('2026-11-04', -500, 'Anthropic', 'EXAM'), row('2026-11-05', 700, 'Acme', 'ACME USAGE')];
    expect(oneTimeNote(rows, [], typeOf, sumCents)).toBeNull();
    expect(oneTimeNote(rows, [], kindOf('usage'), sumCents)).toBeNull();
  });

  it('reads types from analyze: a charge type you set to one-time counts', () => {
    const rows = [
      ...['2026-06', '2026-07', '2026-08', '2026-09', '2026-10'].map((m) => row(`${m}-15`, 2000, 'Acme', 'ACME PLAN')),
      row('2026-11-04', 9000, 'Cert', 'CERT EXAM'),
    ];
    const a = analyze(rows, '2026-11-09');
    const n = oneTimeNote(rows.filter((r) => r.date.startsWith('2026-11')), rows.filter((r) => r.date.startsWith('2026-10')), a.typeOf, sumCents)!;
    expect(n.currentProviders).toEqual(['Cert']); // a single charge reads as one-time
    expect(n.withoutCents).toBe(0 - 2000);
  });
});
