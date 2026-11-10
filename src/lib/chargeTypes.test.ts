import { describe, expect, it } from 'vitest';
import { cleanDescriptor, normalizeDescriptor } from './chargeTypes';
import { analyze } from './insights';
import { normalizeOverrides, streamKey, streamSize, withOverride } from './overrides';
import type { LedgerRow } from './types';

const c = (date: string, cents: number, merchant: string, provider = 'Acme'): LedgerRow => ({ provider, merchant, date, amountCents: cents });

describe('cleaning a description into a charge type', () => {
  it('drops the reference code, the city and the case', () => {
    expect(cleanDescriptor('NAME-CHEAP.COM* PTOOH4  PHOENIX')).toBe('NAME-CHEAP.COM');
    // codes that mix letters and digits, in either case
    for (const code of ['PTOOH4', 'TQW4V8', '32CZHQ', 'j5spg8']) expect(cleanDescriptor(`NAME-CHEAP.COM* ${code}  PHOENIX`)).toBe('NAME-CHEAP.COM');
    expect(normalizeDescriptor('name-cheap.com* ptooh4  phoenix')).toBe(normalizeDescriptor('NAME-CHEAP.COM* PTOOH4  PHOENIX'));
    expect(normalizeDescriptor('Anthropic')).toBe('ANTHROPIC');
    expect(normalizeDescriptor('ANTHROPIC')).toBe('ANTHROPIC');
    expect(normalizeDescriptor('CURSOR AI               NEW YORK')).toBe('CURSOR AI');
  });

  it('ignores company-form words and punctuation, and spacing around the star', () => {
    expect(normalizeDescriptor('VERCEL INC.             COVINA')).toBe('VERCEL');
    expect(normalizeDescriptor('VERCEL')).toBe('VERCEL');
    expect(normalizeDescriptor('GITHUB, INC.            SAN FRANCISCO')).toBe('GITHUB');
    expect(normalizeDescriptor('OPENAI *CHATGPT SUBSCR  SAN FRANCISCO')).toBe('OPENAI* CHATGPT SUBSCR');
    expect(normalizeDescriptor('OPENAI* CHATGPT SUBSCR  DUBLIN')).toBe('OPENAI* CHATGPT SUBSCR');
  });

  it('keeps real words, and different services of one provider apart', () => {
    expect(normalizeDescriptor('ANTHROPIC* CLAUDE SUB   SAN FRANCISCO')).toBe('ANTHROPIC* CLAUDE SUB');
    expect(normalizeDescriptor('CLAUDE.AI SUBSCRIPTION  SAN FRANCISCO')).toBe('CLAUDE.AI SUBSCRIPTION');
    expect(normalizeDescriptor('Anthropic')).not.toBe(normalizeDescriptor('ANTHROPIC* CLAUDE SUB'));
    expect(normalizeDescriptor('OPENAI* CHATGPT CREDIT  DUBLIN')).not.toBe(normalizeDescriptor('OPENAI *CHATGPT SUBSCR'));
    expect(normalizeDescriptor('OPENAI                  SAN FRANCISCO')).toBe('OPENAI');
  });

  it('does not merge different products billed through one processor: a run of letters is a word, not a code', () => {
    expect(normalizeDescriptor('PADDLE.NET* CURSOR')).toBe('PADDLE.NET* CURSOR');
    expect(normalizeDescriptor('PADDLE.NET* NOTION')).not.toBe(normalizeDescriptor('PADDLE.NET* CURSOR'));
    expect(normalizeDescriptor('paddle.net* cursor')).toBe('PADDLE.NET* CURSOR');
    // the known limit: a code made only of letters is kept, so it splits a charge type (visible, and you can confirm each)
    expect(normalizeDescriptor('NAME-CHEAP.COM* JZSPGX  PHOENIX')).toBe('NAME-CHEAP.COM* JZSPGX');
  });

  it('settles the spacing around a star before looking for the padded city', () => {
    expect(normalizeDescriptor('OPENAI*  CHATGPT SUBSCR  SAN FRANCISCO')).toBe('OPENAI* CHATGPT SUBSCR');
    expect(normalizeDescriptor('OPENAI*  CHATGPT CREDIT  DUBLIN')).toBe('OPENAI* CHATGPT CREDIT');
    expect(normalizeDescriptor('OPENAI  *CHATGPT CREDIT')).toBe('OPENAI* CHATGPT CREDIT');
    expect(normalizeDescriptor('OPENAI*  CHATGPT SUBSCR')).not.toBe(normalizeDescriptor('OPENAI*  CHATGPT CREDIT'));
    // an override on one of them does not touch the other
    const list = withOverride([], 'OpenAI', 'OPENAI*  CHATGPT SUBSCR  SAN FRANCISCO', 'monthly');
    const rows = [c('2026-01-05', 2000, 'OPENAI*  CHATGPT SUBSCR  SAN FRANCISCO', 'OpenAI'), c('2026-01-06', 1000, 'OPENAI*  CHATGPT CREDIT  DUBLIN', 'OpenAI')];
    const a = analyze(rows, '2026-01-10', list);
    expect(a.typeOf(rows[0]).source).toBe('you');
    expect(a.typeOf(rows[1]).source).not.toBe('you');
  });

  it('does not mistake a word after a star for a code', () => {
    expect(normalizeDescriptor('OPENAI* CHATGPT SUBSCR  DUBLIN')).toBe('OPENAI* CHATGPT SUBSCR');
    expect(normalizeDescriptor('GOOGLE *GEMINI')).toBe('GOOGLE* GEMINI');
    expect(normalizeDescriptor('PAYPAL *SPOTIFY')).toBe('PAYPAL* SPOTIFY');
    expect(normalizeDescriptor('ANTHROPIC* CLAUDE SUB')).toBe('ANTHROPIC* CLAUDE SUB');
  });

  it('never returns nothing, and never eats the merchant itself', () => {
    expect(normalizeDescriptor('')).toBe('');
    expect(normalizeDescriptor('   ')).toBe('');
    expect(cleanDescriptor('A1B2C3D4')).toBe('A1B2C3D4'); // the first word is the merchant, even if it looks like a code
    expect(normalizeDescriptor('INC')).toBe('INC');
    expect(normalizeDescriptor('Examplebot.ai Inc, Austin, TX')).toBe('EXAMPLEBOT.AI INC, AUSTIN, TX'); // no padded city column: kept whole, nothing to clean
  });
});

