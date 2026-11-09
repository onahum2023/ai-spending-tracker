import { describe, expect, it } from 'vitest';
import { parseLedgerCsv, toLedgerCsv } from '../csv';
import { classifyRows, type Classified } from './classify';
import { applyVerdicts, payloadFor } from './claude';
import { extractFromPdfItems, extractFromTables, mergeFiles } from './load';
import { detectDayOrder, parseLooseAmount, parseLooseDate, summarizeDetails } from './parse';
import type { PdfTextItem } from './revolut';
import { parseServiceType, type ReadResult, type StatementRow } from './types';

// Everything here is invented test data.

let seq = 0;
function row(merchant: string, amount: number, date = '2026-03-10', extra: Partial<StatementRow> = {}): StatementRow {
  return { id: `t#${++seq}`, source: 't.csv', format: 'table', date, amountCents: Math.round(amount * 100), merchant, kind: 'card', ...extra };
}
const one = (r: StatementRow, opts = {}) => classifyRows([r], opts)[0];

describe('parsing dates and amounts', () => {
  it('reads the date formats banks export', () => {
    expect(parseLooseDate('2026-03-04')).toBe('2026-03-04');
    expect(parseLooseDate('20260304')).toBe('2026-03-04');
    expect(parseLooseDate('04/03/2026', 'dmy')).toBe('2026-03-04');
    expect(parseLooseDate('03/04/2026', 'mdy')).toBe('2026-03-04');
    expect(parseLooseDate('4.3.26', 'dmy')).toBe('2026-03-04');
    expect(parseLooseDate('Mar 4, 2026')).toBe('2026-03-04');
    expect(parseLooseDate('4 mrt 2026')).toBe('2026-03-04');
    expect(parseLooseDate(46085)).toBe('2026-03-04'); // Excel serial day
    expect(parseLooseDate(new Date(Date.UTC(2026, 2, 4)))).toBe('2026-03-04');
    expect(parseLooseDate('31/02/2026', 'dmy')).toBeNull();
    expect(parseLooseDate('soon')).toBeNull();
  });
  it('works out day/month order from the whole column', () => {
    expect(detectDayOrder(['12/26/2025', '01/02/2026'])).toBe('mdy');
    expect(detectDayOrder(['26/12/2025', '01/02/2026'])).toBe('dmy');
    expect(detectDayOrder(['01/02/2026', '03/04/2026'])).toBeNull();
  });
  it('reads amounts in common notations as exact cents', () => {
    expect(parseLooseAmount('12.10')).toBe(1210);
    expect(parseLooseAmount('-12,10')).toBe(-1210);
    expect(parseLooseAmount('1.234,56')).toBe(123456);
    expect(parseLooseAmount('€ 1,234.56')).toBe(123456);
    expect(parseLooseAmount('(12.10)')).toBe(-1210);
    expect(parseLooseAmount('12,10-')).toBe(-1210);
    expect(parseLooseAmount('1.234')).toBe(123400);
    expect(parseLooseAmount(21.19)).toBe(2119);
    expect(parseLooseAmount('n/a')).toBeNull();
  });
  it('summarises foreign-amount details', () => {
    expect(summarizeDetails('Foreign Spend Amount: 24.20 Amerikaanse dollar Commission Amount: 0.52 Currency Exchange Rate: 1.17')).toBe('USD 24.20');
    expect(summarizeDetails('Revolut Rate €1.00 = $1.15 (ECB rate* €1.00 = $1.16) $10.80')).toBe('$10.80');
    expect(summarizeDetails(undefined)).toBe('');
  });
});

