// Dates are plain "YYYY-MM-DD" strings and months are "YYYY-MM" strings.
// All arithmetic is done in UTC so local time zones never shift a day.

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidDate(s: string): boolean {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return false;
  return d <= daysInMonth(`${m[1]}-${m[2]}`) && y >= 1900 && y <= 2200;
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function yearOf(dateOrMonth: string): number {
  return Number(dateOrMonth.slice(0, 4));
}

export function dayOf(date: string): number {
  return Number(date.slice(8, 10));
}

export function daysInMonth(month: string): number {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addMonths(month: string, n: number): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1 + n;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${yy}-${String(mm + 1).padStart(2, '0')}`;
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Same day `n` months later, clamped to the month's last day (Jan 31 + 1 -> Feb 28). */
export function addMonthsToDate(date: string, n: number): string {
  const next = addMonths(monthOf(date), n);
  const day = Math.min(dayOf(date), daysInMonth(next));
  return `${next}-${String(day).padStart(2, '0')}`;
}

/** Same day next month, clamped to the month's last day (Jan 31 -> Feb 28). */
export function addOneMonthToDate(date: string): string {
  return addMonthsToDate(date, 1);
}

/** Number of months between two months (b - a). */
export function monthDiff(a: string, b: string): number {
  return (yearOf(b) - yearOf(a)) * 12 + (Number(b.slice(5, 7)) - Number(a.slice(5, 7)));
}

/** Inclusive list of months from `from` to `to`. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}

/** Today's local calendar date as YYYY-MM-DD. */
export function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "2026-11" -> "Nov 2026" */
export function monthLabel(month: string): string {
  return `${MONTHS_SHORT[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
}

/** "2026-11" -> "November 2026" */
export function monthLabelLong(month: string): string {
  return `${MONTHS_LONG[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
}

/** "2026-11" -> "Nov" */
export function monthShort(month: string): string {
  return MONTHS_SHORT[Number(month.slice(5, 7)) - 1];
}

/** "2026-11-05" -> "5 Nov 2026" */
export function dateLabel(date: string): string {
  return `${dayOf(date)} ${MONTHS_SHORT[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;
}

/** "2026-11-05" -> "5 Nov" */
export function dateLabelShort(date: string): string {
  return `${dayOf(date)} ${MONTHS_SHORT[Number(date.slice(5, 7)) - 1]}`;
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
