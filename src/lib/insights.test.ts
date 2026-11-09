import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { evaluateBudgets, normalizeBudgets } from './budgets';
import { CATEGORIES, categoryOf, knownProvider } from './categories';
import { parseLedgerCsv, toLedgerCsv } from './csv';
import { clearAll, closeDb, commitImport, loadAll, loadSetting, saveSetting, setTags } from './db';
import { VENDORS } from './extract/vendors';
import {
  analyze,
  fixedVariableByMonth,
  fixedVariableChange,
  monthlyByCategory,
} from './insights';
import { dataSpan } from './analytics';
import { quarterOf, quarterReport, quartersIn } from './tags';
import type { LedgerRow } from './types';

const rows = parseLedgerCsv(readFileSync(resolve(__dirname, '__fixtures__/ledger.csv'), 'utf8')).rows;
const TODAY = '2026-11-09';

const charge = (provider: string, merchant: string, date: string, cents: number, extra: Partial<LedgerRow> = {}): LedgerRow => ({
  provider, merchant, date, amountCents: cents, ...extra,
});
/** Monthly charges on the same day from `from` through `to`. */
function monthly(provider: string, merchant: string, from: string, to: string, day: number, cents: number): LedgerRow[] {
  const out: LedgerRow[] = [];
  for (let m = from; m <= to; m = `${Number(m.slice(0, 4)) + (m.endsWith('12') ? 1 : 0)}-${String(((Number(m.slice(5)) % 12) + 1)).padStart(2, '0')}`) {
    out.push(charge(provider, merchant, `${m}-${String(day).padStart(2, '0')}`, cents));
  }
  return out;
}

describe('categories', () => {
  it('has a category for every vendor in the extractor catalog', () => {
    const missing = VENDORS.filter((v) => !knownProvider(v.provider)).map((v) => v.provider);
    expect([...new Set(missing)]).toEqual([]);
  });

  it('splits chat plans from API usage for providers that sell both', () => {
    expect(categoryOf({ provider: 'Anthropic', merchant: 'Anthropic' }, false)).toBe('api');
    expect(categoryOf({ provider: 'Anthropic', merchant: 'ANTHROPIC* CLAUDE SUB' }, true)).toBe('chat');
    expect(categoryOf({ provider: 'OpenAI', merchant: 'x', type: 'usage' }, true)).toBe('api');
    expect(categoryOf({ provider: 'OpenAI', merchant: 'x', type: 'subscription' }, false)).toBe('chat');
  });

  it('tells Google Cloud from Gemini, and respects an explicit type', () => {
    expect(categoryOf({ provider: 'Google', merchant: 'Google Cloud' })).toBe('hosting');
    expect(categoryOf({ provider: 'Google', merchant: 'GOOGLE *GEMINI' }, true)).toBe('chat');
    expect(categoryOf({ provider: 'Anthropic', merchant: 'CLAUDE CERT', type: 'certification' })).toBe('other');
    expect(categoryOf({ provider: 'Some Unknown Co', merchant: 'x' })).toBe('other');
  });

  it('leaves only Slack in Other for the demo ledger', () => {
    const a = analyze(rows, TODAY);
    const other = rows.filter((r) => a.categoryOf(r) === 'other');
    expect(new Set(other.map((r) => r.provider))).toEqual(new Set(['Slack']));
    expect(new Set(rows.map((r) => a.categoryOf(r)))).toContain('chat');
  });
});

