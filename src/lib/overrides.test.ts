import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseLedgerCsv } from './csv';
import { clearAll, closeDb, loadSetting, saveSetting } from './db';
import { forecastCurrentMonth } from './forecast';
import { analyze, YEARLY_GRACE_DAYS } from './insights';
import {
  normalizeOverrides,
  overrideMap,
  overrideOf,
  typePill,
  streamSize,
  typeLabel,
  withOverride,
  type Override,
} from './overrides';
import { sumCents } from './money';
import type { LedgerRow } from './types';

const rows = parseLedgerCsv(readFileSync(resolve(__dirname, '__fixtures__/ledger.csv'), 'utf8')).rows;
const TODAY = '2026-11-09';
const streamOf = (provider: string, test: RegExp) => {
  const r = rows.find((x) => x.provider === provider && test.test(x.merchant));
  if (!r) throw new Error(`no ${provider} stream`);
  return { provider, merchant: r.merchant };
};
const charge = (date: string, cents: number, provider = 'Anthropic', merchant = 'ANTHROPIC* CLAUDE SUB'): LedgerRow => ({ provider, merchant, date, amountCents: cents });
/** A ledger needs something recent from someone else, because "stopped" and "overdue" are judged against the newest charge. */
const later = (date: string) => charge(date, 100, 'Other', 'OTHER');

describe('override helpers', () => {
  it('sets, replaces and removes an override per stream', () => {
    let list: Override[] = [];
    list = withOverride(list, 'A', 'x', 'usage');
    list = withOverride(list, 'A', 'y', 'other');
    list = withOverride(list, 'A', 'x', 'monthly');
    expect(list).toHaveLength(2);
    expect(overrideOf(overrideMap(list), { provider: 'A', merchant: 'x' })).toBe('monthly');
    expect(withOverride(list, 'A', 'x', null)).toEqual([{ provider: 'A', merchant: 'y', kind: 'other' }]);
  });

  it('counts how many charges a change affects, and only exact descriptors', () => {
    const data = [charge('2026-01-01', 1), charge('2026-02-01', 1), charge('2026-02-01', 1, 'Anthropic', 'Anthropic')];
    expect(streamSize(data, 'Anthropic', 'ANTHROPIC* CLAUDE SUB')).toBe(2);
    expect(streamSize(data, 'Anthropic', 'Anthropic')).toBe(1);
  });

  it('cleans what it reads back from storage and converts corrections saved by earlier versions', () => {
    expect(
      normalizeOverrides([
        { provider: 'B', merchant: 'm', kind: 'usage', extra: 1 },
        { provider: 'A', merchant: 'm', kind: 'ignore' }, // earlier version
        { provider: 'A', merchant: 'm', kind: 'subscription' }, // earlier version; later duplicate wins
        { provider: 'D', merchant: 'm', kind: 'yearly' },
        { provider: 'C', merchant: 'm', kind: 'delete-everything' },
        { provider: '', merchant: 'm', kind: 'usage' },
        'junk',
      ]),
    ).toEqual([
      { provider: 'A', merchant: 'm', kind: 'monthly' },
      { provider: 'B', merchant: 'm', kind: 'usage' },
      { provider: 'D', merchant: 'm', kind: 'yearly' },
    ]);
    expect(normalizeOverrides([{ provider: 'A', merchant: 'm', kind: 'ignore' }])).toEqual([{ provider: 'A', merchant: 'm', kind: 'other' }]);
    expect(normalizeOverrides(null)).toEqual([]);
  });

  it('labels types for people', () => {
    expect(typeLabel({ kind: 'subscription', cadence: 'yearly', source: 'you' })).toBe('Subscription · yearly');
    expect(typeLabel({ kind: 'subscription', source: 'import' })).toBe('Subscription');
    expect(typeLabel({ kind: 'other', source: 'single' })).toBe('One-time / Other');
  });
});

describe('usage', () => {
  const stream = streamOf('OpenAI', /SUBSCR/);
  const base = analyze(rows, TODAY);
  const a = analyze(rows, TODAY, [{ ...stream, kind: 'usage' }]);

  it('removes the stream from subscriptions and counts it as usage', () => {
    expect(base.report.active.map((s) => s.provider)).toContain('OpenAI');
    expect(a.report.active.map((s) => s.provider)).not.toContain('OpenAI');
    const flagged = rows.filter((r) => r.provider === stream.provider && r.merchant === stream.merchant);
    expect(flagged.length).toBeGreaterThan(5);
    for (const r of flagged) {
      expect(a.fixed.has(r)).toBe(false);
      expect(a.typeOf(r)).toMatchObject({ kind: 'usage', source: 'you' });
      expect(a.categoryOf(r)).toBe('api');
    }
    expect(a.report.monthlyCents).toBeLessThan(base.report.monthlyCents);
  });

  it('never changes what was spent', () => {
    expect(sumCents(rows)).toBe(581003);
    expect(a.report.priceChanges.find((c) => c.provider === 'OpenAI' && c.kind === 'plan')).toBeUndefined();
  });
});