describe('a setting carries over to every charge of the charge type', () => {
  const chargeTypeRows = [
    c('2026-01-05', 1500, 'NAME-CHEAP.COM* PTOOH4  PHOENIX', 'Namecheap'),
    c('2026-03-09', 1200, 'NAME-CHEAP.COM* TQW4V8  PHOENIX', 'Namecheap'),
    c('2026-05-20', 1800, 'NAME-CHEAP.COM* J5SPG8  PHOENIX', 'Namecheap'),
    c('2026-05-21', 500, 'Other thing', 'Namecheap'),
  ];

  it('groups charges with different raw descriptions, and counts them', () => {
    expect(streamKey('Namecheap', chargeTypeRows[0].merchant)).toBe(streamKey('Namecheap', chargeTypeRows[2].merchant));
    expect(streamKey('Namecheap', chargeTypeRows[0].merchant)).not.toBe(streamKey('Namecheap', 'Other thing'));
    expect(streamKey('Namecheap', 'VERCEL')).not.toBe(streamKey('Vercel', 'VERCEL')); // a charge type belongs to its provider
    expect(streamSize(chargeTypeRows, 'Namecheap', 'NAME-CHEAP.COM* X9Y8Z7  ANYWHERE')).toBe(3);
  });

  it('applies one setting to all of them, including charges that arrive later', () => {
    const list = withOverride([], 'Namecheap', 'NAME-CHEAP.COM* PTOOH4  PHOENIX', 'other');
    const now = analyze(chargeTypeRows, '2026-05-22', list);
    for (const r of chargeTypeRows.slice(0, 3)) expect(now.typeOf(r)).toMatchObject({ kind: 'other', source: 'you' });
    expect(now.typeOf(chargeTypeRows[3]).source).not.toBe('you');
    const later = [...chargeTypeRows, c('2026-06-02', 2000, 'NAME-CHEAP.COM* NEWC0D  PHOENIX', 'Namecheap')];
    expect(analyze(later, '2026-06-03', list).typeOf(later[4])).toMatchObject({ kind: 'other', source: 'you' });
  });

  it('still matches a setting saved under a raw description by an earlier version', () => {
    const legacy = normalizeOverrides([{ provider: 'Acme', merchant: 'ACME INC.           BOSTON', kind: 'usage' }]);
    const rows = [c('2026-01-05', 100, 'ACME'), c('2026-02-05', 100, 'Acme Inc')];
    const a = analyze(rows, '2026-03-01', legacy);
    for (const r of rows) expect(a.typeOf(r)).toMatchObject({ kind: 'usage', source: 'you' });
  });

  it('replaces the setting of the same charge type, whatever the raw description it was saved under', () => {
    let list = withOverride([], 'Acme', 'ACME INC.   BOSTON', 'usage');
    list = withOverride(list, 'Acme', 'ACME', 'monthly');
    expect(list).toEqual([{ provider: 'Acme', merchant: 'ACME', kind: 'monthly' }]);
    expect(normalizeOverrides([{ provider: 'Acme', merchant: 'ACME INC.', kind: 'usage' }, { provider: 'Acme', merchant: 'Acme', kind: 'other' }])).toHaveLength(1);
  });
});