describe('reading statement tables', () => {
  const amexLike = [
    ['Transactieoverzicht', 'American Express® Card / 01 Jan, 2026 tot 31 Dec, 2026'],
    ['Kaartnummer'],
    [],
    ['Datum', 'Omschrijving', 'Bedrag', 'Aanvullende informatie', 'Vermeld op uw rekeningoverzicht als', 'Land', 'Categorie'],
    ['03/21/2026', 'OPENAI *CHATGPT SUBSCR  SAN FRANCISCO', 21.5, 'Foreign Spend Amount: 24.00 Amerikaanse dollar Commission Amount: 0.5', 'OPENAI *CHATGPT SUBSCR  SAN FRANCISCO', 'UNITED STATES', null],
    ['03/14/2026', 'HARTELIJK BEDANKT VOOR UW BETALING', -500, null, 'HARTELIJK BEDANKT VOOR UW BETALING', null, null],
    ['03/13/2026', 'BAKERY TEST', 4.2, null, 'BAKERY TEST', 'NETHERLANDS', null],
  ];

  it('reads an Amex-style export: month-first dates, charges positive, payments recognised', () => {
    const r = extractFromTables('amex.xlsx', [{ name: 'Details', table: amexLike }]);
    expect(r.error).toBeUndefined();
    expect(r.format).toBe('amex');
    expect(r.rows).toHaveLength(3);
    expect(r.rows[0]).toMatchObject({ date: '2026-03-21', amountCents: 2150, merchant: 'OPENAI *CHATGPT SUBSCR  SAN FRANCISCO', country: 'UNITED STATES', kind: 'card' });
    expect(r.rows[1]).toMatchObject({ amountCents: -50000, kind: 'payment' });
  });

  it('reads a bank CSV with an Af/Bij direction column (spending becomes positive)', () => {
    const ing = [
      ['Datum', 'Naam / Omschrijving', 'Rekening', 'Tegenrekening', 'Code', 'Af Bij', 'Bedrag (EUR)', 'Mutatiesoort', 'Mededelingen'],
      ['20260305', 'Cursor AI', 'NL00TEST', '', 'BA', 'Af', '20,00', 'Betaalautomaat', 'Pasnummer 1'],
      ['20260306', 'Salaris', 'NL00TEST', 'NL11TEST', 'GT', 'Bij', '1000,00', 'Online bankieren', ''],
    ];
    const r = extractFromTables('ing.csv', [{ name: 'ing', table: ing }]);
    expect(r.rows[0]).toMatchObject({ date: '2026-03-05', amountCents: 2000, merchant: 'Cursor AI' });
    expect(r.rows[1].amountCents).toBe(-100000);
  });

  it('skips rows whose state is not completed (Revolut CSV style)', () => {
    const rev = [
      ['Type', 'Product', 'Started Date', 'Completed Date', 'Description', 'Amount', 'Fee', 'Currency', 'State', 'Balance'],
      ['CARD_PAYMENT', 'Current', '2026-03-01 10:00:00', '2026-03-02 10:00:00', 'Anthropic', '-10.30', '0.00', 'EUR', 'COMPLETED', '90'],
      ['CARD_PAYMENT', 'Current', '2026-03-03 10:00:00', '', 'Anthropic', '-10.30', '0.00', 'EUR', 'REVERTED', '90'],
      ['TRANSFER', 'Current', '2026-03-04 10:00:00', '2026-03-04 10:00:00', 'To Jane', '-50.00', '0.00', 'EUR', 'COMPLETED', '40'],
    ];
    const r = extractFromTables('rev.csv', [{ name: 'rev', table: rev }]);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ amountCents: 1030, merchant: 'Anthropic', kind: 'card' });
    expect(r.rows[1].kind).toBe('transfer');
  });

  it('explains when no header is found', () => {
    expect(extractFromTables('x.csv', [{ name: 'x', table: [['a', 'b'], ['1', '2']] }]).error).toMatch(/header row/);
  });

  it('counts a line exported in two overlapping files once', () => {
    const a: ReadResult = { fileName: 'a', format: 'table', notes: [], rows: [row('X', 1, '2026-01-01'), row('X', 1, '2026-01-01'), row('Y', 2)] };
    const b: ReadResult = { fileName: 'b', format: 'table', notes: [], rows: [row('X', 1, '2026-01-01'), row('Z', 3)] };
    const m = mergeFiles([a, b]);
    expect(m.rows.map((r) => r.merchant)).toEqual(['X', 'X', 'Y', 'Z']);
    expect(m.dropped).toBe(1);
  });
});