describe('one-time / other', () => {
  const stream = streamOf('Perplexity', /PERPLEXITY/);
  const a = analyze(rows, TODAY, [{ ...stream, kind: 'other' }]);

  it('drops the entry from the subscription lists but keeps its category', () => {
    expect(analyze(rows, TODAY).report.stopped.map((s) => s.provider)).toContain('Perplexity');
    expect(a.report.stopped.map((s) => s.provider)).not.toContain('Perplexity');
    expect(a.report.active.map((s) => s.provider)).not.toContain('Perplexity');
    expect(a.patterns.find((p) => p.provider === 'Perplexity')).toBeUndefined();
    const r = rows.find((x) => x.provider === 'Perplexity')!;
    expect(a.fixed.has(r)).toBe(false);
    expect(a.typeOf(r)).toMatchObject({ kind: 'other', source: 'you' });
    expect(a.categoryOf(r)).toBe('chat');
  });

  it('is respected by the month-end estimate list too', () => {
    const lovable = streamOf('Lovable', /LOVABLE/);
    const withLovable = analyze(rows, TODAY);
    const without = analyze(rows, TODAY, [{ ...lovable, kind: 'other' }]);
    const up = (an: typeof withLovable) => {
      const f = forecastCurrentMonth(rows, TODAY, undefined, an.expected, an.typeOf);
      return f.status === 'ok' ? f.expected.map((e) => e.provider) : [];
    };
    expect(up(withLovable)).toContain('Lovable');
    expect(up(without)).not.toContain('Lovable');
  });
});