describe('subscription report on the fixture ledger', () => {
  const a = analyze(rows, TODAY);
  const r = a.report;
  const names = (xs: { provider: string }[]) => xs.map((x) => x.provider);

  it('adds up the monthly run-rate from the latest charge of each active subscription', () => {
    expect(r.monthlyCents).toBe(r.active.reduce((s, x) => s + x.monthlyCents, 0));
    expect(r.yearlyCents).toBe(r.monthlyCents * 12);
    expect(names(r.active)).toContain('OpenAI');
    expect(names(r.active)).toContain('Cursor');
    // Cancelled before the end of the data
    expect(names(r.active)).not.toContain('Perplexity');
    expect(names(r.active)).not.toContain('Runway');
  });

  it('lists the 30-day calendar in date order, only for active subscriptions, within the horizon', () => {
    expect(r.dataFresh).toBe(true);
    const dates = r.upcoming.map((u) => u.date);
    expect([...dates].sort()).toEqual(dates);
    for (const u of r.upcoming) {
      expect(u.date >= TODAY).toBe(true);
      expect(u.date <= '2026-12-09').toBe(true);
    }
    expect(r.upcomingCents).toBe(r.upcoming.reduce((s, u) => s + u.cents, 0));
  });

  it('reports plan changes as "from X to Y" with the month of the first new charge', () => {
    const chatgpt = r.priceChanges.find((c) => c.provider === 'OpenAI' && c.kind === 'plan');
    expect(chatgpt).toBeDefined();
    expect(chatgpt!.month).toBe('2026-06');
    expect(chatgpt!.fromCents).toBeGreaterThan(2000);
    expect(chatgpt!.fromCents).toBeLessThan(2600);
    expect(chatgpt!.toCents).toBeGreaterThan(10000);
    expect(chatgpt!.pct).toBeGreaterThan(300);
  });

  it('does not report FX-style wobble (a few percent) as a price change', () => {
    expect(r.priceChanges.find((c) => c.provider === 'GitHub')).toBeUndefined();
  });

  it('does not invent price steps from the last charge of a pattern that already stopped', () => {
    expect(r.priceChanges.find((c) => c.provider === 'OpenRouter')).toBeUndefined();
  });

  it('is honest when a "stopped" stream keeps charging: usage top-ups are not a subscription', () => {
    const openrouter = r.stopped.find((s) => s.provider === 'OpenRouter');
    expect(openrouter?.chargesSince.length).toBeGreaterThan(0);
  });

  it('lists stopped subscriptions with a clean cancellation, and not plans that were replaced', () => {
    const perplexity = r.stopped.find((s) => s.provider === 'Perplexity');
    expect(perplexity).toBeDefined();
    expect(perplexity!.chargesSince).toEqual([]);
    expect(perplexity!.monthsSince).toBeGreaterThan(0);
    // ChatGPT Plus was replaced by Pro: a plan change, not a cancellation
    expect(r.stopped.find((s) => s.provider === 'OpenAI')).toBeUndefined();
  });

  it('flags overlapping chat assistants and coding tools with a combined monthly cost', () => {
    const chat = r.overlaps.find((o) => o.category === 'chat');
    expect(chat).toBeDefined();
    expect(names(chat!.members)).toEqual(expect.arrayContaining(['OpenAI', 'Anthropic']));
    expect(chat!.combinedMonthlyCents).toBe(chat!.members.reduce((s, m) => s + m.monthlyCents, 0));
    expect(chat!.sentence).toMatch(/chat assistants: .* · €[\d.,]+\/month combined/);
    const coding = r.overlaps.find((o) => o.category === 'coding');
    expect(coding && names(coding.members)).toEqual(expect.arrayContaining(['Cursor', 'GitHub']));
    // Hosting and domains are normally plural, so never reported; nor is team chat next to a meeting tool
    expect(r.overlaps.find((o) => o.category === 'hosting' || o.category === 'domains')).toBeUndefined();
    expect(r.overlaps.find((o) => o.members.some((m) => m.provider === 'Slack'))).toBeUndefined();
  });

  it('suggests no forward-looking calendar when the data is stale', () => {
    const stale = analyze(rows, '2027-03-01').report;
    expect(stale.dataFresh).toBe(false);
    expect(stale.upcoming).toEqual([]);
  });
});

describe('subscription detection edge cases', () => {
  it('flags a step within one pattern, but not a one-month blip', () => {
    const step = [
      ...monthly('Acme', 'ACME', '2026-01', '2026-03', 5, 2000),
      ...monthly('Acme', 'ACME', '2026-04', '2026-08', 5, 2400), // +20%, stays
    ];
    const changes = analyze(step, '2026-09-01').report.priceChanges;
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: 'step', fromCents: 2000, toCents: 2400, month: '2026-04' });

    const blip = monthly('Acme', 'ACME', '2026-01', '2026-08', 5, 2000);
    blip[4] = { ...blip[4], amountCents: 2400 };
    expect(analyze(blip, '2026-09-01').report.priceChanges).toEqual([]);
  });

  it('flags a cancellation that is still charging', () => {
    const data = [
      ...monthly('Acme', 'ACME', '2026-01', '2026-04', 5, 2000),
      charge('Acme', 'ACME', '2026-08-20', 500), // a later, different-sized charge from the same descriptor
    ];
    const s = analyze(data, '2026-09-01').report.stopped;
    expect(s).toHaveLength(1);
    expect(s[0].chargesSince).toHaveLength(1);
  });

  it('reports nothing for an empty ledger', () => {
    const e = analyze([], TODAY).report;
    expect(e.active).toEqual([]);
    expect(e.monthlyCents).toBe(0);
  });
});

