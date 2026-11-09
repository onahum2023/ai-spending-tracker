import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ParsedRow } from './csv';
import { clearAll, closeDb, commitImport, loadAll, loadSetting, saveSetting } from './db';
import { applyTagRules, normalizeTagRules, quarterReport, withTagRule } from './tags';

const row = (provider: string, date: string, extra: Partial<ParsedRow> = {}): ParsedRow => ({
  provider, merchant: provider.toUpperCase(), date, amountCents: 1000, sourceRow: 2, ...extra,
});

describe('tag rules', () => {
  it('sets, replaces and removes a rule per provider, and cleans what it reads back', () => {
    let list = withTagRule([], 'Anthropic', 'Business');
    list = withTagRule(list, 'Cursor', '  Client  A ');
    list = withTagRule(list, 'Anthropic', 'Personal');
    expect(list).toEqual([{ provider: 'Cursor', tag: 'Client A' }, { provider: 'Anthropic', tag: 'Personal' }]);
    expect(withTagRule(list, 'Cursor', '   ')).toEqual([{ provider: 'Anthropic', tag: 'Personal' }]);
    expect(withTagRule(list, 'Anthropic', null)).toEqual([{ provider: 'Cursor', tag: 'Client A' }]);
    expect(
      normalizeTagRules([{ provider: 'B', tag: ' x ' }, { provider: 'A', tag: 'y' }, { provider: 'B', tag: 'z' }, { provider: '', tag: 'q' }, { provider: 'C', tag: '  ' }, { provider: 'D', tag: 4 }, null]),
    ).toEqual([{ provider: 'A', tag: 'y' }, { provider: 'B', tag: 'z' }]);
    expect(normalizeTagRules(undefined)).toEqual([]);
  });

  it('tags rows that arrive without a tag, and leaves a tag from the file alone', () => {
    const rows = [row('Anthropic', '2026-10-01'), row('Anthropic', '2026-10-02', { tag: 'Personal' }), row('Cursor', '2026-10-03')];
    const out = applyTagRules(rows, [{ provider: 'Anthropic', tag: 'Business' }]);
    expect(out.tagged).toBe(1);
    expect(out.rows.map((r) => r.tag)).toEqual(['Business', 'Personal', undefined]);
    expect(rows[0].tag).toBeUndefined(); // input is not changed
    expect(applyTagRules(rows, []).rows).toBe(rows);
  });
});

describe('tag rules on import', () => {
  beforeEach(async () => {
    await clearAll();
  });

  it('applies to the charges added by an import, counts them, and feeds the quarter report', async () => {
    const rules = [{ provider: 'Anthropic', tag: 'Business' }];
    const res = await commitImport('a.csv', [row('Anthropic', '2026-10-01'), row('Cursor', '2026-10-02'), row('Anthropic', '2026-10-03', { tag: 'Personal' })], 3, 0, rules);
    expect(res).toMatchObject({ added: 3, taggedByRule: 1 });
    const { transactions } = await loadAll();
    expect(transactions.map((t) => [t.provider, t.tag])).toEqual([['Anthropic', 'Business'], ['Cursor', undefined], ['Anthropic', 'Personal']]);
    const q = quarterReport(transactions, '2026-Q4');
    expect(q.totals.map((t) => [t.tag, t.count]).sort()).toEqual([['Business', 1], ['Personal', 1], ['Untagged', 1]]);
  });

  it('never changes charges that are already stored, and does not tag skipped duplicates', async () => {
    await commitImport('a.csv', [row('Anthropic', '2026-10-01')], 1, 0);
    const res = await commitImport('b.csv', [row('Anthropic', '2026-10-01'), row('Anthropic', '2026-10-05')], 2, 0, [{ provider: 'Anthropic', tag: 'Business' }]);
    expect(res).toMatchObject({ added: 1, skippedDuplicates: 1, taggedByRule: 1 });
    const { transactions } = await loadAll();
    expect(transactions.map((t) => t.tag)).toEqual([undefined, 'Business']);
  });

  it('without rules behaves as before', async () => {
    const res = await commitImport('a.csv', [row('Anthropic', '2026-10-01')], 1, 0);
    expect(res.taggedByRule).toBe(0);
  });

  it('keeps rules across a reload and removes them with Clear local data', async () => {
    await saveSetting('tagRules', [{ provider: 'A', tag: 'Business' }]);
    await closeDb();
    expect(normalizeTagRules(await loadSetting('tagRules'))).toEqual([{ provider: 'A', tag: 'Business' }]);
    await clearAll();
    expect(await loadSetting('tagRules')).toBeUndefined();
  });
});
