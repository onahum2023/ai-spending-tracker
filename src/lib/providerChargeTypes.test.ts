import { describe, expect, it } from 'vitest';
import { analyze } from './insights';
import { groupChargeTypes, listChargeTypes, patternsByChargeType, reviewCounts, suggestedSetting } from './providerChargeTypes';
import { planGroups } from './labels';
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

describe('descriptors that share a label are one plan', () => {
  const OLD = 'CLAUDE.AI SUBSCRIPTION   SAN FRANCISCO';
  const NEW = 'ANTHROPIC* CLAUDE SUB   SAN FRANCISCO';
  const monthsOf = (from: number, to: number) => {
    const out: string[] = [];
    for (let i = from; i <= to; i++) out.push(`${2025 + Math.floor((i - 1) / 12)}-${String(((i - 1) % 12) + 1).padStart(2, '0')}`);
    return out;
  };
  // The same subscription renamed on the statement: Jul 2025 - Jan 2026 under one name, Feb - Oct 2026 under the other.
  const ledger = [...monthsOf(7, 13).map((m) => c(`${m}-06`, 2178, OLD)), ...monthsOf(14, 22).map((m) => c(`${m}-06`, 2178, NEW))];
  const both = [{ provider: 'Anthropic', merchant: OLD, label: 'claude pro' }, { provider: 'Anthropic', merchant: NEW, label: 'Claude Pro' }];

  it('a rename with a pause reads as a subscription that stopped and another that started, unless the label says it is one plan', () => {
    // Jul 2025 - Jan 2026 under the old name, then nothing for two months, then Apr - Oct 2026 under the new one.
    const paused = [...monthsOf(7, 13).map((m) => c(`${m}-06`, 2178, OLD)), ...monthsOf(16, 22).map((m) => c(`${m}-06`, 2178, NEW))];
    const apart = analyze(paused, '2026-11-09', [], [], [{ provider: 'Anthropic', merchant: OLD, label: 'Claude Pro' }]);
    expect(apart.report.active).toHaveLength(1);
    expect(apart.report.stopped.map((s) => s.merchant)).toEqual([OLD]);
    const together = analyze(paused, '2026-11-09', [], [], both);
    expect(together.report.stopped).toEqual([]);
    expect(together.report.active).toHaveLength(1);
    expect(together.report.active[0].merchant).toBe(NEW);
    // The plan is stopped only when none of its descriptors is still running.
    const ended = analyze([...monthsOf(7, 13).map((m) => c(`${m}-06`, 2178, OLD)), c('2026-10-03', 900, 'Anthropic', 'Other thing')], '2026-11-09', [], [], both);
    expect(ended.report.active).toEqual([]);
    expect(ended.report.stopped.map((s) => s.merchant)).toEqual([OLD]);
  });

  it('with a shared label it is one plan: one pattern across both descriptors, nothing stopped', () => {
    const a = analyze(ledger, '2026-11-09', [], [], both);
    expect(a.report.stopped).toEqual([]);
    expect(a.report.active).toHaveLength(1);
    const p = a.report.active[0].pattern;
    expect(p.charges).toHaveLength(16);
    expect(p.firstDate).toBe('2025-07-06');
    expect(a.report.active[0]).toMatchObject({ billedCents: 2178, monthlyCents: 2178 });
    // The ledger keeps its original descriptors.
    expect(new Set(p.charges.map((x) => x.merchant))).toEqual(new Set([OLD, NEW]));
    expect(ledger.filter((x) => x.merchant === OLD)).toHaveLength(7);
    // Every charge of the plan reads as a subscription, from the pattern.
    expect(a.typeOf(ledger[0])).toMatchObject({ kind: 'subscription', source: 'pattern' });
  });

  it('groups only descriptors of the same provider that carry the same label', () => {
    expect(planGroups([{ provider: 'Anthropic', merchant: OLD, label: 'Claude Pro' }]).size).toBe(0);
    expect(planGroups([{ provider: 'Anthropic', merchant: OLD, label: 'Claude Pro' }, { provider: 'Other', merchant: NEW, label: 'Claude Pro' }]).size).toBe(0);
    expect(planGroups([{ provider: 'Anthropic', merchant: OLD, label: 'Claude Pro' }, { provider: 'Anthropic', merchant: NEW, label: 'Claude Max' }]).size).toBe(0);
    const g = planGroups(both);
    expect(g.size).toBe(2);
    expect(new Set(g.values()).size).toBe(1);
  });

  it('puts them together in the Charge types list, and leaves single types alone', () => {
    const list = listChargeTypes([...ledger, c('2026-10-03', 1050, 'Anthropic')], [], both, analyze(ledger, '2026-11-09').typeOf);
    const groups = groupChargeTypes(list);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ plan: 'Claude Pro', count: 16, totalCents: 16 * 2178, lastDate: '2026-10-06' });
    expect(groups[0].types.map((t) => t.merchant).sort()).toEqual([NEW, OLD].sort());
    expect(groups[1]).toMatchObject({ plan: null, count: 1 });
    // Their settings stay per charge type.
    expect(groups[0].types.every((t) => t.setting === null)).toBe(true);
  });

  it('is unchanged when no labels are shared', () => {
    const plain = analyze(ledger, '2026-11-09');
    const labelled = analyze(ledger, '2026-11-09', [], [], [{ provider: 'Anthropic', merchant: OLD, label: 'Old name' }, { provider: 'Anthropic', merchant: NEW, label: 'New name' }]);
    expect(labelled.report.active.map((s) => s.pattern.charges.length)).toEqual(plain.report.active.map((s) => s.pattern.charges.length));
    expect(labelled.report.stopped.length).toBe(plain.report.stopped.length);
  });

  it('adds a plan\'s newest charge, whichever descriptor it is under, to the month-end floor', () => {
    const renamed = [...ledger, c('2026-10-06', 2500, NEW)].filter((x, _i, all) => !(x.date === '2026-10-06' && x.amountCents === 2178 && all.some((y) => y.date === '2026-10-06' && y.amountCents === 2500)));
    const a = analyze(renamed, '2026-11-02', [], [], both);
    expect(a.expected).toMatchObject([{ provider: 'Anthropic', date: '2026-11-06', cents: 2500 }]);
  });
});