describe('reading a Revolut PDF statement', () => {
  const items: PdfTextItem[] = [];
  const line = (y: number, parts: [number, string][]) => parts.forEach(([x, str]) => items.push({ page: 1, x, y, str }));
  line(800, [[40, 'EUR Statement'], [300, 'Revolut Bank UAB']]);
  line(700, [[40, 'Pending from January 1, 2026 to March 31, 2026']]);
  line(690, [[43, 'Start date'], [125, 'Description'], [335, 'Money out'], [417, 'Money in']]);
  line(680, [[43, 'Mar 30, 2026'], [125, 'Anthropic'], [335, '€9.99']]);
  line(600, [[40, 'Account transactions from January 1, 2026 to March 31, 2026']]);
  line(590, [[43, 'Date'], [125, 'Description'], [335, 'Money out'], [417, 'Money in'], [526, 'Balance']]);
  line(580, [[43, 'Mar 2, 2026'], [125, 'Anthropic'], [335, '€10.34'], [526, '€90.00']]);
  line(575, [[125, 'Revolut Rate €1.00 = $1.17 (ECB rate* €1.00 = $1.18)'], [335, '$12.10']]);
  line(570, [[125, 'To: Anthropic Ireland, Dublin, DUB']]);
  line(565, [[125, 'Card: 000000******0000']]);
  line(560, [[43, 'Mar 3, 2026'], [125, 'Anthropic'], [417, '€5.00'], [526, '€95.00']]);
  line(555, [[125, 'From: Anthropic Ireland, Dublin, DUB']]);
  line(550, [[125, 'Card: 000000******0000']]);
  line(540, [[43, 'Mar 4, 2026'], [125, 'To pocket EUR Holiday from EUR'], [335, '€20.00'], [526, '€75.00']]);
  line(500, [[40, 'Reverted from January 1, 2026 to March 31, 2026']]);
  line(490, [[43, 'Mar 5, 2026'], [125, 'OpenAI'], [335, '€20.00']]);

  it('uses only settled account transactions, with money in as refunds', () => {
    const r = extractFromPdfItems('rev.pdf', items);
    expect(r.error).toBeUndefined();
    expect(r.rows).toHaveLength(3);
    expect(r.rows[0]).toMatchObject({ date: '2026-03-02', amountCents: 1034, merchant: 'Anthropic Ireland, Dublin, DUB', label: 'Anthropic', kind: 'card' });
    expect(r.rows[0].details).toMatch(/\$12\.10/);
    expect(r.rows[1]).toMatchObject({ amountCents: -500, kind: 'card' });
    expect(r.rows[2].kind).toBe('internal');
    expect(r.notes.join(' ')).toMatch(/Pending.*Reverted|Reverted.*Pending/);
  });

  it('declines PDFs it does not know', () => {
    expect(extractFromPdfItems('x.pdf', [{ page: 1, x: 0, y: 0, str: 'Some other bank' }]).error).toMatch(/Only Revolut/);
    expect(extractFromPdfItems('x.pdf', []).error).toMatch(/no readable text/);
  });
});

describe('classifying statement lines', () => {
  it('tells Anthropic subscriptions, certifications and API usage apart', () => {
    expect(one(row('CLAUDE.AI SUBSCRIPTION  SAN FRANCISCO', 21.78))).toMatchObject({ decision: 'include', provider: 'Anthropic', type: 'subscription' });
    expect(one(row('ANTHROPIC* CLAUDE SUB   SAN FRANCISCO', 108.9))).toMatchObject({ provider: 'Anthropic', type: 'subscription' });
    expect(one(row('ANTHROPIC* CLAUDE CERT  SAN FRANCISCO', 115))).toMatchObject({ provider: 'Anthropic', type: 'certification' });
    expect(one(row('Anthropic Ireland, Dublin, DUB', 10.34, undefined, { label: 'Anthropic' }))).toMatchObject({ provider: 'Anthropic', type: 'usage' });
  });
  it('tells ChatGPT plans from OpenAI API and credits', () => {
    expect(one(row('OPENAI *CHATGPT SUBSCR  SAN FRANCISCO', 21.19)).type).toBe('subscription');
    expect(one(row('OPENAI* CHATGPT CREDIT  DUBLIN', 19.99)).type).toBe('usage');
    expect(one(row('OPENAI                  SAN FRANCISCO', 26.53)).type).toBe('usage');
  });
  it('does not confuse look-alikes', () => {
    expect(one(row('Amzn Mktp Nl*ab12cd, Luxembourg', 9.23, undefined, { label: 'Amazon' })).decision).toBe('exclude');
    expect(one(row('AWS EMEA                AWS.AMAZON.CO', 65))).toMatchObject({ decision: 'include', provider: 'Amazon Web Services', type: 'hosting' });
    expect(one(row('Bck*gamma Utrecht, Utrecht', 31.50, undefined, { label: 'Gamma' })).decision).toBe('review');
    expect(one(row('GAMMA.APP               SAN FRANCISCO', 24))).toMatchObject({ decision: 'include', provider: 'Gamma' });
    expect(one(row('Google One, Dublin', 2.59, undefined, { label: 'Google One' })).decision).toBe('review');
    expect(one(row('Google Cloud', 25))).toMatchObject({ provider: 'Google', type: 'hosting' });
    expect(one(row('Apple.com, Cork', 9.99, undefined, { label: 'Apple' })).decision).toBe('exclude');
  });
  it('sends unknown AI-looking names to review and ignores the rest', () => {
    expect(one(row('Examplebot.ai Inc, Austin, TX', 6.10)).decision).toBe('review');
    expect(one(row('BAKERY TEST', 4.2)).decision).toBe('exclude');
    expect(one(row('HARTELIJK BEDANKT VOOR UW BETALING', -500, undefined, { kind: 'payment' })).decision).toBe('exclude');
  });
  it('keeps refunds from AI vendors as negative charges', () => {
    const c = one(row('Anthropic Ireland, Dublin, DUB', -5));
    expect(c.decision).toBe('include');
    expect(c.reasons.join(' ')).toMatch(/refund/i);
  });
  it('can leave out hosting, domains and dev tools', () => {
    expect(one(row('NAME-CHEAP.COM* AB12CD  PHOENIX', 12), { includeInfra: false }).decision).toBe('exclude');
    expect(one(row('NAME-CHEAP.COM* AB12CD  PHOENIX', 12)).type).toBe('domains');
  });
  it('uses the charge pattern when the descriptor cannot tell plan from top-ups', () => {
    const rows = [
      row('LOVABLE                 DOVER', 25, '2026-01-28'),
      row('LOVABLE                 DOVER', 25, '2026-02-28'),
      row('LOVABLE                 DOVER', 25, '2026-03-28'),
      row('LOVABLE                 DOVER', 50, '2026-03-30'),
    ];
    const out = classifyRows(rows);
    expect(out.map((c) => c.type)).toEqual(['subscription', 'subscription', 'subscription', 'usage']);
    expect(out[3].reasons.at(-1)).toMatch(/not part of a monthly pattern/);
  });
  it('gives every decision a reason', () => {
    for (const c of classifyRows([row('ANYTHING', 1), row('OPENAI', 2)])) expect(c.reasons.length).toBeGreaterThan(0);
  });
});

