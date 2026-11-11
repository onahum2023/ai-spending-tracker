import { describe, expect, it } from 'vitest';
import { analyze } from './insights';
import { listChargeTypes, patternsByChargeType, reviewCounts, suggestedSetting } from './providerChargeTypes';
import { streamKey } from './overrides';
import type { LedgerRow } from './types';

const c = (date: string, cents: number, merchant: string, provider = 'Anthropic'): LedgerRow => ({ provider, merchant, date, amountCents: cents });
const SUB = 'ANTHROPIC* CLAUDE SUB   SAN FRANCISCO';
const rows = [
  ...['2026-06-19', '2026-07-19', '2026-08-19', '2026-09-19', '2026-10-19'].map((d) => c(d, 2178, SUB)),
  c('2026-10-03', 1050, 'Anthropic'),
  c('2026-10-21', 1100, 'Anthropic'),
  c('2026-11-02', 900, 'Anthropic'),
  c('2026-09-02', 2500, 'NAME-CHEAP.COM* PTOOH4  PHOENIX', 'Namecheap'),
  c('2026-10-02', 2500, 'NAME-CHEAP.COM* TQW4V8  PHOENIX', 'Namecheap'),
];

describe('charge types of a provider', () => {
  const a = analyze(rows, '2026-11-09');
  const anthropic = rows.filter((r) => r.provider === 'Anthropic');

  it('lists one row per charge type with count, total, dates and the guess, biggest first', () => {
    const list = listChargeTypes(anthropic, [], [], a.typeOf);
    expect(list.map((t) => [t.name, t.count, t.totalCents])).toEqual([
      ['ANTHROPIC* CLAUDE SUB', 5, 10890],
      ['Anthropic', 3, 3050],
    ]);
    expect(list[0]).toMatchObject({ firstDate: '2026-06-19', lastDate: '2026-10-19', setting: null, rawVariants: 1 });
    expect(list[0].guess).toMatchObject({ kind: 'subscription', cadence: 'monthly' });
    expect(list[1].guess.kind).not.toBe('subscription');
  });

  it('puts charges that differ only by reference code and city into one charge type', () => {
    const list = listChargeTypes(rows.filter((r) => r.provider === 'Namecheap'), [], [], a.typeOf);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ count: 2, totalCents: 5000, rawVariants: 2, descriptor: 'NAME-CHEAP.COM' });
  });

  it('shows your setting and your label, and a setting makes the charge type reviewed', () => {
    const list = listChargeTypes(anthropic, [{ provider: 'Anthropic', merchant: 'ANTHROPIC* CLAUDE SUB', kind: 'monthly' }], [{ provider: 'Anthropic', merchant: SUB, label: 'Claude Pro' }], a.typeOf);
    expect(list[0]).toMatchObject({ name: 'Claude Pro', label: 'Claude Pro', setting: 'monthly', descriptor: 'ANTHROPIC* CLAUDE SUB' });
    expect(list[1]).toMatchObject({ setting: null, label: undefined });
  });

  it('turns the guess into the setting that confirms it', () => {
    expect(suggestedSetting({ kind: 'subscription', cadence: 'monthly', source: 'pattern' })).toBe('monthly');
    expect(suggestedSetting({ kind: 'subscription', source: 'import' })).toBe('monthly');
    expect(suggestedSetting({ kind: 'subscription', cadence: 'yearly', source: 'you' })).toBe('yearly');
    expect(suggestedSetting({ kind: 'usage', source: 'repeats' })).toBe('usage');
    expect(suggestedSetting({ kind: 'other', source: 'single' })).toBe('other');
  });

  it('counts the charge types still to review per provider, and drops the ones you have set', () => {
    expect([...reviewCounts(rows, [])]).toEqual([['Anthropic', 2], ['Namecheap', 1]]);
    const some = [{ provider: 'Anthropic', merchant: 'anthropic', kind: 'usage' as const }];
    expect([...reviewCounts(rows, some)]).toEqual([['Anthropic', 1], ['Namecheap', 1]]);
    const all = [...some, { provider: 'Anthropic', merchant: SUB, kind: 'monthly' as const }, { provider: 'Namecheap', merchant: 'NAME-CHEAP.COM* X1Y2Z3', kind: 'other' as const }];
    expect([...reviewCounts(rows, all)]).toEqual([]);
  });
});

describe('recurring charges under their charge type', () => {
  const claude = ['2025-10-19', '2025-11-19', '2025-12-19', '2026-01-19'].map((d) => c(d, 2178, 'CLAUDE.AI SUBSCRIPTION   SAN FRANCISCO'));
  const all = [...rows, ...claude];
  const a = analyze(all, '2026-11-09');
  const by = patternsByChargeType(a.report);

  it('attaches each active and stopped pattern to the charge type of its latest charge', () => {
    const sub = by.get(streamKey('Anthropic', SUB))!;
    expect(sub.active).toHaveLength(1);
    expect(sub.active[0].pattern.lastDate).toBe('2026-10-19');
    const old = by.get(streamKey('Anthropic', 'CLAUDE.AI SUBSCRIPTION   SAN FRANCISCO'))!;
    expect(old.stopped).toHaveLength(1);
    expect(old.stopped[0].lastDate).toBe('2026-01-19');
    expect(old.active).toHaveLength(0);
  });

  it('puts every pattern under exactly one charge type, and none under a type with no pattern', () => {
    const count = [...by.values()].reduce((n, t) => n + t.active.length + t.stopped.length, 0);
    expect(count).toBe(a.report.active.length + a.report.stopped.length);
    expect(by.has(streamKey('Anthropic', 'Anthropic'))).toBe(false);
  });
});
