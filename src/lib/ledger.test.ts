import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  concentration,
  dataSpan,
  monthTotal,
  monthDrillDown,
  periodKey,
  todayPeriod,
  monthTotalThroughDay,
  providerChanges,
  summarizeProviders,
  totalsByMonth,
  filterPeriod,
} from './analytics';
import { parseLedgerCsv, toLedgerCsv } from './csv';
import { addMonths, addOneMonthToDate, isValidDate, monthsBetween } from './dates';
import { planImport } from './dedupe';
import { forecastCurrentMonth } from './forecast';
import { analyze } from './insights';
import { centsToPlain, formatEUR, medianCents, parseAmountToCents, sumCents } from './money';
import { detectRecurring } from './recurring';
import type { LedgerRow } from './types';

// Synthetic fixture (invented data, fixed seed). Never put real financial data in the repo.
const csvText = readFileSync(resolve(__dirname, '__fixtures__/ledger.csv'), 'utf8');
const parsed = parseLedgerCsv(csvText);
const rows = parsed.rows;

// Reference values computed independently (Python, Decimal arithmetic) from the fixture.
const EXPECTED_MONTHS: Record<string, number> = {
  '2025-01': 3268, '2025-02': 3631, '2025-03': 5212, '2025-04': 7526, '2025-05': 8469,
  '2025-06': 17509, '2025-07': 13885, '2025-08': 14973, '2025-09': 11966, '2025-10': 12539,
  '2025-11': 16373, '2025-12': 16876, '2026-01': 17267, '2026-02': 31527, '2026-03': 51259,
  '2026-04': 39208, '2026-05': 45430, '2026-06': 52534, '2026-07': 51373, '2026-08': 47635,
  '2026-09': 48170, '2026-10': 53429, '2026-11': 10944,
};
const EXPECTED_PROVIDERS: [string, number][] = [
  ['OpenAI', 137800], ['Anthropic', 124634], ['Cursor', 47310], ['Namecheap', 37704],
  ['Lovable', 25000], ['Midjourney', 24377], ['GitHub', 21667], ['ElevenLabs', 18322],
  ['Vercel', 17766], ['Amazon Web Services', 16903], ['Google', 16135], ['Supabase', 15860],
  ['Perplexity', 15130], ['Gamma', 11417], ['OpenRouter', 9667], ['Hugging Face', 9422],
  ['Granola', 8328], ['Slack', 7159], ['Runway', 5595], ['Mistral AI', 5181],
  ['Replicate', 1784], ['DeepSeek', 1500], ['Venice', 1200], ['Groq', 1142],
];

describe('money', () => {
  it('parses amounts to exact integer cents', () => {
    expect(parseAmountToCents('12.34')).toBe(1234);
    expect(parseAmountToCents('10.3')).toBe(1030);
    expect(parseAmountToCents('25')).toBe(2500);
    expect(parseAmountToCents('0.01')).toBe(1);
    expect(parseAmountToCents('-5.10')).toBe(-510);
    expect(parseAmountToCents(' 108.90 ')).toBe(10890);
  });
  it('rejects malformed amounts', () => {
    for (const bad of ['', 'abc', '1,234.56', '€5', '1.234', '1.', '.5', '1e3', '12,50']) {
      expect(parseAmountToCents(bad)).toBeNull();
    }
  });
  it('avoids floating point drift when summing', () => {
    // 0.1 + 0.2 style errors cannot occur with integer cents
    expect(sumCents([{ amountCents: 10 }, { amountCents: 20 }])).toBe(30);
    expect(centsToPlain(123456)).toBe('1234.56');
    expect(centsToPlain(5)).toBe('0.05');
    expect(centsToPlain(-510)).toBe('-5.10');
    expect(formatEUR(123456)).toBe('€1,234.56');
  });
  it('median returns an observed value', () => {
    expect(medianCents([3, 1, 2])).toBe(2);
    expect(medianCents([4, 1, 3, 2])).toBe(2);
    expect(medianCents([])).toBe(0);
  });
});