describe('asking Claude (no network in tests)', () => {
  const c: Classified = {
    row: row('Examplebot.ai Inc, Austin, TX', 6.10, '2026-02-14', { label: 'Examplebot.ai', details: 'Revolut Rate €1.00 = $1.15 (ECB) $5.00 · Reference: secret-ref', source: 'private-file.pdf', country: 'US' }),
    decision: 'review', provider: null, type: null, group: null, reasons: ['name suggests an AI product'], by: 'rules',
  };
  it('sends only minimal fields: no file name, reference or raw details', () => {
    const p = payloadFor(c, 'r1');
    expect(Object.keys(p).sort()).toEqual(['amount_eur', 'bank_label', 'country', 'date', 'foreign_amount', 'id', 'merchant', 'rule_note']);
    expect(JSON.stringify(p)).not.toMatch(/secret-ref|private-file/);
    expect(p.foreign_amount).toBe('$5.00');
  });
  it('does not send free-text details when there is no foreign amount', () => {
    const plain: Classified = { ...c, row: { ...c.row, details: 'NL91ABNA0417164300 · rent for flat' } };
    const p = payloadFor(plain, 'r1');
    expect(p.foreign_amount).toBeNull();
    expect(JSON.stringify(p)).not.toMatch(/NL91ABNA|rent for flat/);
  });
  it('applies verdicts and keeps low-confidence answers in review', () => {
    const base = [c, { ...c, row: { ...c.row, id: 'other' } }];
    const out = applyVerdicts(base, new Map([
      [c.row.id, { id: 'r1', is_ai_spending: true, provider: 'Examplebot', type: 'subscription' as const, confidence: 'high' as const, reason: 'AI tutoring app' }],
      ['other', { id: 'r2', is_ai_spending: false, provider: null, type: null, confidence: 'low' as const, reason: 'unclear' }],
    ]));
    expect(out[0]).toMatchObject({ decision: 'include', provider: 'Examplebot', type: 'subscription', by: 'claude' });
    expect(out[1]).toMatchObject({ decision: 'review', by: 'claude' });
  });
});

