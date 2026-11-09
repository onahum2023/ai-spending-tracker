import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseLedgerCsv } from './csv';
import { clearAll, closeDb, loadSetting, saveSetting } from './db';
import {
  correlateSignups,
  DEMO_SIGNUPS,
  mergeSignups,
  normalizeSignups,
  parseEvidence,
  providerKey,
  setSignupHidden,
  summarizeOutcomes,
  type Signup,
} from './signups';
import type { LedgerRow } from './types';

// Invented evidence in the shape of an email-evidence file. No real data belongs in the repo.
const messages = [
  { id: 'm1', message_date: '2026-03-02T08:00:00.000Z' },
  { id: 'm2', message_date: '2026-03-02T09:30:00.000Z' },
  { id: 'm3', message_date: '2026-04-10T07:00:00.000Z' },
  { id: 'm4', message_date: '2026-05-01T07:00:00.000Z' },
  { id: 'm5', message_date: '2026-05-02T07:00:00.000Z' },
  { id: 'm6', message_date: '2026-05-03T07:00:00.000Z' },
  { id: 'm7', message_date: '2026-05-04T07:00:00.000Z' },
];
const ob = (source_id: string, type: string, provider: string, extra: Record<string, unknown> = {}) => ({
  id: `${source_id}:1`,
  source_id,
  category: 'signup_and_account',
  type,
  provider,
  service: null,
  effective_date: null,
  confidence: 'high',
  message_id_leak: 'should never be stored',
  ...extra,
});
const evidence = {
  schema_version: 3,
  source_messages: messages,
  observations: [
    ob('m1', 'welcome', 'Acme AI', { service: 'Acme Studio' }),
    ob('m2', 'trial_started', 'Acme AI', { service: 'Acme Studio Pro' }), // same provider, same day: one event, the trial wins
    ob('m3', 'signup', 'Beta Cloud', { effective_date: '2026-04-09' }), // effective date beats the message date
    ob('m4', 'signup_verification', 'Gamma'), // a verification code is not a sign-up
    ob('m5', 'trial_ending_notice', 'Delta'), // not a start
    ob('m6', 'signup', 'Epsilon', { confidence: 'low' }), // only high confidence
    ob('m7', 'signup', 'Zeta', { effective_date: 'not a date' }), // falls back to the message date
    ob('missing', 'signup', 'Eta'), // no date anywhere
    ob('m7', 'signup', ''), // no provider
  ],
};

describe('reading an email-evidence file', () => {
  const r = parseEvidence(evidence);

  it('keeps clear sign-ups and trial starts, merges same-day duplicates, and drops everything else', () => {
    expect(r.error).toBeNull();
    expect(r.observationsRead).toBe(evidence.observations.length);
    expect(r.signups.map((s) => [s.provider, s.date, s.kind])).toEqual([
      ['Zeta', '2026-05-04', 'signup'],
      ['Beta Cloud', '2026-04-09', 'signup'],
      ['Acme AI', '2026-03-02', 'trial'],
    ]);
    expect(r.signups.find((s) => s.provider === 'Acme AI')!.service).toBe('Acme Studio');
  });

  it('stores only provider, service, date and kind', () => {
    for (const s of r.signups) expect(Object.keys(s).sort()).toEqual(['date', 'kind', 'provider', 'service']);
    expect(JSON.stringify(r.signups)).not.toMatch(/leak|m1|gmail/);
  });

  it('refuses files that are not evidence files, without throwing', () => {
    expect(parseEvidence(null).error).toMatch(/not an email-evidence file/);
    expect(parseEvidence([1, 2]).error).toMatch(/observations/);
    expect(parseEvidence({ observations: [] }).error).toMatch(/source_messages/);
    expect(parseEvidence({ observations: [], source_messages: [] })).toMatchObject({ error: null, signups: [] });
  });

  it('merges new events into stored ones without duplicating or overwriting', () => {
    const a = r.signups;
    const again = mergeSignups(a, [...a, { provider: 'acme ai', service: 'x', date: '2026-03-02', kind: 'signup' }, { provider: 'New', service: null, date: '2026-06-01', kind: 'signup' }]);
    expect(again.added).toBe(1);
    expect(again.merged).toHaveLength(a.length + 1);
    expect(again.merged.find((s) => s.provider === 'Acme AI')!.kind).toBe('trial');
  });

  it('cleans what it reads back from storage', () => {
    const cleaned = normalizeSignups([
      { provider: 'A', service: 'S', date: '2026-01-02', kind: 'trial', extra: 'dropped' },
      { provider: 'A', service: 'S', date: '2026-01-02', kind: 'trial' },
      { provider: 'B', date: '2026-13-40', kind: 'signup' },
      { provider: '', date: '2026-01-02', kind: 'signup' },
      { provider: 'C', date: '2026-01-02', kind: 'bogus' },
      'junk',
    ]);
    expect(cleaned).toEqual([{ provider: 'A', service: 'S', date: '2026-01-02', kind: 'trial' }]);
    expect(normalizeSignups('nope')).toEqual([]);
  });
});