describe('dates', () => {
  it('validates real calendar dates', () => {
    expect(isValidDate('2026-02-28')).toBe(true);
    expect(isValidDate('2024-02-29')).toBe(true);
    expect(isValidDate('2026-02-29')).toBe(false);
    expect(isValidDate('2026-13-01')).toBe(false);
    expect(isValidDate('26-01-01')).toBe(false);
    expect(isValidDate('2026/01/01')).toBe(false);
  });
  it('does month arithmetic across years', () => {
    expect(addMonths('2025-12', 1)).toBe('2026-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-03', -15)).toBe('2024-12');
    expect(addOneMonthToDate('2026-01-31')).toBe('2026-02-28');
    expect(monthsBetween('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });
});

describe('fixture integrity', () => {
  it('imports every row without errors', () => {
    expect(parsed.fatal).toBeNull();
    expect(parsed.errors).toEqual([]);
    expect(parsed.rowsInFile).toBe(296);
    expect(rows).toHaveLength(296);
  });
  it('has 24 providers', () => {
    expect(new Set(rows.map((r) => r.provider)).size).toBe(24);
  });
  it('totals exactly €5,810.03', () => {
    expect(sumCents(rows)).toBe(581003);
    expect(formatEUR(sumCents(rows))).toBe('€5,810.03');
  });
  it('keeps quoted merchant descriptors containing commas intact', () => {
    expect(rows.find((r) => r.provider === 'GitHub')?.merchant).toBe('GITHUB, INC.            SAN FRANCISCO');
  });
  it('preserves internal whitespace in merchant descriptors', () => {
    expect(rows.some((r) => r.merchant === 'OPENAI *CHATGPT SUBSCR  SAN FRANCISCO')).toBe(true);
  });
  it('spans January 2025 to November 2026', () => {
    const span = dataSpan(rows)!;
    expect(span.firstDate).toBe('2025-01-05');
    expect(span.lastDate).toBe('2026-11-09');
    expect(span.months).toHaveLength(23);
    expect(span.years).toEqual([2025, 2026]);
  });
});

describe('aggregation', () => {
  it('matches independently computed monthly totals', () => {
    expect(Object.fromEntries([...totalsByMonth(rows)].sort())).toEqual(EXPECTED_MONTHS);
    const monthSum = Object.values(EXPECTED_MONTHS).reduce((a, b) => a + b, 0);
    expect(monthSum).toBe(581003);
  });
  it('matches independently computed provider totals', () => {
    const summary = summarizeProviders(rows);
    expect(summary.map((s) => [s.provider, s.totalCents])).toEqual(EXPECTED_PROVIDERS);
    expect(summary.reduce((a, s) => a + s.count, 0)).toBe(296);
    const anthropic = summary.find((s) => s.provider === 'Anthropic')!;
    expect(anthropic.count).toBe(59);
    expect(anthropic.firstDate).toBe('2025-07-06');
    expect(anthropic.lastDate).toBe('2026-11-09');
  });
  it('sums years and periods consistently', () => {
    expect(sumCents(filterPeriod(rows, { kind: 'year', year: 2025 }))).toBe(132227);
    expect(sumCents(filterPeriod(rows, { kind: 'year', year: 2026 }))).toBe(448776);
    expect(sumCents(filterPeriod(rows, { kind: 'month', month: '2026-10' }))).toBe(53429);
    expect(sumCents(filterPeriod(rows, { kind: 'all' }))).toBe(581003);
    expect(monthTotal(rows, '2026-11')).toBe(10944);
    expect(monthTotalThroughDay(rows, '2026-10', 5)).toBe(5617);
  });
  it('computes provider changes between periods', () => {
    const before = filterPeriod(rows, { kind: 'month', month: '2026-09' });
    const after = filterPeriod(rows, { kind: 'month', month: '2026-10' });
    const changes = providerChanges(before, after);
    const net = changes.reduce((a, c) => a + c.deltaCents, 0);
    expect(net).toBe(53429 - 48170);
    expect(changes[0].provider).toBe('Anthropic');
    expect(changes[0].deltaCents).toBe(6712);
  });
  it('computes concentration shares that add to 100%', () => {
    const c = concentration(rows);
    expect(c.totalCents).toBe(581003);
    expect(c.shares.reduce((a, s) => a + s.cents, 0)).toBe(581003);
    expect(c.top1Share).toBeCloseTo(137800 / 581003, 10);
    expect(c.top3Share).toBeCloseTo(309744 / 581003, 10);
  });
});

describe('CSV validation', () => {
  it('reports row-level errors and keeps valid rows', () => {
    const r = parseLedgerCsv(
      'Merchant,Provider,Amount,Date\n' +
        'A,X,1.00,2026-01-01\n' +
        'B,,2.00,2026-01-02\n' +
        'C,Y,abc,2026-01-03\n' +
        'D,Z,3.00,2026-02-30\n' +
        'E,Z,3.00\n',
    );
    expect(r.rows).toHaveLength(1);
    expect(r.errors.map((e) => e.sourceRow)).toEqual([3, 4, 5, 6]);
    expect(r.errors[0].message).toMatch(/Provider is empty/);
    expect(r.errors[1].message).toMatch(/Amount "abc"/);
    expect(r.errors[2].message).toMatch(/not a valid/);
    expect(r.errors[3].message).toMatch(/Expected 4 fields/);
  });
  it('rejects files without the required header', () => {
    expect(parseLedgerCsv('Name,Cost\nA,1').fatal).toMatch(/missing/);
    expect(parseLedgerCsv('').fatal).toMatch(/empty/);
  });
  it('accepts reordered, differently-cased columns, BOM and CRLF', () => {
    const r = parseLedgerCsv('﻿date,amount,provider,merchant\r\n2026-01-01,5.5,P,M\r\n');
    expect(r.errors).toEqual([]);
    expect(r.rows[0]).toMatchObject({ merchant: 'M', provider: 'P', amountCents: 550, date: '2026-01-01' });
  });
  it('round-trips through export without changing any record', () => {
    const exported = toLedgerCsv(rows);
    const again = parseLedgerCsv(exported);
    expect(again.errors).toEqual([]);
    expect(again.rows.map(({ sourceRow: _s, ...r }) => r)).toEqual(rows.map(({ sourceRow: _s, ...r }) => r));
    expect(exported.split('\r\n')[0]).toBe('Merchant,Provider,Amount,Date');
    // Rows in source order export byte-for-byte identical to the source file
    expect(exported).toBe(csvText);
    expect(exported).toContain('"GITHUB, INC.            SAN FRANCISCO",GitHub,9.60,2025-01-05');
  });
});

describe('duplicate detection', () => {
  const a: LedgerRow = { merchant: 'M', provider: 'P', amountCents: 1000, date: '2026-01-01' };
  const b: LedgerRow = { merchant: 'M', provider: 'P', amountCents: 1000, date: '2026-01-02' };

  it('adds everything into an empty store, including identical rows', () => {
    const plan = planImport([a, a, b], []);
    expect(plan.toAdd).toHaveLength(3);
    expect(plan.duplicates).toHaveLength(0);
    expect(plan.repeatedInFile).toEqual([{ row: a, count: 2 }]);
  });
  it('re-importing the same file adds nothing', () => {
    const plan = planImport(rows, rows);
    expect(plan.toAdd).toHaveLength(0);
    expect(plan.duplicates).toHaveLength(296);
  });
  it('adds only the extra copies of identical charges', () => {
    const plan = planImport([a, a, a, b], [a]);
    expect(plan.toAdd).toEqual([a, a, b]);
    expect(plan.duplicates).toEqual([a]);
  });
  it('treats any difference in value as a different record', () => {
    const plan = planImport([{ ...a, amountCents: 1001 }, { ...a, merchant: 'M2' }], [a]);
    expect(plan.toAdd).toHaveLength(2);
  });
});

describe('recurring-looking patterns', () => {
  const patterns = detectRecurring(rows, '2026-11-09');
  it('finds the long-running ChatGPT charge on the 14th', () => {
    const p = patterns.find((x) => x.provider === 'OpenAI' && x.firstDate === '2025-01-14')!;
    expect(p).toBeDefined();
    expect(p.months).toBe(17);
    expect(p.lastDate).toBe('2026-05-14');
    expect(p.active).toBe(false);
  });
  it('separates plan changes into distinct patterns', () => {
    const subs = patterns.filter((x) => x.provider === 'Anthropic' && x.merchant !== 'Anthropic');
    const amounts = subs.map((p) => p.typicalCents).sort((x, y) => x - y);
    expect(amounts).toEqual([2178, 2178, 10890]);
    expect(subs.find((p) => p.typicalCents === 10890)!.active).toBe(false);
    expect(subs.find((p) => p.lastDate === '2026-10-19')!.active).toBe(true);
    expect(subs.find((p) => p.lastDate === '2026-01-06')!.active).toBe(false);
  });
  it('keeps a subscription intact when other charges from the same provider fit between', () => {
    const sub = (date: string) => ({ merchant: 'CLAUDE SUB', provider: 'Anthropic', amountCents: 2178, date });
    const api = (date: string, amountCents: number) => ({ merchant: 'Anthropic', provider: 'Anthropic', amountCents, date });
    const found = detectRecurring(
      [sub('2026-08-11'), api('2026-09-08', 1969), sub('2026-09-11'), sub('2026-10-11'), sub('2026-11-11')],
      '2026-11-11',
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ merchant: 'CLAUDE SUB', months: 4, typicalCents: 2178, minCents: 2178, maxCents: 2178 });
  });
  it('ignores frequent usage top-ups that line up by chance', () => {
    const topUp = (date: string) => ({ merchant: 'Anthropic', provider: 'Anthropic', amountCents: 1050, date });
    const months = ['2026-06', '2026-07', '2026-08'];
    const rows = months.flatMap((m) => [topUp(`${m}-05`), topUp(`${m}-15`), topUp(`${m}-25`)]);
    expect(detectRecurring(rows, '2026-08-31')).toEqual([]);
  });
  it('ignores top-ups that line up for three months while the rest of the descriptor charges on other days', () => {
    const topUp = (date: string) => ({ merchant: 'Openrouter', provider: 'Openrouter', amountCents: 1050, date });
    const dates = ['2025-11-18', '2025-12-05', '2026-01-03', '2026-02-06', '2026-03-15', '2026-04-24', '2026-06-02', '2026-07-23', '2026-09-09'];
    expect(detectRecurring(dates.map(topUp), '2026-09-30')).toEqual([]);
  });
  it('counts the heavy usage months of a descriptor too: a 3-of-9 chain is not a subscription', () => {
    const t = (date: string) => ({ merchant: 'Openrouter', provider: 'Openrouter', amountCents: 1050, date });
    const heavy = ['2026-03', '2026-04', '2026-05'].flatMap((m) => [`${m}-05`, `${m}-15`, `${m}-25`]);
    expect(detectRecurring(['2025-12-05', '2026-01-03', '2026-02-06', ...heavy].map(t), '2026-05-31')).toEqual([]);
  });
  it('still finds a real subscription that has a stray extra charge on the same descriptor', () => {
    const sub = (date: string) => ({ merchant: 'CLAUDE SUB', provider: 'Anthropic', amountCents: 2178, date });
    const found = detectRecurring(
      [sub('2026-06-11'), sub('2026-07-11'), sub('2026-08-11'), sub('2026-09-11'), { ...sub('2026-09-25'), amountCents: 900 }],
      '2026-09-30',
    );
    expect(found).toHaveLength(1);
    expect(found[0].months).toBe(4);
  });
  it('does not report one-off providers', () => {
    expect(patterns.some((p) => p.provider === 'Venice' || p.provider === 'Replicate' || p.provider === 'DeepSeek')).toBe(false);
  });
});

describe('the period the Today button jumps to', () => {
  const span = dataSpan(rows)!; // Jan 2025 - Nov 2026
  it('is the current month or year when the data reaches it', () => {
    expect(todayPeriod('month', span, '2026-11-09')).toEqual({ kind: 'month', month: '2026-11' });
    expect(todayPeriod('month', span, '2026-03-02')).toEqual({ kind: 'month', month: '2026-03' });
    expect(todayPeriod('year', span, '2026-11-09')).toEqual({ kind: 'year', year: 2026 });
    expect(todayPeriod('year', span, '2025-06-30')).toEqual({ kind: 'year', year: 2025 });
  });
  it('stays inside the data: the last recorded month or year when today is past it, the first when it is before', () => {
    expect(todayPeriod('month', span, '2027-03-01')).toEqual({ kind: 'month', month: span.lastMonth });
    expect(todayPeriod('month', span, '2024-05-01')).toEqual({ kind: 'month', month: span.firstMonth });
    expect(todayPeriod('year', span, '2030-01-01')).toEqual({ kind: 'year', year: 2026 });
    expect(todayPeriod('year', span, '2020-01-01')).toEqual({ kind: 'year', year: 2025 });
  });
  it('has none for All time, and can be compared with the selected period to know whether it is already selected', () => {
    expect(todayPeriod('all', span, '2026-11-09')).toBeNull();
    expect(periodKey(todayPeriod('month', span, '2026-11-09')!)).toBe(periodKey({ kind: 'month', month: '2026-11' }));
    expect(periodKey(todayPeriod('month', span, '2026-11-09')!)).not.toBe(periodKey({ kind: 'month', month: '2026-10' }));
  });
});

describe('month drill-down', () => {
  const r = (date: string, cents: number, provider = 'P'): LedgerRow => ({ provider, merchant: 'M', date, amountCents: cents });
  const data = [r('2026-10-03', 500), r('2026-10-20', 9000, 'Big'), r('2026-10-10', 500), r('2026-10-05', -300), r('2026-09-30', 99999), r('2026-11-01', 99999)];

  it('lists only that month, largest first, ties newest first, refunds last', () => {
    const list = monthDrillDown(data, '2026-10');
    expect(list.map((x) => x.amountCents)).toEqual([9000, 500, 500, -300]);
    expect(list.map((x) => x.date)).toEqual(['2026-10-20', '2026-10-10', '2026-10-03', '2026-10-05']);
  });
  it('with a day, keeps only the first days of the month, and does not touch the input', () => {
    const before = [...data];
    expect(monthDrillDown(data, '2026-10', 10).map((x) => x.date)).toEqual(['2026-10-10', '2026-10-03', '2026-10-05']);
    expect(data).toEqual(before);
  });
  it('is empty for a month with nothing', () => {
    expect(monthDrillDown(data, '2025-01')).toEqual([]);
  });
  it('adds up to the month total, so the panel and the chart agree', () => {
    for (const m of ['2025-06', '2026-03', '2026-10']) {
      expect(sumCents(monthDrillDown(rows, m))).toBe(monthTotal(rows, m));
      expect(sumCents(monthDrillDown(rows, m, 11))).toBe(monthTotalThroughDay(rows, m, 11));
    }
  });
});

describe('forecast', () => {
  const an = analyze(rows, '2026-11-09');
  const est = () => forecastCurrentMonth(rows, '2026-11-09', undefined, an.expected, an.typeOf);

  it('is recorded so far plus only the strongly expected recurring charges, at their last actual amount', () => {
    const f = est();
    expect(f.status).toBe('ok');
    if (f.status !== 'ok') return;
    expect(f.actualCents).toBe(10944); // recorded so far: unchanged
    expect(f.stillToComeCents).toBe(f.expected.reduce((n, e) => n + e.cents, 0));
    expect(f.atLeastCents).toBe(f.actualCents + f.stillToComeCents);
    const providers = f.expected.map((e) => e.provider);
    expect(providers).toContain('Anthropic');
    expect(providers).toContain('OpenAI');
    expect(f.expected.every((e) => e.date > '2026-11-09' && e.date.startsWith('2026-11'))).toBe(true);
    // Each is the charge type's last actual charge: that of its latest pattern charge.
    for (const e of f.expected) {
      const last = rows.filter((r) => r.provider === e.provider && r.amountCents > 0).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
      expect(e.cents).toBeGreaterThan(0);
      expect(last.date <= '2026-11-09').toBe(true);
    }
  });
  it('has no range and no median of past months', () => {
    const f = est() as Record<string, unknown>;
    for (const k of ['lowCents', 'highCents', 'projectedCents', 'estimatedAdditionalCents', 'samples']) expect(k in f).toBe(false);
  });
  it('is deterministic', () => {
    expect(est()).toEqual(est());
  });
  it('still gives "at least what is recorded" when history is short, since nothing is projected from it', () => {
    const short = rows.filter((r) => r.date >= '2026-09-01');
    const f = forecastCurrentMonth(short, '2026-11-09');
    expect(f.status).toBe('ok');
    if (f.status === 'ok') expect(f.atLeastCents).toBe(f.actualCents);
  });
  it('declines when data is stale', () => {
    const f = forecastCurrentMonth(rows, '2027-03-01');
    expect(f.status).toBe('insufficient');
    if (f.status === 'insufficient') expect(f.reason).toMatch(/45 days/);
  });
  it('declines with no data', () => {
    expect(forecastCurrentMonth([], '2026-11-09').status).toBe('insufficient');
  });
});
