import { isValidDate } from '../dates';

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  // Dutch / German / French short forms that differ from English
  mrt: 3, mei: 5, okt: 10, mär: 3, mai: 5, dez: 12, janv: 1, févr: 2, avr: 4, juil: 7, déc: 12,
};

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Day/month order for numeric dates like 03/04/2026, decided per column. */
export type DayOrder = 'dmy' | 'mdy';

/**
 * Looks at every value in a date column and decides whether numeric dates are
 * day-first or month-first. Returns null when the column never disambiguates.
 */
export function detectDayOrder(values: unknown[]): DayOrder | null {
  let dmy = false;
  let mdy = false;
  for (const v of values) {
    if (typeof v !== 'string') continue;
    const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(v.trim());
    if (!m) continue;
    if (Number(m[1]) > 12) dmy = true;
    if (Number(m[2]) > 12) mdy = true;
  }
  if (dmy && !mdy) return 'dmy';
  if (mdy && !dmy) return 'mdy';
  return null;
}

/** Parses the date formats banks commonly export. Returns YYYY-MM-DD or null. */
export function parseLooseDate(v: unknown, order: DayOrder = 'dmy'): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    // Spreadsheet date cells arrive as UTC midnight.
    return iso(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  }
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    // Excel serial day number (1900 date system).
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  if (typeof v !== 'string') return null;
  const s = v.trim();
  let m: RegExpExecArray | null;
  let out: string | null = null;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?$/.exec(s))) out = iso(+m[1], +m[2], +m[3]);
  else if ((m = /^(\d{4})(\d{2})(\d{2})$/.exec(s))) out = iso(+m[1], +m[2], +m[3]);
  else if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:\s.*)?$/.exec(s))) {
    let y = +m[3];
    if (y < 100) y += 2000;
    out = order === 'mdy' ? iso(y, +m[1], +m[2]) : iso(y, +m[2], +m[1]);
  } else if ((m = /^([A-Za-zÀ-ÿ]{3,5})\.? (\d{1,2}),? (\d{4})$/.exec(s))) {
    const mo = MONTHS[m[1].toLowerCase()];
    if (mo) out = iso(+m[3], mo, +m[2]);
  } else if ((m = /^(\d{1,2}) ([A-Za-zÀ-ÿ]{3,5})\.? (\d{4})$/.exec(s))) {
    const mo = MONTHS[m[2].toLowerCase()];
    if (mo) out = iso(+m[3], mo, +m[1]);
  }
  return out && isValidDate(out) ? out : null;
}

/**
 * Parses amounts like 12.10, -12.10, "1.234,56", "€ 1,234.56", "12,10-" or "(12.10)"
 * into integer cents. The last "." or "," followed by 1–2 digits is the decimal mark.
 */
export function parseLooseAmount(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) : null;
  if (typeof v !== 'string') return null;
  let s = v.trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (/-\s*$/.test(s)) {
    negative = true;
    s = s.replace(/-\s*$/, '');
  }
  s = s.replace(/[€$£₪]|EUR|USD|GBP|ILS|\s/gi, '');
  if (s.startsWith('-')) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith('+')) s = s.slice(1);
  const m = /^(\d{1,3}(?:[.,\s']\d{3})*|\d+)(?:[.,](\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const whole = Number(m[1].replace(/[.,\s']/g, ''));
  const cents = whole * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

/** Collapses whitespace runs (incl. newlines from spreadsheet cells) into single spaces. */
export function oneLine(v: unknown): string {
  return v === null || v === undefined ? '' : String(v).replace(/\s*\n\s*/g, ', ').trim();
}

const CURRENCY_WORDS: [RegExp, string][] = [
  [/amerikaanse dollar|us dollar|u\.s\. dollar/i, 'USD'],
  [/canadese dollar|canadian dollar/i, 'CAD'],
  [/australische dollar|australian dollar/i, 'AUD'],
  [/shekel|sheqel/i, 'ILS'],
  [/pond|pound/i, 'GBP'],
  [/frank|franc/i, 'CHF'],
  [/yen/i, 'JPY'],
];

/** Short, human summary of statement details: the foreign amount if there is one, else the first part. */
export function summarizeDetails(details: string | undefined): string {
  if (!details) return '';
  const amex = /Foreign Spend Amount:\s*([\d.,]+)\s+([^\d]+?)\s+Commission/i.exec(details);
  if (amex) {
    const cur = CURRENCY_WORDS.find(([re]) => re.test(amex[2]))?.[1] ?? amex[2].trim();
    return `${cur} ${amex[1]}`;
  }
  const rev = /Revolut Rate[^)]*\)\s*([$£₪¥][\d,]+\.\d{2})/.exec(details);
  if (rev) return rev[1];
  return details.length > 60 ? `${details.slice(0, 57)}…` : details;
}
