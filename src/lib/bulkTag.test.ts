import { describe, expect, it } from 'vitest';
import { planBulkTag, quarterReport } from './tags';

/** Charges in 2026-Q4 with a mix of saved tags: client, personal, untagged, and one already Business. */
const charges = () => [
  { id: 1, provider: 'Anthropic', merchant: 'ANTHROPIC', date: '2026-10-03', amountCents: 2000, tag: 'Client: Acme' },
  { id: 2, provider: 'OpenAI', merchant: 'OPENAI', date: '2026-10-15', amountCents: 2280, tag: 'Personal' },
  { id: 3, provider: 'Cursor', merchant: 'CURSOR', date: '2026-11-09', amountCents: 1873 },
  { id: 4, provider: 'Vercel', merchant: 'VERCEL', date: '2026-11-26', amountCents: 1832, tag: 'Business' },
];

/** What the selection bar writes once confirmed: the planned charges get the tag (or lose it). */
const applyPlan = <T extends { id: number; tag?: string }>(rows: T[], ids: number[], tag: string | null): T[] =>
  rows.map((r) => (ids.includes(r.id) ? { ...r, tag: tag ?? undefined } : r));

describe('bulk tagging a selection', () => {
  it('tags untagged charges without asking', () => {
    const plan = planBulkTag([{ id: 3 }, { id: 5, tag: '' }], 'Business');
    expect(plan).toMatchObject({ ids: [3, 5], added: 2, replaced: 0, cleared: 0, needsConfirm: false });
  });

  it('asks before replacing saved tags, and says how many and which', () => {
    const plan = planBulkTag(charges(), 'Business');
    expect(plan.needsConfirm).toBe(true);
    expect(plan).toMatchObject({ ids: [1, 2, 3], added: 1, replaced: 2, cleared: 0 });
    expect(plan.affectedTags).toEqual(['Client: Acme', 'Personal']);
  });

  it('asks before clearing saved tags, and leaves untagged charges out', () => {
    const plan = planBulkTag(charges(), null);
    expect(plan).toMatchObject({ ids: [1, 2, 4], added: 0, replaced: 0, cleared: 3, needsConfirm: true });
  });

  it('Cancel leaves a tag-filtered quarterly export exactly as it was; confirming changes it', () => {
    const rows = charges();
    const before = quarterReport(rows, '2026-Q4', 'Client: Acme');
    expect(before.rows.map((r) => r.id)).toEqual([1]);
    const plan = planBulkTag(rows, 'Business');
    expect(plan.needsConfirm).toBe(true);
    // Cancel: nothing is written, so the stored charges and the export stay the same.
    expect(quarterReport(rows, '2026-Q4', 'Client: Acme')).toEqual(before);
    expect(rows).toEqual(charges());
    // Confirm: the client's charge moves to Business.
    const after = applyPlan(rows, plan.ids, 'Business');
    expect(quarterReport(after, '2026-Q4', 'Client: Acme').rows).toHaveLength(0);
    expect(quarterReport(after, '2026-Q4', 'Business').rows.map((r) => r.id)).toEqual([1, 2, 3, 4]);
  });
});