describe('hiding entries', () => {
  const list = parseEvidence(evidence).signups;
  const target = list.find((s) => s.provider === 'Beta Cloud')!;

  it('hides and restores one entry, and keeps the flag through storage cleaning', () => {
    const hidden = setSignupHidden(list, target, true);
    expect(hidden.find((s) => s.provider === 'Beta Cloud')!.hidden).toBe(true);
    expect(hidden.filter((s) => s.hidden)).toHaveLength(1);
    expect(normalizeSignups(hidden).find((s) => s.provider === 'Beta Cloud')!.hidden).toBe(true);
    const restored = setSignupHidden(hidden, target, false);
    expect(restored.find((s) => s.provider === 'Beta Cloud')).not.toHaveProperty('hidden');
  });

  it('stays hidden when the same file is imported again', () => {
    const hidden = setSignupHidden(list, target, true);
    const again = mergeSignups(hidden, parseEvidence(evidence).signups);
    expect(again.added).toBe(0);
    expect(again.merged.find((s) => s.provider === 'Beta Cloud')!.hidden).toBe(true);
  });
});

describe('provider matching', () => {
  it('meets the same vendor under different names, and keeps unknown names apart', () => {
    expect(providerKey('Otter.ai')).toBe(providerKey('Otter'));
    expect(providerKey('Revolut / OpenAI')).toBe(providerKey('OpenAI'));
    expect(providerKey('Mistral AI')).toBe(providerKey('mistral ai'));
    expect(providerKey('Acme AI')).not.toBe(providerKey('Acme'));
  });
});

describe('what happened after a sign-up', () => {
  const ledger: LedgerRow[] = [
    { provider: 'Acme AI', merchant: 'ACME', date: '2026-03-20', amountCents: 1999 },
    { provider: 'Acme AI', merchant: 'ACME', date: '2026-04-20', amountCents: 1999 },
    { provider: 'Old Friend', merchant: 'OF', date: '2026-01-05', amountCents: 500 },
    { provider: 'Old Friend', merchant: 'OF', date: '2026-04-05', amountCents: 500 },
    { provider: 'Other', merchant: 'O', date: '2026-05-30', amountCents: 100 },
    { provider: 'Refunded', merchant: 'R', date: '2026-04-02', amountCents: -300 },
  ];
  const s = (provider: string, date: string, kind: Signup['kind'] = 'signup'): Signup => ({ provider, service: null, date, kind });
  const out = correlateSignups(
    [s('acme ai', '2026-03-02', 'trial'), s('Old Friend', '2026-03-01'), s('Nobody', '2026-03-01'), s('Late', '2026-06-15'), s('Refunded', '2026-04-01')],
    ledger,
  );

  it('reports the first charge, the days after the sign-up, and the totals since', () => {
    expect(out[0]).toMatchObject({
      status: 'charged',
      ledgerProvider: 'Acme AI',
      firstCharge: { date: '2026-03-20', cents: 1999, daysAfter: 18 },
      chargesSince: 2,
      centsSince: 3998,
    });
  });

  it('does not claim a charge for a provider that was already charging before the sign-up', () => {
    expect(out[1].status).toBe('existing');
    expect(out[1].chargesSince).toBe(1);
  });

  it('says no charge, or unknown when the ledger ends before the sign-up, and ignores refunds', () => {
    expect(out[2].status).toBe('no-charge');
    expect(out[3].status).toBe('unknown');
    expect(out[4].status).toBe('no-charge');
  });

  it('summarizes', () => {
    expect(summarizeOutcomes(out)).toEqual({ total: 5, charged: 1, existing: 1, noCharge: 2, unknown: 1, trials: 1, trialsCharged: 1 });
  });

  it('shows the demo sign-ups against the demo ledger: some charge, some never do', () => {
    const fixture = parseLedgerCsv(readFileSync(resolve(__dirname, '__fixtures__/ledger.csv'), 'utf8')).rows;
    const by = Object.fromEntries(correlateSignups(DEMO_SIGNUPS, fixture).map((o) => [o.signup.provider, o]));
    expect(by.Cursor).toMatchObject({ status: 'charged' });
    expect(by.Cursor.firstCharge!.daysAfter).toBeLessThan(31);
    expect(by.Granola.status).toBe('charged');
    expect(by.Windsurf.status).toBe('no-charge');
    expect(by.Anthropic.status).toBe('existing');
  });
});

describe('storage', () => {
  beforeEach(async () => {
    await clearAll();
  });

  it('keeps sign-ups across a reload and removes them with the rest of the local data', async () => {
    const list = parseEvidence(evidence).signups;
    await saveSetting('signups', list);
    await closeDb();
    expect(normalizeSignups(await loadSetting('signups'))).toEqual(list);
    await clearAll();
    expect(await loadSetting('signups')).toBeUndefined();
  });
});