describe('confirming a charge type as a subscription', () => {
  const plan = (date: string, cents: number, ref: string) => c(date, cents, `ACME* PLAN ${ref}`, 'Acme');
  const base = [
    ...['2026-01-05', '2026-02-05', '2026-03-05'].map((d) => plan(d, 2000, 'ABC123')),
    ...['2026-01-15', '2026-02-15', '2026-03-15'].map((d) => plan(d, 5000, 'XYZ456')),
  ];
  const confirm = [{ provider: 'Acme', merchant: 'ACME* PLAN', kind: 'monthly' as const }];

  it('counts two concurrent subscriptions under one charge type once each, as detection does', () => {
    expect(analyze(base, '2026-03-20').report.monthlyCents).toBe(7000);
    const a = analyze(base, '2026-03-20', confirm);
    expect(a.report.monthlyCents).toBe(7000); // confirming must not collapse them into one
    expect(a.report.active).toHaveLength(2);
    expect(a.report.active.map((s) => s.monthlyCents).sort()).toEqual([2000, 5000]);
  });

  it('keeps ONE subscription as one when its reference comes and goes (repeated references alone prove nothing)', () => {
    const rows = [plan('2026-01-05', 2000, 'ABC123'), c('2026-02-05', 2000, 'ACME* PLAN', 'Acme'), plan('2026-03-05', 2000, 'ABC123'), c('2026-04-05', 2000, 'ACME* PLAN', 'Acme')];
    const a = analyze(rows, '2026-04-20', confirm);
    expect(a.report.monthlyCents).toBe(2000);
    expect(a.report.active).toHaveLength(1);
  });

  it('keeps a yearly subscription as one when its reference changes between renewals', () => {
    const rows = [plan('2024-03-10', 12000, 'ABC123'), plan('2025-03-10', 12000, 'ABC123'), plan('2026-03-10', 12000, 'XYZ456')];
    const a = analyze(rows, '2026-03-25', [{ provider: 'Acme', merchant: 'ACME* PLAN', kind: 'yearly' }]);
    expect(a.report.active).toHaveLength(1); // during the renewal grace, not counted twice
    expect(a.report.yearlyCents).toBe(12000);
  });

  it('still counts two concurrent subscriptions when every charge carries its own reference, with no false price rise', () => {
    const rows = [
      ...['2026-01-05', '2026-02-05', '2026-03-05'].map((d, i) => plan(d, 2000, `A${i}B9C${i}`)),
      ...['2026-01-15', '2026-02-15', '2026-03-15'].map((d, i) => plan(d, 5000, `X${i}Y9Z${i}`)),
    ];
    expect(analyze(rows, '2026-03-20').report.monthlyCents).toBe(7000); // detection
    const a = analyze(rows, '2026-03-20', confirm);
    expect(a.report.monthlyCents).toBe(7000); // and Confirm must not change that
    expect(a.report.active).toHaveLength(2);
    expect(a.report.priceChanges).toEqual([]);
  });

  it('keeps a stopped subscription separate from a concurrent one that is still charging', () => {
    const rows = [
      ...['2026-01-05', '2026-02-05', '2026-03-05'].map((d) => plan(d, 2000, 'ABC123')),
      ...['2026-01-15', '2026-02-15', '2026-03-15', '2026-04-15', '2026-05-15'].map((d) => plan(d, 5000, 'XYZ456')),
    ];
    const a = analyze(rows, '2026-05-20', confirm);
    const stopped = a.report.stopped.find((s) => s.lastCents === 2000);
    expect(stopped).toBeDefined();
    expect(stopped!.chargesSince).toEqual([]); // the other subscription's later charges are not "still charging"
    expect(a.report.active.map((s) => s.monthlyCents)).toEqual([5000]);
  });

  it('keeps charges whose reference changes every time together as one subscription', () => {
    const rows = ['2026-01-05', '2026-02-05', '2026-03-05'].map((d, i) => plan(d, 2000, `R${i}X9Z${i}`));
    const a = analyze(rows, '2026-03-20', confirm);
    expect(a.report.active).toHaveLength(1);
    expect(a.report.monthlyCents).toBe(2000);
  });

  it('does not let a refund decide what the charge type is, or drop it from the run-rate', () => {
    const rows = [...['2026-01-05', '2026-02-05', '2026-03-05'].map((d) => plan(d, 2000, 'ABC123')), plan('2026-03-20', -2000, 'ABC123')];
    const a = analyze(rows, '2026-03-25');
    expect(a.streamInfo('Acme', 'ACME* PLAN')).toMatchObject({ kind: 'subscription' });
    expect(analyze(rows, '2026-03-25', confirm).report.monthlyCents).toBe(2000);
  });

  it('does not report an unrelated charge as "still charging" after a plan stopped, whatever the case of the description', () => {
    const planRows = ['2026-01-05', '2026-02-05', '2026-03-05', '2026-04-05'].map((d, i) => c(d, 2000, i % 2 ? 'Acme* Plan' : 'ACME* PLAN', 'Acme'));
    const rows = [...planRows, c('2026-06-10', 700, 'ACME* API', 'Acme'), c('2026-08-01', 100, 'OTHER', 'Other')];
    const a = analyze(rows, '2026-08-02', confirm);
    const stopped = a.report.stopped.find((s) => s.provider === 'Acme');
    expect(stopped).toBeDefined();
    expect(stopped!.chargesSince).toEqual([]);
  });

  it('does not take an unrelated charge for the new price of a plan, whatever the case of the description', () => {
    const planRows = ['2026-01-05', '2026-02-05', '2026-03-05'].map((d, i) => c(d, 2000, i % 2 ? 'Acme* Plan' : 'ACME* PLAN', 'Acme'));
    const rows = [...planRows, c('2026-04-12', 700, 'ACME* API', 'Acme'), c('2026-04-20', 100, 'OTHER', 'Other')];
    const a = analyze(rows, '2026-04-21');
    expect(a.patterns.some((p) => p.provisional)).toBe(false);
  });
});