describe('review fixes', () => {
  const hdr = ['Date', 'Description', 'Amount'];
  const sample = (extraCols: string[] = []) => [
    [...hdr, ...extraCols],
    ['2026-03-01', 'ANTHROPIC', '-10.00', ...extraCols.map(() => '100')],
    ['2026-03-02', 'OPENAI', '-20.00', ...extraCols.map(() => '100')],
    ['2026-03-03', 'ALBERT HEIJN', '-5.00', ...extraCols.map(() => '100')],
    ...Array.from({ length: 7 }, (_, i) => [`2026-03-${String(4 + i).padStart(2, '0')}`, `INVOICE PAID ${i}`, '100.00', ...extraCols.map(() => '100')]),
  ];

  it('does not flip charges on an account with many incoming credits', () => {
    const r = extractFromTables('acct.csv', [{ name: 'a', table: sample() }]);
    expect(r.notes.join(' ')).toMatch(/negative amounts \(bank account\)/);
    expect(r.rows.find((x) => x.merchant === 'ANTHROPIC')?.amountCents).toBe(1000);
  });
  it('treats a Balance column as a bank account', () => {
    const r = extractFromTables('acct.csv', [{ name: 'a', table: sample(['Balance']) }]);
    expect(r.rows.find((x) => x.merchant === 'OPENAI')?.amountCents).toBe(2000);
  });
  it('still reads a card statement whose charges are positive', () => {
    const card = [hdr, ['2026-03-01', 'ANTHROPIC', '10.00'], ['2026-03-02', 'OPENAI', '20.00'], ['2026-03-03', 'ALBERT HEIJN', '5.00'], ['2026-03-04', 'BETALING BEDANKT', '-30.00']];
    const r = extractFromTables('card.csv', [{ name: 'c', table: card }]);
    expect(r.notes.join(' ')).toMatch(/positive amounts \(card statement\)/);
    expect(r.rows.find((x) => x.merchant === 'ANTHROPIC')?.amountCents).toBe(1000);
  });

  it('only matches Descript and similar as whole words', () => {
    expect(one(row('DESCRIPTION OF GOODS', 5)).decision).toBe('exclude');
    expect(one(row('REPLICATED STORAGE LTD', 5)).decision).toBe('exclude');
    expect(one(row('DESCRIPT', 12)).provider).toBe('Descript');
    expect(one(row('LOVABLE.DEV', 20)).provider).toBe('Lovable');
  });

  it('reads Type values by their start, specific names first', () => {
    expect(parseServiceType('Hosting plan')).toBe('hosting');
    expect(parseServiceType('Domain plan')).toBe('domains');
    expect(parseServiceType('Rapid hosting')).toBe('other');
    expect(parseServiceType('Plan')).toBe('subscription');
    const r = parseLedgerCsv('Merchant,Provider,Amount,Date,Type\r\nM,P,1.00,2026-01-01,Whatever\r\nM,P,2.00,2026-01-02,Other\r\n');
    expect(r.rows.map((x) => x.type)).toEqual(['other', 'other']);
    expect(r.warnings.join(' ')).toMatch(/"Whatever"/);
    expect(r.warnings.join(' ')).not.toMatch(/"Other"/);
  });

  it('marks a Revolut payment to a person as a transfer', () => {
    const items: PdfTextItem[] = [];
    const line = (y: number, parts: [number, string][]) => parts.forEach(([x, str]) => items.push({ page: 1, x, y, str }));
    line(800, [[40, 'EUR Statement'], [300, 'Revolut Bank UAB']]);
    line(600, [[40, 'Account transactions from January 1, 2026 to March 31, 2026']]);
    line(590, [[43, 'Date'], [125, 'Description'], [335, 'Money out'], [417, 'Money in'], [526, 'Balance']]);
    line(580, [[43, 'Mar 2, 2026'], [125, 'John Smith'], [335, '€40.00'], [526, '€60.00']]);
    line(570, [[125, 'To: John Smith']]);
    const r = extractFromPdfItems('rev.pdf', items);
    expect(r.rows[0].kind).toBe('transfer');
  });
});

describe('ledger Type column', () => {
  it('reads, normalises and writes the optional Type column', () => {
    const r = parseLedgerCsv('Merchant,Provider,Amount,Date,Type\r\nM,P,1.00,2026-01-01,Usage / credits\r\nM,P,2.00,2026-01-02,\r\nM,P,3.00,2026-01-03,Subscription\r\n');
    expect(r.warnings).toEqual([]);
    expect(r.rows.map((x) => x.type)).toEqual(['usage', undefined, 'subscription']);
    const out = toLedgerCsv(r.rows);
    expect(out.split('\r\n')[0]).toBe('Merchant,Provider,Amount,Date,Type');
    expect(parseLedgerCsv(out).rows.map((x) => x.type)).toEqual(['usage', undefined, 'subscription']);
  });
  it('keeps the 4-column format when no row has a type', () => {
    expect(toLedgerCsv([{ merchant: 'M', provider: 'P', amountCents: 100, date: '2026-01-01' }]).split('\r\n')[0]).toBe('Merchant,Provider,Amount,Date');
  });
  it('understands loose type names', () => {
    expect(parseServiceType('API credits')).toBe('usage');
    expect(parseServiceType('Plan')).toBe('subscription');
    expect(parseServiceType('')).toBeNull();
  });
});