describe('monthly subscription', () => {
  it('counts a stream detection would miss, with a note that the user marked it', () => {
    const data = [charge('2026-09-14', 1500, 'Acme', 'ACME'), charge('2026-10-30', 1500, 'Acme', 'ACME')]; // two charges, uneven spacing
    expect(analyze(data, '2026-11-05').report.active).toEqual([]);
    const a = analyze(data, '2026-11-05', [{ provider: 'Acme', merchant: 'ACME', kind: 'monthly' }]);
    expect(a.report.active).toHaveLength(1);
    expect(a.report.active[0]).toMatchObject({ provider: 'Acme', cadence: 'monthly', monthlyCents: 1500, yearlyCents: 18000, billedCents: 1500 });
    expect(a.report.active[0].notes).toContain('You marked this as a monthly subscription');
    expect(a.report.monthlyCents).toBe(1500);
    for (const c of data) expect(a.fixed.has(c)).toBe(true);
  });

  it('shows a forced stream that stopped as stopped, not active', () => {
    const data = [charge('2026-01-05', 900, 'Acme', 'ACME'), later('2026-05-20')];
    const a = analyze(data, '2026-06-01', [{ provider: 'Acme', merchant: 'ACME', kind: 'monthly' }]);
    expect(a.report.active).toEqual([]);
    expect(a.report.stopped).toHaveLength(1);
  });

  it('keeps the run-rate after a plan switch without any correction: the new price counts from its first charge', () => {
    const pro = ['2026-06-06', '2026-07-06', '2026-08-06', '2026-09-06', '2026-10-06'].map((d) => charge(d, 2178));
    const data = [...pro, charge('2026-12-06', 10890)];
    const r = analyze(data, '2026-12-07').report;
    expect(r.monthlyCents).toBe(10890);
    expect(r.active).toHaveLength(1);
    expect(r.active[0].pattern.provisional).toBe(true);
    expect(r.active[0].notes.join(' ')).toContain('New price seen once');
    // the old pattern is shown as replaced, not stopped
    expect(r.stopped).toEqual([]);
    expect(r.priceChanges[0]).toMatchObject({ kind: 'plan', fromCents: 2178, toCents: 10890 });
  });

  it('counts the new price once when the switch lands on the usual billing day', () => {
    const pro = ['2026-07-06', '2026-08-06', '2026-09-06', '2026-10-06'].map((d) => charge(d, 2178));
    const r = analyze([...pro, charge('2026-11-06', 10890), later('2026-11-08')], '2026-11-08').report;
    expect(r.monthlyCents).toBe(10890); // not 2178 + 10890
    expect(r.stopped).toEqual([]);
  });

  it('finds the new plan even when an unrelated charge on the same descriptor comes first', () => {
    const old = ['2026-01-06', '2026-02-06', '2026-03-06'].map((d) => charge(d, 2000));
    const data = [...old, charge('2026-04-02', 1000), charge('2026-04-15', 10000), charge('2026-05-15', 10000)];
    const r = analyze(data, '2026-05-16').report;
    expect(r.monthlyCents).toBe(10000);
    expect(r.active).toHaveLength(1);
    expect(r.active[0].pattern.charges.map((c) => c.amountCents)).toEqual([10000, 10000]);
    expect(r.stopped).toEqual([]);
    expect(r.priceChanges[0]).toMatchObject({ kind: 'plan', fromCents: 2000, toCents: 10000 });
  });

  it('turns into an ordinary pattern once three charges confirm the new price', () => {
    const pro = ['2026-04-06', '2026-05-06', '2026-06-06', '2026-07-06'].map((d) => charge(d, 2178));
    const max = ['2026-08-06', '2026-09-06', '2026-10-06'].map((d) => charge(d, 10890));
    const a = analyze([...pro, ...max], '2026-10-07');
    expect(a.patterns.some((p) => p.provisional)).toBe(false);
    expect(a.report.monthlyCents).toBe(10890);
  });

  it('does not invent a subscription from a lone charge that nothing followed', () => {
    const pro = ['2026-01-06', '2026-02-06', '2026-03-06', '2026-04-06'].map((d) => charge(d, 2178));
    const r = analyze([...pro, charge('2026-06-06', 10890), later('2026-11-01')], '2026-11-02').report;
    expect(r.active).toEqual([]);
    expect(r.stopped).toHaveLength(1);
  });

  it('does not chain a different descriptor of the same provider as a plan switch', () => {
    const pro = ['2026-06-06', '2026-07-06', '2026-08-06', '2026-09-06'].map((d) => charge(d, 2178));
    const r = analyze([...pro, charge('2026-10-06', 5000, 'Anthropic', 'Anthropic'), later('2026-10-08')], '2026-10-08').report;
    expect(r.active.some((s) => s.pattern.provisional)).toBe(false);
  });

  it('still lets you set the type yourself: marking the stream keeps it counted at the new price', () => {
    const pro = ['2026-06-06', '2026-07-06', '2026-08-06', '2026-09-06', '2026-10-06'].map((d) => charge(d, 2178));
    const data = [...pro, charge('2026-12-06', 10890)];
    const after = analyze(data, '2026-12-07', [{ provider: 'Anthropic', merchant: 'ANTHROPIC* CLAUDE SUB', kind: 'monthly' }]).report;
    expect(after.monthlyCents).toBe(10890);
    expect(after.stopped).toEqual([]);
    expect(after.priceChanges[0]).toMatchObject({ kind: 'plan', fromCents: 2178, toCents: 10890 }); // reported as automatic detection reports it
  });

  it('ignores refunds when building the stream', () => {
    const data = [charge('2026-10-05', 1000, 'Acme', 'ACME'), charge('2026-10-20', -1000, 'Acme', 'ACME')];
    const a = analyze(data, '2026-11-01', [{ provider: 'Acme', merchant: 'ACME', kind: 'monthly' }]);
    expect(a.report.active[0].monthlyCents).toBe(1000);
  });
});