describe('a separate charge that shares a charge type is not a plan switch', () => {
  it('leaves a subscription that is still on schedule alone when a different charge appears well before its next date', () => {
    // "VERCEL INC." monthly on the 26th, then a "VERCEL" charge on the 7th: same charge type, but not the next renewal
    const rows = ['2026-07-26', '2026-08-26', '2026-09-26', '2026-10-26'].map((d) => c(d, 1832, 'VERCEL INC.             COVINA', 'Vercel'));
    const all = [...rows, c('2026-11-07', 898, 'VERCEL                  COVINA', 'Vercel')];
    const a = analyze(all, '2026-11-10');
    expect(a.patterns.some((p) => p.provisional)).toBe(false);
    expect(a.report.monthlyCents).toBe(1832);
    expect(a.report.priceChanges).toEqual([]);
  });

  it('still recognises a switch that lands on the usual billing day', () => {
    const rows = ['2026-07-06', '2026-08-06', '2026-09-06', '2026-10-06'].map((d) => c(d, 2178, 'ANTHROPIC* CLAUDE SUB   SAN FRANCISCO', 'Anthropic'));
    const a = analyze([...rows, c('2026-11-06', 10890, 'Anthropic* Claude Sub', 'Anthropic')], '2026-11-08');
    expect(a.report.monthlyCents).toBe(10890);
    expect(a.report.priceChanges[0]).toMatchObject({ kind: 'plan', fromCents: 2178, toCents: 10890 });
  });
});

