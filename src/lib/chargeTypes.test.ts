import { describe, expect, it } from 'vitest';
import { cleanDescriptor, normalizeDescriptor } from './chargeTypes';
import { analyze } from './insights';
import { normalizeOverrides, streamKey, streamSize, withOverride } from './overrides';
import type { LedgerRow } from './types';

const c = (date: string, cents: number, merchant: string, provider = 'Acme'): LedgerRow => ({ provider, merchant, date, amountCents: cents });

describe('cleaning a description into a charge type', () => {
  it('drops the reference code, the city and the case', () => {
    expect(cleanDescriptor('NAME-CHEAP.COM* PTOOH4  PHOENIX')).toBe('NAME-CHEAP.COM');
    expect(cleanDescriptor('NAME-CHEAP.COM* JZSPGX  PHOENIX')).toBe('NAME-CHEAP.COM'); // a code with no digit, after the star
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
    c('2026-05-20', 1800, 'NAME-CHEAP.COM* JZSPGX  PHOENIX', 'Namecheap'),
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
