import { describe, expect, it } from 'vitest';
import { analyze } from './insights';
import { sumCents } from './money';
import { describeOneTime, describeOneTimeInList, formatSignedNoBreak, oneTimeNote } from './oneTime';
import type { LedgerRow } from './types';

const row = (date: string, cents: number, provider: string, merchant: string): LedgerRow => ({ provider, merchant, date, amountCents: cents });
const kindOf = (kind: 'other' | 'subscription' | 'usage') => () => ({ kind, source: 'you' as const });

describe('one-time charges in a comparison', () => {
  const cur = [row('2026-11-04', 11505, 'Anthropic', 'EXAM'), row('2026-11-06', 2000, 'Acme', 'ACME')];
  const earlier = [row('2026-10-06', 2000, 'Acme', 'ACME'), row('2026-10-07', 5000, 'Acme', 'ACME USAGE')];
  const typeOf = (r: LedgerRow) => ({ kind: (r.merchant === 'EXAM' ? 'other' : r.merchant === 'ACME USAGE' ? 'usage' : 'subscription') as 'other' | 'usage' | 'subscription', source: 'you' as const });

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

  it('counts only one-time types you confirmed, never a suggestion', () => {
    const rows = [
      ...['2026-06', '2026-07', '2026-08', '2026-09', '2026-10'].map((m) => row(`${m}-15`, 2000, 'Acme', 'ACME PLAN')),
      row('2026-11-04', 9000, 'Cert', 'CERT EXAM'), // a single charge: the app only suspects it is one-time
    ];
    const cur = rows.filter((r) => r.date.startsWith('2026-11'));
    const earlier = rows.filter((r) => r.date.startsWith('2026-10'));
    const guessed = analyze(rows, '2026-11-09');
    expect(guessed.typeOf(rows[rows.length - 1])).toMatchObject({ kind: 'other', source: 'single' });
    expect(oneTimeNote(cur, earlier, guessed.typeOf, sumCents)).toBeNull();
    // Confirmed by you, the same charge counts.
    const confirmed = analyze(rows, '2026-11-09', [{ provider: 'Cert', merchant: 'CERT EXAM', kind: 'other' }]);
    const n = oneTimeNote(cur, earlier, confirmed.typeOf, sumCents)!;
    expect(n.currentProviders).toEqual(['Cert']);
    expect(n.withoutCents).toBe(0 - 2000);
  });

  it('does not count a one-time type that came from an import file or a pattern read, only your own setting', () => {
    const imported = { ...row('2026-11-04', 9000, 'Cert', 'CERT EXAM'), type: 'certification' as const };
    const a = analyze([imported], '2026-11-09');
    expect(a.typeOf(imported)).toMatchObject({ kind: 'other', source: 'import' });
    expect(oneTimeNote([imported], [], a.typeOf, sumCents)).toBeNull();
  });
});

describe('the one line on a comparison card', () => {
  const row = (date: string, cents: number, provider: string, merchant: string): LedgerRow => ({ provider, merchant, date, amountCents: cents });
  const typeOf = (r: LedgerRow) => ({ kind: (r.merchant === 'EXAM' ? 'other' : 'subscription') as 'other' | 'subscription', source: 'you' as const });
  const n = oneTimeNote([row('2026-11-04', 2005, 'Namecheap', 'EXAM'), row('2026-11-06', 2000, 'Acme', 'ACME')], [row('2026-10-06', 4650, 'Acme', 'ACME')], typeOf, sumCents)!;

  it('gives the amount without the one-time charges, for the card; the detail is not part of it', () => {
    // 4005 - 2005 = 2000 against 4650: -26.50
    expect(n.withoutCents).toBe(-2650);
    expect(formatSignedNoBreak(n.withoutCents).replace('\u2060', '')).toBe('−€26.50');
  });

  it('joins the real minus sign to the amount with a word joiner, so it cannot wrap', () => {
    const s = formatSignedNoBreak(-2645);
    expect(s).toBe('−\u2060€26.45');
    expect(s[0]).toBe('\u2212'); // a real minus, not a hyphen
    expect(formatSignedNoBreak(2645)).toBe('+\u2060€26.45');
    expect(formatSignedNoBreak(0)).toBe('€0.00');
  });

  it('keeps the detail for a tooltip and for the drill-down', () => {
    expect(describeOneTime(n)).toBe('Includes one-time €20.05 (Namecheap). Without it: −€26.50');
    expect(describeOneTimeInList(n)).toBe('Includes one-time €20.05 (Namecheap)');
  });
});
