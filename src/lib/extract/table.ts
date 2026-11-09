import { detectDayOrder, oneLine, parseLooseAmount, parseLooseDate, type DayOrder } from './parse';
import type { StatementRow } from './types';

/*
 * Reads statement-like tables (Excel sheets or CSV) whose columns we find by name.
 * Works for the Amex transaction export and common bank CSVs (Revolut CSV, ING, Wise...).
 */

type Role =
  | 'date' | 'merchant' | 'statementAs' | 'amount' | 'out' | 'in' | 'direction'
  | 'details' | 'country' | 'category' | 'state' | 'type' | 'counterparty';

const HEADERS: Record<Role, RegExp> = {
  date: /^(datum|date|transaction date|transactiedatum|boekingsdatum|booking date|completed date|started date|value date|fecha|data|buchungsdatum|date de l'opération|date operation)$/i,
  merchant: /^(omschrijving|description|merchant|merchant name|naam ?\/ ?omschrijving|naam|name|payee|details|beschrijving|beschreibung|libellé|verwendungszweck|transaction description)$/i,
  statementAs: /^(vermeld op uw rekeningoverzicht als|appears on your statement as|wird auf ihrer abrechnung angezeigt als)$/i,
  amount: /^(bedrag|amount|bedrag \(eur\)|amount \(eur\)|betrag|montant|transaction amount|value|bedrag eur)$/i,
  out: /^(money out|debit|debet|af|uitgaven|paid out|withdrawal|soll|débit)$/i,
  in: /^(money in|credit|bij|inkomsten|paid in|deposit|haben|crédit)$/i,
  direction: /^(af bij|af\/bij|debit\/credit|credit\/debit|d\/c)$/i,
  details: /^(aanvullende informatie|additional information|extra details|mededelingen|reference|referentie|notes|memo|remarks)$/i,
  country: /^(land|country|pays)$/i,
  category: /^(categorie|category|kategorie|catégorie)$/i,
  state: /^(state|status)$/i,
  type: /^(type|transaction type|mutatiesoort|code)$/i,
  counterparty: /^(tegenrekening|counterparty|counter party|iban|account)$/i,
};

const norm = (v: unknown) => oneLine(v).replace(/\s+/g, ' ').trim();
/** Merchant text kept exactly as printed (inner spacing matters for duplicate detection). */
const exact = (v: unknown) => oneLine(v).trim();

function findHeader(table: unknown[][]): { row: number; cols: Partial<Record<Role, number>> } | null {
  for (let r = 0; r < Math.min(table.length, 40); r++) {
    const cols: Partial<Record<Role, number>> = {};
    table[r].forEach((cell, c) => {
      const h = norm(cell);
      if (!h) return;
      for (const role of Object.keys(HEADERS) as Role[]) {
        if (cols[role] === undefined && HEADERS[role].test(h)) {
          cols[role] = c;
          break;
        }
      }
    });
    const hasAmount = cols.amount !== undefined || (cols.out !== undefined && cols.in !== undefined);
    if (cols.date !== undefined && (cols.merchant !== undefined || cols.statementAs !== undefined) && hasAmount) {
      return { row: r, cols };
    }
  }
  return null;
}

/** Card statements list charges as positive numbers; bank accounts list money out as negative. */
export type SignConvention = 'charges-positive' | 'charges-negative';

const PAYMENT_RE = /\b(betaling|payment|thank you|bedankt|autopay|incasso|repayment|paiement|zahlung)\b/i;

function detectSign(amounts: { cents: number; text: string }[]): SignConvention {
  const pos = amounts.filter((a) => a.cents > 0).length;
  const neg = amounts.filter((a) => a.cents < 0);
  const negArePayments = neg.length > 0 && neg.filter((a) => PAYMENT_RE.test(a.text)).length >= neg.length / 2;
  if (negArePayments || pos > neg.length * 2) return 'charges-positive';
  return 'charges-negative';
}

export interface TableReadOptions {
  sign?: SignConvention;
  dayOrder?: DayOrder;
}

export function readTable(
  fileName: string,
  table: unknown[][],
  opts: TableReadOptions = {},
): { rows: StatementRow[]; notes: string[]; format: StatementRow['format']; sign: SignConvention; dayOrder: DayOrder } | { error: string } {
  const header = findHeader(table);
  if (!header) {
    return {
      error:
        'Could not find a header row with a date, a description and an amount column. ' +
        'Export transactions as a table (CSV or Excel) with column names in the first rows.',
    };
  }
  const { row: hr, cols } = header;
  const isAmex = table.slice(0, hr).some((r) => r.some((c) => /american express/i.test(norm(c))));
  const body = table.slice(hr + 1).filter((r) => r.some((c) => norm(c) !== ''));

  const dayOrder = opts.dayOrder ?? detectDayOrder(body.map((r) => r[cols.date!])) ?? (isAmex ? 'mdy' : 'dmy');
  const notes: string[] = [];
  notes.push(`Header found on row ${hr + 1}; dates read as ${dayOrder === 'mdy' ? 'month/day/year' : 'day/month/year'}.`);

  const raw = body.map((r) => {
    let cents: number | null = null;
    if (cols.amount !== undefined) {
      cents = parseLooseAmount(r[cols.amount]);
      if (cents !== null && cols.direction !== undefined) {
        const d = norm(r[cols.direction]).toLowerCase();
        cents = Math.abs(cents) * (/^(af|debit|d|out)/.test(d) ? -1 : 1);
      }
    } else {
      const out = parseLooseAmount(r[cols.out!]);
      const inn = parseLooseAmount(r[cols.in!]);
      if (out) cents = -Math.abs(out);
      else if (inn) cents = Math.abs(inn);
      else cents = out === 0 || inn === 0 ? 0 : null;
    }
    const merchant = exact(r[cols.statementAs ?? cols.merchant!]) || exact(r[cols.merchant!]);
    return { r, cents, merchant };
  });

  const sign = opts.sign ?? (cols.direction !== undefined || cols.out !== undefined ? 'charges-negative' : detectSign(raw.filter((x) => x.cents !== null).map((x) => ({ cents: x.cents!, text: x.merchant }))));
  notes.push(sign === 'charges-positive' ? 'Charges are positive amounts (card statement).' : 'Charges are negative amounts (bank account).');

  const rows: StatementRow[] = [];
  let skipped = 0;
  raw.forEach(({ r, cents, merchant }, i) => {
    const date = parseLooseDate(r[cols.date!], dayOrder);
    if (!date || cents === null || !merchant) {
      skipped++;
      return;
    }
    const state = cols.state !== undefined ? norm(r[cols.state]).toUpperCase() : '';
    if (state && !/^(COMPLETED|BOOKED|SETTLED|DONE|VOLTOOID)$/.test(state)) {
      skipped++;
      return;
    }
    const type = cols.type !== undefined ? norm(r[cols.type]).toUpperCase() : '';
    const charge = sign === 'charges-positive' ? cents : -cents;
    let kind: StatementRow['kind'] = 'card';
    if (PAYMENT_RE.test(merchant) && charge < 0) kind = 'payment';
    else if (/TRANSFER|TOPUP|EXCHANGE|OVERSCHRIJVING|GIRO|ONLINE BANKIEREN/.test(type)) kind = 'transfer';
    const label = cols.statementAs !== undefined && cols.merchant !== undefined ? exact(r[cols.merchant]) : undefined;
    const detailParts = [
      cols.details !== undefined ? norm(r[cols.details]) : '',
      cols.counterparty !== undefined ? norm(r[cols.counterparty]) : '',
    ].filter(Boolean);
    rows.push({
      id: `${fileName}#${hr + 2 + i}`,
      source: fileName,
      format: isAmex ? 'amex' : 'table',
      date,
      amountCents: charge,
      merchant,
      label: label && label !== merchant ? label : undefined,
      details: detailParts.join(' · ') || undefined,
      country: cols.country !== undefined ? norm(r[cols.country]) || undefined : undefined,
      bankCategory: cols.category !== undefined ? norm(r[cols.category]) || undefined : undefined,
      kind,
    });
  });
  if (skipped) notes.push(`${skipped} row${skipped === 1 ? '' : 's'} skipped (missing date or amount, or not completed).`);
  return { rows, notes, format: isAmex ? 'amex' : 'table', sign, dayOrder };
}