describe('fixed vs variable', () => {
  const a = analyze(rows, TODAY);
  const span = dataSpan(rows)!;

  it('splits every charge into fixed or variable without losing any money', () => {
    const series = fixedVariableByMonth(rows, span.months, a.fixed);
    const fixed = series.reduce((s, m) => s + m.fixedCents, 0);
    const variable = series.reduce((s, m) => s + m.variableCents, 0);
    expect(fixed + variable).toBe(rows.reduce((s, r) => s + r.amountCents, 0));
    expect(fixed).toBeGreaterThan(0);
    expect(variable).toBeGreaterThan(0);
  });

  it('counts a charge marked as a subscription as fixed', () => {
    const one = [charge('Acme', 'ACME', '2026-05-01', 999, { type: 'subscription' })];
    expect(analyze(one, '2026-05-02').fixed.size).toBe(1);
  });

  it('compares the last 3 complete months with the 3 before', () => {
    const c = fixedVariableChange(rows, a.fixed, '2026-10');
    expect([c.afterFrom, c.afterTo, c.beforeFrom, c.beforeTo]).toEqual(['2026-08', '2026-10', '2026-05', '2026-07']);
    const total = (x: { fixedCents: number; variableCents: number }) => x.fixedCents + x.variableCents;
    expect(total(c.after)).toBe(47635 + 48170 + 53429);
    expect(total(c.before)).toBe(45430 + 52534 + 51373);
  });
});

describe('categories over time', () => {
  it('conserves the monthly total across categories', () => {
    const a = analyze(rows, TODAY);
    const span = dataSpan(rows)!;
    const stack = monthlyByCategory(rows, span.months, a.categoryOf);
    for (const m of stack) {
      expect(Object.values(m.cents).reduce((s, v) => s + v, 0)).toBe(m.totalCents);
      for (const k of Object.keys(m.cents)) expect(CATEGORIES).toContain(k);
    }
    expect(stack.reduce((s, m) => s + m.totalCents, 0)).toBe(581003);
  });
});

describe('budgets', () => {
  const a = analyze(rows, TODAY);
  const month = '2026-11';
  const actual = rows.filter((r) => r.date.startsWith(month)).reduce((s, r) => s + r.amountCents, 0);

  it('shows "over budget" once spending passes the budget', () => {
    const rep = evaluateBudgets(rows, { totalCents: actual - 1000, byCategory: {} }, TODAY, a.categoryOf);
    expect(rep.month).toBe(month);
    expect(rep.lines).toHaveLength(1);
    expect(rep.lines[0]).toMatchObject({ key: 'total', status: 'over', actualCents: actual });
    expect(rep.lines[0].summary).toMatch(/^Over budget by €10\.00$/);
  });

  it('says "on track to exceed" when the month-end estimate is above the budget', () => {
    const rep = evaluateBudgets(rows, { totalCents: actual + 100, byCategory: {} }, TODAY, a.categoryOf);
    const line = rep.lines[0];
    expect(line.projectedCents).not.toBeNull();
    expect(line.projectedCents!).toBeGreaterThan(actual + 100);
    expect(line.status).toBe('at-risk');
    expect(line.summary).toMatch(/^On track to exceed by /);
  });

  it('stays under with a generous budget, and evaluates category budgets on that category only', () => {
    const rep = evaluateBudgets(rows, { totalCents: 10_000_000, byCategory: { hosting: 5_000_000 } }, TODAY, a.categoryOf);
    expect(rep.lines.map((l) => l.status)).toEqual(['under', 'under']);
    const hosting = rep.lines.find((l) => l.key === 'hosting')!;
    const hostingActual = rows
      .filter((r) => r.date.startsWith(month) && a.categoryOf(r) === 'hosting')
      .reduce((s, r) => s + r.amountCents, 0);
    expect(hosting.actualCents).toBe(hostingActual);
  });

  it('falls back to spent-so-far, with a reason, when there is no estimate', () => {
    const rep = evaluateBudgets(rows, { totalCents: 100, byCategory: {} }, '2027-06-01', a.categoryOf);
    expect(rep.note).toMatch(/No month-end estimate/);
    expect(rep.lines[0].projectedCents).toBeNull();
  });

  it('normalizes budgets read from storage', () => {
    expect(normalizeBudgets({ totalCents: 5000.5, byCategory: { chat: 1000, bogus: 5, api: -3 } })).toEqual({
      totalCents: null,
      byCategory: { chat: 1000 },
    });
    expect(normalizeBudgets('nonsense')).toEqual({ totalCents: null, byCategory: {} });
  });
});