describe('confirming never disagrees with what automatic detection already counts', () => {
  const plan = (date: string, cents: number, ref = '') => c(date, cents, `ACME* PLAN${ref ? ' ' + ref : ''}`, 'Acme');
  const confirm = [{ provider: 'Acme', merchant: 'ACME* PLAN', kind: 'monthly' as const }];
  const same = (rows: LedgerRow[], today: string) => {
    const auto = analyze(rows, today).report;
    const confirmed = analyze(rows, today, confirm).report;
    expect(confirmed.monthlyCents).toBe(auto.monthlyCents);
    expect(confirmed.active).toHaveLength(auto.active.length);
    return { auto, confirmed };
  };

  it('keeps a plan that changed price next to a concurrent plan: both counted, the first not "stopped"', () => {
    const rows = [
      ...['2026-01-05', '2026-02-05', '2026-03-05'].map((d) => plan(d, 2000, 'ABC123')),
      plan('2026-04-05', 10000, 'ABC123'),
      ...['2026-01-15', '2026-02-15', '2026-03-15', '2026-04-15'].map((d) => plan(d, 5000, 'XYZ456')),
    ];
    const { auto, confirmed } = same(rows, '2026-04-20');
    expect(auto.monthlyCents).toBe(15000);
    expect(confirmed.stopped).toEqual([]);
  });

  it('keeps a payment that returns after a missed month', () => {
    const rows = [...['2026-01-05', '2026-02-05', '2026-03-05'].map((d) => plan(d, 2000, 'ABC123')), plan('2026-05-05', 2000, 'ABC123'), ...['2026-01-15', '2026-02-15', '2026-03-15', '2026-04-15', '2026-05-15'].map((d) => plan(d, 5000, 'XYZ456'))];
    const { confirmed } = same(rows, '2026-05-20');
    expect(confirmed.monthlyCents).toBe(7000);
  });

  it('counts a subscription that came back after a long gap, which detection alone cannot place', () => {
    const rows = [...['2026-01-05', '2026-02-05', '2026-03-05'].map((d) => plan(d, 2000, 'ABC123')), plan('2026-09-05', 2000, 'ABC123')];
    expect(analyze(rows, '2026-09-10').report.monthlyCents).toBe(0);
    expect(analyze(rows, '2026-09-10', confirm).report.monthlyCents).toBe(2000);
  });

  it('is not thrown by a refund: two schedules on one descriptor plus a refund in a month stay two schedules', () => {
    // one descriptor, 20 on the 5th and 50 on the 15th; the refund makes February three rows, which used to read as usage
    const base = [...['2026-01-05', '2026-02-05', '2026-03-05'].map((d) => plan(d, 2000)), ...['2026-01-15', '2026-02-15', '2026-03-15'].map((d) => plan(d, 5000))];
    expect(analyze(base, '2026-03-20', confirm).report.monthlyCents).toBe(7000);
    const rows = [...base, plan('2026-02-16', -5000)];
    const { auto, confirmed } = same(rows, '2026-03-20');
    expect(auto.monthlyCents).toBe(7000); // detection itself, no Confirm
    expect(confirmed.priceChanges).toEqual([]); // and no false 150% rise
  });

  it('counts a later charge with a reference for a plan that never showed one', () => {
    const rows = [...['2026-01-05', '2026-02-05', '2026-03-05'].map((d) => plan(d, 2000)), plan('2026-06-22', 700, 'ABC123'), c('2026-08-01', 100, 'OTHER', 'Other')]; // a different billing day: not the plan coming back
    const stopped = analyze(rows, '2026-08-02', confirm).report.stopped.find((s) => s.lastCents === 2000);
    expect(stopped).toBeDefined();
    expect(stopped!.chargesSince).toHaveLength(1);
    expect(stopped!.chargesSince[0].merchant).toBe('ACME* PLAN ABC123');
  });

  it('does not let a returning subscription suppress an unrelated active one', () => {
    // A: 20 on the 5th Jan-Mar, back on Sep 5. B: 50 on the 15th Jan-Aug. Same charge type, different references.
    const a = ['2026-01-05', '2026-02-05', '2026-03-05'].map((d) => plan(d, 2000, 'A1B2C3'));
    const b = ['2026-01-15', '2026-02-15', '2026-03-15', '2026-04-15', '2026-05-15', '2026-06-15', '2026-07-15', '2026-08-15'].map((d) => plan(d, 5000, 'X1Y2Z3'));
    const rows = [...a, plan('2026-09-05', 2000, 'A1B2C3'), ...b];
    const r = analyze(rows, '2026-09-06', confirm).report;
    expect(r.monthlyCents).toBe(7000); // A is back (20) and B (50) is still there
    expect(r.active).toHaveLength(2);
    expect(r.priceChanges).toEqual([]); // no invented 50 -> 20 downgrade
  });

  it('counts a returning subscription even when the other subscription has just renewed', () => {
    const a = ['2026-01-05', '2026-02-05', '2026-03-05'].map((d) => plan(d, 2000, 'A1B2C3'));
    const b = ['2026-01-15', '2026-02-15', '2026-03-15', '2026-04-15', '2026-05-15', '2026-06-15', '2026-07-15', '2026-08-15', '2026-09-15'].map((d) => plan(d, 5000, 'X1Y2Z3'));
    const r = analyze([...a, plan('2026-09-05', 2000, 'A1B2C3'), ...b], '2026-09-20', confirm).report;
    expect(r.monthlyCents).toBe(7000);
    expect(r.active).toHaveLength(2);
  });

  it('does not count one subscription twice when its description alternates between two charge types', () => {
    const rows = ['2026-01-05', '2026-02-05', '2026-03-05', '2026-04-05'].map((d, i) => c(d, 2000, i % 2 ? 'ACME* RENEWAL' : 'ACME* PLAN', 'Acme'));
    expect(analyze(rows, '2026-04-10').report.monthlyCents).toBe(2000); // automatic
    const both = [{ provider: 'Acme', merchant: 'ACME* PLAN', kind: 'monthly' as const }, { provider: 'Acme', merchant: 'ACME* RENEWAL', kind: 'monthly' as const }];
    const a = analyze(rows, '2026-04-10', both); // "Confirm all"
    expect(a.report.monthlyCents).toBe(2000);
    expect(a.report.active).toHaveLength(1);
  });

  it('does not cut a chain in two when only some of its charge types are confirmed', () => {
    // 20 on the 5th, Jan-Jun, alternating PLAN and RENEWAL: one chain. Confirming only PLAN must not split it.
    const chain = ['2026-01-05', '2026-02-05', '2026-03-05', '2026-04-05', '2026-05-05', '2026-06-05'].map((d, i) => c(d, 2000, i % 2 ? 'ACME* RENEWAL' : 'ACME* PLAN', 'Acme'));
    const rows = [...chain, c('2026-06-21', 100, 'OTHER', 'Other')]; // the ledger runs to Jun 21, so a missing Jun charge would show
    expect(analyze(rows, '2026-06-21').report.monthlyCents).toBe(2000); // automatic
    expect(analyze(rows, '2026-06-21', [{ provider: 'Acme', merchant: 'ACME* PLAN', kind: 'monthly' }]).report.monthlyCents).toBe(2000);
    expect(analyze(rows, '2026-06-21', [{ provider: 'Acme', merchant: 'ACME* RENEWAL', kind: 'monthly' }]).report.monthlyCents).toBe(2000);
    const both = [{ provider: 'Acme', merchant: 'ACME* PLAN', kind: 'monthly' as const }, { provider: 'Acme', merchant: 'ACME* RENEWAL', kind: 'monthly' as const }];
    expect(analyze(rows, '2026-06-21', both).report.monthlyCents).toBe(2000);
  });

  it('attaches a returning charge to the subscription of its own charge type, not one that bills a few days from it', () => {
    // PLAN: 20 on the 5th Jan-Mar, back on Sep 5. SERVICE: 50 on the 7th Jan-Aug. Different charge types, nearby billing days.
    const plan = [...['2026-01-05', '2026-02-05', '2026-03-05'].map((d) => c(d, 2000, 'ACME* PLAN', 'Acme')), c('2026-09-05', 2000, 'ACME* PLAN', 'Acme')];
    const service = ['2026-01-07', '2026-02-07', '2026-03-07', '2026-04-07', '2026-05-07', '2026-06-07', '2026-07-07', '2026-08-07'].map((d) => c(d, 5000, 'ACME* SERVICE', 'Acme'));
    const rows = [...plan, ...service];
    expect(analyze(rows, '2026-09-06').report.monthlyCents).toBe(5000); // automatic keeps SERVICE
    const both = [{ provider: 'Acme', merchant: 'ACME* PLAN', kind: 'monthly' as const }, { provider: 'Acme', merchant: 'ACME* SERVICE', kind: 'monthly' as const }];
    const r = analyze(rows, '2026-09-06', both).report;
    expect(r.monthlyCents).toBe(7000); // PLAN is back (20), SERVICE (50) is still there
    expect(r.priceChanges).toEqual([]); // no invented downgrade
  });

  it('does not let a charge near an active pattern replace its latest charge', () => {
    // 90 on the 4th Feb-Apr (active), and a 80 on Apr 6 from nowhere in particular: noise, not the same subscription at a new price
    const rows = [...['2026-02-04', '2026-03-04', '2026-04-04'].map((d) => c(d, 9000, 'ACME* PLAN R71X9Z', 'Acme')), c('2026-04-06', 8000, 'ACME* PLAN R18X9Z', 'Acme')];
    const confirm = [{ provider: 'Acme', merchant: 'ACME* PLAN', kind: 'monthly' as const }];
    expect(analyze(rows, '2026-04-07', confirm).report.monthlyCents).toBe(analyze(rows, '2026-04-07').report.monthlyCents);
  });

  it('follows a revived subscription through its next renewals, with the latest amount and dates', () => {
    const back = (extra: [string, number][]) => [
      ...['2026-01-05', '2026-02-05', '2026-03-05', '2026-09-05'].map((d) => c(d, 2000, 'ACME* PLAN ABC123', 'Acme')),
      ...extra.map(([d, cents]) => c(d, cents, 'ACME* PLAN ABC123', 'Acme')),
      c('2026-12-20', 100, 'OTHER', 'Other'),
    ];
    const confirm = [{ provider: 'Acme', merchant: 'ACME* PLAN', kind: 'monthly' as const }];
    // one renewal after the revival: 30 on Oct 5, judged on Oct 6
    const one = analyze(back([['2026-10-05', 3000]]).filter((r) => r.provider === 'Acme'), '2026-10-06', confirm);
    expect(one.report.monthlyCents).toBe(3000);
    expect(one.report.active[0]).toMatchObject({ lastDate: '2026-10-05', billedCents: 3000 });
    expect(one.report.active[0].pattern.nextExpected).toBe('2026-11-05');
    expect(one.report.priceChanges[0]).toMatchObject({ kind: 'step', fromCents: 2000, toCents: 3000 }); // 20 -> 30 is a real price change
    // two and three renewals after it
    const three = analyze(back([['2026-10-05', 3000], ['2026-11-05', 3000], ['2026-12-05', 3000]]).filter((r) => r.provider === 'Acme'), '2026-12-06', confirm);
    expect(three.report.monthlyCents).toBe(3000);
    expect(three.report.active[0]).toMatchObject({ lastDate: '2026-12-05', billedCents: 3000 });
    expect(three.report.active[0].pattern.nextExpected).toBe('2027-01-05');
    // unchanged amount: the dates must still move on
    const same = analyze(back([['2026-10-05', 2000]]).filter((r) => r.provider === 'Acme'), '2026-10-06', confirm);
    expect(same.report.active[0].pattern.nextExpected).toBe('2026-11-05');
  });

  it('gives the renewal slot to the charge that fits exactly, not to an early stray one', () => {
    // 20 on the 5th Jan-Mar, then a 5 on Apr 3, the real 20 on Apr 5 and a 3 on Apr 7: three charges in one month on one descriptor
    const rows = [...['2026-01-05', '2026-02-05', '2026-03-05'].map((d) => c(d, 2000, 'ACME* PLAN', 'Acme')), c('2026-04-03', 500, 'ACME* PLAN', 'Acme'), c('2026-04-05', 2000, 'ACME* PLAN', 'Acme'), c('2026-04-07', 300, 'ACME* PLAN', 'Acme')];
    const confirm = [{ provider: 'Acme', merchant: 'ACME* PLAN', kind: 'monthly' as const }];
    expect(analyze(rows, '2026-04-08').report.monthlyCents).toBe(2000); // automatic
    const r = analyze(rows, '2026-04-08', confirm).report;
    expect(r.monthlyCents).toBe(2000);
    expect(r.active[0]).toMatchObject({ lastDate: '2026-04-05', billedCents: 2000 });
    expect(r.priceChanges).toEqual([]);
  });

  it('does not count a missing reference as matching a pattern that also has none', () => {
    // ABC123: 20 on the 5th Jan-Mar. No reference: 50 on the 7th Jan-Jun. Both return without a reference: 20 on Sep 5, 50 on Sep 7.
    const a = ['2026-01-05', '2026-02-05', '2026-03-05'].map((d) => c(d, 2000, 'ACME* PLAN ABC123', 'Acme'));
    const b = ['2026-01-07', '2026-02-07', '2026-03-07', '2026-04-07', '2026-05-07', '2026-06-07'].map((d) => c(d, 5000, 'ACME* PLAN', 'Acme'));
    const rows = [...a, ...b, c('2026-09-05', 2000, 'ACME* PLAN', 'Acme'), c('2026-09-07', 5000, 'ACME* PLAN', 'Acme')];
    const confirm = [{ provider: 'Acme', merchant: 'ACME* PLAN', kind: 'monthly' as const }];
    const r = analyze(rows, '2026-09-08', confirm).report;
    expect(r.monthlyCents).toBe(7000);
    expect(r.priceChanges).toEqual([]); // no swapped histories
    expect(r.active.map((s) => [s.billedCents, s.lastDate]).sort()).toEqual([[2000, '2026-09-05'], [5000, '2026-09-07']]);
  });

  it('does not revive a pattern that a plan switch already continued, and takes no tiny stray for a renewal', () => {
    // 70 on the 6th Jan-Mar, then back in May at the same price (a plan switch picks it up), then a 40 on Jun 10 and a 3 on Jun 8
    const rows = [...['2026-01-06', '2026-02-06', '2026-03-06', '2026-05-06', '2026-06-06'].map((d) => c(d, 7000, 'ACME* RENEWAL', 'Acme')), c('2026-06-08', 300, 'ACME* RENEWAL', 'Acme')];
    const confirm = [{ provider: 'Acme', merchant: 'ACME* RENEWAL', kind: 'monthly' as const }];
    const r = analyze(rows, '2026-06-09', confirm).report;
    expect(r.active).toHaveLength(1);
    expect(r.monthlyCents).toBe(7000); // not 3: the stray is not the renewal
  });

  it('lets an exact renewal under a new reference beat a reference-less stray', () => {
    // ABC123: 20 on the 5th Jan-Mar. After the gap: a 3 with no reference on Sep 3, and the real 20 on Sep 5 under a NEW reference.
    const a = ['2026-01-05', '2026-02-05', '2026-03-05'].map((d) => c(d, 2000, 'ACME* PLAN ABC123', 'Acme'));
    const confirm = [{ provider: 'Acme', merchant: 'ACME* PLAN', kind: 'monthly' as const }];
    for (const renewal of ['ACME* PLAN DEF456', 'ACME* PLAN']) {
      const rows = [...a, c('2026-09-03', 300, 'ACME* PLAN', 'Acme'), c('2026-09-05', 2000, renewal, 'Acme')];
      const r = analyze(rows, '2026-09-06', confirm).report;
      expect(r.monthlyCents).toBe(2000);
      expect(r.active[0]).toMatchObject({ lastDate: '2026-09-05', billedCents: 2000 });
      expect(r.priceChanges).toEqual([]);
    }
  });

  it('still uses a reference the pattern has shown to tell two close schedules apart', () => {
    // A (ref AAA111) 20 on the 5th and B (ref BBB222) 20 on the 7th, same amounts. B's charge on Sep 6 with its own reference is B's.
    const a = ['2026-01-05', '2026-02-05', '2026-03-05'].map((d) => c(d, 2000, 'ACME* PLAN AAA111', 'Acme'));
    const b = ['2026-01-07', '2026-02-07', '2026-03-07'].map((d) => c(d, 2000, 'ACME* PLAN BBB222', 'Acme'));
    const rows = [...a, ...b, c('2026-09-06', 2000, 'ACME* PLAN BBB222', 'Acme')];
    const confirm = [{ provider: 'Acme', merchant: 'ACME* PLAN', kind: 'monthly' as const }];
    const r = analyze(rows, '2026-09-07', confirm);
    const revived = r.patterns.find((p) => p.active);
    expect(revived).toBeDefined();
    expect(revived!.charges.some((x) => x.merchant.includes('BBB222') && x.date < '2026-04-01')).toBe(true); // it went to B's pattern
    expect(revived!.charges.some((x) => x.merchant.includes('AAA111'))).toBe(false);
  });

  it('revives a stopped schedule with its own return even when a stray on another billing day was read as its new price', () => {
    // 70 on the 8th Apr-Jun (stopped). A lone 80 on Aug 18 (another schedule's charge) is read by plan-switch detection as the new price
    // of that plan. The real 70 comes back on Sep 8, on the plan's own day and at its own price: it is the plan's return.
    const rows = [
      ...['2026-04-08', '2026-05-08', '2026-06-08'].map((d, i) => c(d, 7000, `ACME* PLAN R${i}3X9Z`, 'Acme')),
      c('2026-08-18', 8000, 'ACME* PLAN R51X9Z', 'Acme'),
      c('2026-09-08', 7000, 'ACME* PLAN', 'Acme'),
      c('2026-09-18', 100, 'OTHER', 'Other'),
    ];
    const confirm = [{ provider: 'Acme', merchant: 'ACME* PLAN', kind: 'monthly' as const }];
    const a = analyze(rows, '2026-09-18', confirm);
    const back = a.patterns.find((p) => p.charges.some((x) => x.date === '2026-09-08'));
    expect(back).toBeDefined();
    expect(back!.active).toBe(true);
    expect(back!.charges.some((x) => x.date === '2026-04-08')).toBe(true); // it joined the 70 schedule's history
    expect(a.report.active.some((s) => s.billedCents === 7000 && s.lastDate === '2026-09-08')).toBe(true);
  });

  it('still does not split one schedule in two when the charge fits its replacing pattern as well', () => {
    // 70 on the 6th Jan-Mar, back in May at the same price (a plan switch picks it up), then Jun 6: it is the continuation, not a revival
    const rows = [...['2026-01-06', '2026-02-06', '2026-03-06', '2026-05-06', '2026-06-06'].map((d) => c(d, 7000, 'ACME* RENEWAL', 'Acme'))];
    const confirm = [{ provider: 'Acme', merchant: 'ACME* RENEWAL', kind: 'monthly' as const }];
    const a = analyze(rows, '2026-06-08', confirm);
    expect(a.report.active).toHaveLength(1);
    expect(a.report.monthlyCents).toBe(7000);
  });

  it('lets all confirmed charge types compete for the same pattern, so a later stray of one cannot shut out an earlier return of another', () => {
    // 70 on the 6th Feb-Apr alternating RENEWAL / PLAN (stopped). The PLAN returns on Sep 6 under a new reference. A stray 3 on
    // the RENEWAL type comes much later (Jan 7). Matching RENEWAL first would move the pattern past Sep 6, losing the return.
    const rows = [
      c('2026-02-06', 7000, 'ACME* RENEWAL', 'Acme'), c('2026-03-06', 7000, 'ACME* PLAN', 'Acme'), c('2026-04-06', 7000, 'ACME* RENEWAL', 'Acme'),
      c('2026-09-06', 7000, 'ACME* PLAN N0W7Q1', 'Acme'), c('2027-01-07', 300, 'ACME* RENEWAL', 'Acme'), c('2027-01-09', 100, 'OTHER', 'Other'),
    ];
    const both = [{ provider: 'Acme', merchant: 'ACME* PLAN', kind: 'monthly' as const }, { provider: 'Acme', merchant: 'ACME* RENEWAL', kind: 'monthly' as const }];
    const a = analyze(rows, '2027-01-09', both);
    expect(a.patterns.some((p) => p.charges.some((x) => x.date === '2026-09-06'))).toBe(true); // the return is in a pattern
    expect(a.patterns.some((p) => p.charges.some((x) => x.date === '2026-09-06') && p.charges.some((x) => x.date === '2026-02-06'))).toBe(true); // the schedule's own
  });

  it('ranks a plausible amount above an exact billing day: the real return beats a stray that lands on the exact day', () => {
    // 20 on the 3rd May-Jul (stopped). In January a 3 lands on the 3rd (exact day, 85% off) and the real 20 comes on the 5th (2 days off).
    const rows = [
      ...['2026-05-03', '2026-06-03', '2026-07-03'].map((d, i) => c(d, 2000, i % 2 ? 'ACME* RENEWAL' : 'ACME* PLAN', 'Acme')),
      c('2027-01-03', 300, 'ACME* RENEWAL', 'Acme'), c('2027-01-05', 2000, 'ACME* RENEWAL N1W7Q0', 'Acme'), c('2027-01-06', 100, 'OTHER', 'Other'),
    ];
    const both = [{ provider: 'Acme', merchant: 'ACME* PLAN', kind: 'monthly' as const }, { provider: 'Acme', merchant: 'ACME* RENEWAL', kind: 'monthly' as const }];
    const r = analyze(rows, '2027-01-06', both).report;
    expect(r.monthlyCents).toBe(2000);
    expect(r.active[0]).toMatchObject({ lastDate: '2027-01-05', billedCents: 2000 });
  });
});
