import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseLedgerCsv } from './csv';
import { clearAll, closeDb, loadSetting, saveSetting } from './db';
import { forecastCurrentMonth } from './forecast';
import { analyze } from './insights';
import { normalizeOverrides, overrideMap, overrideOf, streamSize, withOverride, type Override } from './overrides';
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

describe('override helpers', () => {
  it('sets, replaces and removes an override per stream', () => {
    let list: Override[] = [];
    list = withOverride(list, 'A', 'x', 'usage');
    list = withOverride(list, 'A', 'y', 'ignore');
    list = withOverride(list, 'A', 'x', 'subscription');
    expect(list).toHaveLength(2);
    expect(overrideOf(overrideMap(list), { provider: 'A', merchant: 'x' })).toBe('subscription');
    expect(withOverride(list, 'A', 'x', null)).toEqual([{ provider: 'A', merchant: 'y', kind: 'ignore' }]);
  });

  it('counts how many charges a change affects, and only exact descriptors', () => {
    const data = [charge('2026-01-01', 1), charge('2026-02-01', 1), charge('2026-02-01', 1, 'Anthropic', 'Anthropic')];
    expect(streamSize(data, 'Anthropic', 'ANTHROPIC* CLAUDE SUB')).toBe(2);
    expect(streamSize(data, 'Anthropic', 'Anthropic')).toBe(1);
  });

  it('cleans what it reads back from storage', () => {
    expect(
      normalizeOverrides([
        { provider: 'B', merchant: 'm', kind: 'usage', extra: 1 },
        { provider: 'A', merchant: 'm', kind: 'ignore' },
        { provider: 'A', merchant: 'm', kind: 'subscription' }, // later duplicate wins
        { provider: 'C', merchant: 'm', kind: 'delete-everything' },
        { provider: '', merchant: 'm', kind: 'usage' },
        'junk',
      ]),
    ).toEqual([
      { provider: 'A', merchant: 'm', kind: 'subscription' },
      { provider: 'B', merchant: 'm', kind: 'usage' },
    ]);
    expect(normalizeOverrides(null)).toEqual([]);
  });
});

describe('usage only', () => {
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
      expect(a.categoryOf(r)).toBe('api');
    }
    expect(a.report.monthlyCents).toBeLessThan(base.report.monthlyCents);
  });

  it('never changes what was spent', () => {
    expect(sumCents(rows)).toBe(581003);
    expect(a.report.priceChanges.find((c) => c.provider === 'OpenAI' && c.kind === 'plan')).toBeUndefined();
  });
});

describe('ignore', () => {
  const stream = streamOf('Perplexity', /PERPLEXITY/);
  const a = analyze(rows, TODAY, [{ ...stream, kind: 'ignore' }]);

  it('drops the entry from stopped and active lists but keeps its category', () => {
    expect(analyze(rows, TODAY).report.stopped.map((s) => s.provider)).toContain('Perplexity');
    expect(a.report.stopped.map((s) => s.provider)).not.toContain('Perplexity');
    expect(a.report.active.map((s) => s.provider)).not.toContain('Perplexity');
    expect(a.patterns.find((p) => p.provider === 'Perplexity')).toBeUndefined();
    const r = rows.find((x) => x.provider === 'Perplexity')!;
    expect(a.fixed.has(r)).toBe(false);
    expect(a.categoryOf(r)).toBe('chat');
  });

  it('is respected by the month-end estimate list too', () => {
    const lovable = streamOf('Lovable', /LOVABLE/);
    const withLovable = analyze(rows, TODAY);
    const without = analyze(rows, TODAY, [{ ...lovable, kind: 'ignore' }]);
    const up = (an: typeof withLovable) => {
      const f = forecastCurrentMonth(rows, TODAY, undefined, an.patterns);
      return f.status === 'ok' ? f.upcoming.map((p) => p.provider) : [];
    };
    expect(up(withLovable)).toContain('Lovable');
    expect(up(without)).not.toContain('Lovable');
  });
});

describe('monthly subscription', () => {
  it('counts a stream detection would miss, with a note that the user marked it', () => {
    const data = [charge('2026-09-14', 1500, 'Acme', 'ACME'), charge('2026-10-30', 1500, 'Acme', 'ACME')]; // two charges, uneven spacing
    expect(analyze(data, '2026-11-05').report.active).toEqual([]);
    const a = analyze(data, '2026-11-05', [{ provider: 'Acme', merchant: 'ACME', kind: 'subscription' }]);
    expect(a.report.active).toHaveLength(1);
    expect(a.report.active[0]).toMatchObject({ provider: 'Acme', monthlyCents: 1500, yearlyCents: 18000 });
    expect(a.report.active[0].notes).toContain('You marked this as a monthly subscription');
    expect(a.report.monthlyCents).toBe(1500);
    for (const c of data) expect(a.fixed.has(c)).toBe(true);
  });

  it('shows a forced stream that stopped as stopped, not active', () => {
    // "Stopped" is judged against the newest charge in the ledger, so something later must exist.
    const data = [charge('2026-01-05', 900, 'Acme', 'ACME'), charge('2026-05-20', 100, 'Other', 'OTHER')];
    const a = analyze(data, '2026-06-01', [{ provider: 'Acme', merchant: 'ACME', kind: 'subscription' }]);
    expect(a.report.active).toEqual([]);
    expect(a.report.stopped).toHaveLength(1);
  });

  it('fixes the run-rate dropout after a plan switch: marking the stream keeps it counted at the new price', () => {
    const pro = ['2026-06-06', '2026-07-06', '2026-08-06', '2026-09-06', '2026-10-06'].map((d) => charge(d, 2178));
    const data = [...pro, charge('2026-12-06', 10890)];
    const before = analyze(data, '2026-12-07').report;
    expect(before.monthlyCents).toBe(0); // the gap this feature exists to cover
    const after = analyze(data, '2026-12-07', [{ provider: 'Anthropic', merchant: 'ANTHROPIC* CLAUDE SUB', kind: 'subscription' }]).report;
    expect(after.monthlyCents).toBe(10890);
    expect(after.stopped).toEqual([]);
    expect(after.priceChanges[0]).toMatchObject({ kind: 'step', fromCents: 2178, toCents: 10890 });
  });

  it('ignores refunds when building the stream', () => {
    const data = [charge('2026-10-05', 1000, 'Acme', 'ACME'), charge('2026-10-20', -1000, 'Acme', 'ACME')];
    const a = analyze(data, '2026-11-01', [{ provider: 'Acme', merchant: 'ACME', kind: 'subscription' }]);
    expect(a.report.active[0].monthlyCents).toBe(1000);
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