describe('tags and quarter reports', () => {
  it('maps dates to quarters', () => {
    expect(quarterOf('2026-01-01')).toBe('2026-Q1');
    expect(quarterOf('2026-03-31')).toBe('2026-Q1');
    expect(quarterOf('2026-04-01')).toBe('2026-Q2');
    expect(quarterOf('2026-12-31')).toBe('2026-Q4');
    expect(quartersIn(rows)[0]).toBe('2026-Q4');
  });

  it('totals per tag, treats missing tags as Untagged, and can filter to one tag', () => {
    const data = [
      charge('A', 'a', '2026-04-02', 1000, { tag: 'Business' }),
      charge('A', 'a', '2026-05-02', 500, { tag: 'Business' }),
      charge('B', 'b', '2026-06-02', 300, { tag: 'Personal' }),
      charge('C', 'c', '2026-06-03', 200),
      charge('C', 'c', '2026-07-03', 9999, { tag: 'Business' }), // next quarter
    ];
    const q = quarterReport(data, '2026-Q2');
    expect(q.totalCents).toBe(2000);
    expect(q.totals).toEqual([
      { tag: 'Business', count: 2, totalCents: 1500 },
      { tag: 'Personal', count: 1, totalCents: 300 },
      { tag: 'Untagged', count: 1, totalCents: 200 },
    ]);
    expect(quarterReport(data, '2026-Q2', 'Business').rows).toHaveLength(2);
    expect(quarterReport(data, '2026-Q2', 'Untagged').rows).toHaveLength(1);
  });

  it('round-trips tags through the CSV without adding a column when nothing is tagged', () => {
    const plain = toLedgerCsv([charge('A', 'a', '2026-04-02', 1000)]);
    expect(plain.split('\r\n')[0]).toBe('Merchant,Provider,Amount,Date');
    const tagged = toLedgerCsv([charge('A', 'a', '2026-04-02', 1000, { tag: 'Client: Acme' }), charge('B', 'b', '2026-04-03', 5)]);
    expect(tagged.split('\r\n')[0]).toBe('Merchant,Provider,Amount,Date,Tag');
    const back = parseLedgerCsv(tagged);
    expect(back.warnings).toEqual([]);
    expect(back.rows.map((r) => r.tag)).toEqual(['Client: Acme', undefined]);
  });
});

describe('storage of tags and budgets', () => {
  beforeEach(async () => {
    await clearAll();
  });

  it('keeps tags across a reload, imports them, and removes them again', async () => {
    const p = parseLedgerCsv(toLedgerCsv(rows.slice(0, 5)));
    await commitImport('a.csv', p.rows, p.rowsInFile, 0);
    const ids = (await loadAll()).transactions.map((t) => t.id);
    await setTags(ids.slice(0, 2), 'Business');
    await closeDb();
    let tx = (await loadAll()).transactions;
    expect(tx.filter((t) => t.tag === 'Business')).toHaveLength(2);

    // Re-importing an export that carries the tags adds nothing and leaves tags alone
    const again = parseLedgerCsv(toLedgerCsv(tx));
    const res = await commitImport('b.csv', again.rows, again.rowsInFile, 0);
    expect(res.added).toBe(0);

    await setTags(ids.slice(0, 1), null);
    tx = (await loadAll()).transactions;
    expect(tx.filter((t) => t.tag)).toHaveLength(1);
  });

  it('saves a setting, and clearing local data removes it too', async () => {
    await saveSetting('budgets', { totalCents: 5000, byCategory: {} });
    expect(await loadSetting('budgets')).toEqual({ totalCents: 5000, byCategory: {} });
    await clearAll();
    expect(await loadSetting('budgets')).toBeUndefined();
  });
});