describe('yearly subscription (always set by the user)', () => {
  const gh = (date: string, cents = 12000) => charge(date, cents, 'GitHub', 'GITHUB, INC.');
  const yearly: Override[] = [{ provider: 'GitHub', merchant: 'GITHUB, INC.', kind: 'yearly' }];

  it('is never detected from the data, however regular it looks', () => {
    const data = [gh('2024-03-10'), gh('2025-03-10'), gh('2026-03-10'), later('2026-11-01')];
    expect(analyze(data, '2026-11-02').report.active).toEqual([]);
    expect(analyze(data, '2026-11-02').patterns).toEqual([]);
  });

  it('counts a twelfth per month and the full amount per year, and estimates the next renewal a year on', () => {
    const data = [gh('2026-03-10'), later('2026-11-01')];
    const s = analyze(data, '2026-11-02', yearly).report.active[0];
    expect(s).toMatchObject({ cadence: 'yearly', billedCents: 12000, monthlyCents: 1000, yearlyCents: 12000 });
    expect(s.renewal).toEqual({ expected: '2027-03-10', confirmed: false, overdue: false });
    expect(s.notes).toContain('You marked this as a yearly subscription');
  });

  it('adds the monthly equivalent to the run-rate and the whole renewal to the 30-day calendar when it is near', () => {
    const data = [charge('2026-01-02', 500, 'Acme', 'ACME'), gh('2025-11-20'), later('2026-11-01')];
    const r = analyze(data, '2026-11-02', yearly).report;
    expect(r.monthlyCents).toBe(1000);
    expect(r.upcoming).toEqual([
      { date: '2026-11-20', provider: 'GitHub', merchant: 'GITHUB, INC.', cents: 12000, cadence: 'yearly', estimated: true, overdue: false },
    ]);
    expect(r.upcomingCents).toBe(12000);
    // a renewal five months out is not in the next 30 days
    expect(analyze([gh('2026-06-10'), later('2026-11-01')], '2026-11-02', yearly).report.upcoming).toEqual([]);
  });

  it('is not reported as stopped when the date passes: it shows as overdue until the grace is over', () => {
    const data = (today: string) => [gh('2025-03-10'), later(today)];
    const justAfter = analyze(data('2026-03-20'), '2026-03-20', yearly).report;
    expect(justAfter.stopped).toEqual([]);
    expect(justAfter.active[0].renewal).toMatchObject({ expected: '2026-03-10', overdue: true });
    expect(justAfter.upcoming[0]).toMatchObject({ date: '2026-03-10', overdue: true, estimated: true });
    const pastGrace = analyze(data('2026-06-01'), '2026-06-01', yearly).report;
    expect(YEARLY_GRACE_DAYS).toBe(60);
    expect(pastGrace.active).toEqual([]);
    expect(pastGrace.stopped).toHaveLength(1);
    expect(pastGrace.stopped[0]).toMatchObject({ cadence: 'yearly', provider: 'GitHub' });
  });

  it('turns the estimate into an observed renewal, and resets the clock, when a renewal charge shows up', () => {
    const data = [gh('2025-03-10', 12000), gh('2026-03-14', 13200), later('2026-11-01')];
    const s = analyze(data, '2026-11-02', yearly).report.active[0];
    expect(s.billedCents).toBe(13200);
    expect(s.renewal).toEqual({ expected: '2027-03-14', confirmed: true, overdue: false });
    expect(analyze(data, '2026-11-02', yearly).report.priceChanges[0]).toMatchObject({ provider: 'GitHub', fromCents: 12000, toCents: 13200 });
  });

  it('does not treat a yearly and a monthly stream of one provider as a plan switch', () => {
    const data = [
      gh('2026-03-10'),
      ...['2026-04-12', '2026-05-12', '2026-06-12', '2026-07-12'].map((d) => charge(d, 900, 'GitHub', 'GITHUB COPILOT')),
      later('2026-08-01'),
    ];
    const r = analyze(data, '2026-08-02', yearly).report;
    expect(r.priceChanges.filter((c) => c.kind === 'plan')).toEqual([]);
    expect(r.active.map((s) => s.cadence).sort()).toEqual(['monthly', 'yearly']);
  });
});

describe('storage', () => {
  beforeEach(async () => {
    await clearAll();
  });

  it('keeps overrides across a reload and removes them with the rest of the local data', async () => {
    const list: Override[] = [{ provider: 'A', merchant: 'm', kind: 'usage' }];
    await saveSetting('overrides', list);
    await closeDb();
    expect(normalizeOverrides(await loadSetting('overrides'))).toEqual(list);
    await clearAll();
    expect(await loadSetting('overrides')).toBeUndefined();
  });
});

describe('the type pill in a list', () => {
  it('shows a confirmed type as it is, a suggestion muted with "Suggested:", and a guess of one-time or an unknown as nothing', () => {
    expect(typePill({ kind: 'subscription', cadence: 'monthly', source: 'you' })).toEqual({ text: 'Subscription · monthly', confirmed: true });
    expect(typePill({ kind: 'other', source: 'you' })).toEqual({ text: 'One-time / Other', confirmed: true });
    expect(typePill({ kind: 'subscription', cadence: 'monthly', source: 'pattern' })).toEqual({ text: 'Suggested: Subscription · monthly', confirmed: false });
    expect(typePill({ kind: 'usage', source: 'repeats' })).toEqual({ text: 'Suggested: Usage', confirmed: false });
    // Never One-time / Other for something nobody decided.
    expect(typePill({ kind: 'other', source: 'single' })).toBeNull();
    expect(typePill({ kind: 'other', source: 'import' })).toBeNull();
  });

  it('follows what analyze decides for real charges', () => {
    const data = [charge('2026-11-04', 9000, 'Cert', 'CERT EXAM')];
    const guessed = analyze(data, '2026-11-09');
    expect(typePill(guessed.typeOf(data[0]))).toBeNull();
    const confirmed = analyze(data, '2026-11-09', [{ provider: 'Cert', merchant: 'CERT EXAM', kind: 'other' }]);
    expect(typePill(confirmed.typeOf(data[0]))).toEqual({ text: 'One-time / Other', confirmed: true });
  });
});
