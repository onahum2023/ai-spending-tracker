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
