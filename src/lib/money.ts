// All money is stored and summed as integer euro cents.
// Floats are only produced at the very edge, for chart geometry.

const AMOUNT_RE = /^(-)?(\d+)(?:\.(\d{1,2}))?$/;

/** Parses "12.34" -> 1234 without going through floating point. Returns null if invalid. */
export function parseAmountToCents(raw: string): number | null {
  const m = AMOUNT_RE.exec(raw.trim());
  if (!m) return null;
  const whole = Number(m[2]);
  const frac = Number((m[3] ?? '').padEnd(2, '0'));
  const cents = whole * 100 + frac;
  if (!Number.isSafeInteger(cents)) return null;
  return m[1] ? -cents : cents;
}

/** 1234 -> "12.34" (CSV format: dot decimal, no grouping, no symbol). */
export function centsToPlain(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

const eur = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' });
const eurWhole = new Intl.NumberFormat('en-IE', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

/** 123456 -> "€1,234.56" */
export function formatEUR(cents: number): string {
  return eur.format(cents / 100);
}

/** Rounded display for axes and compact labels: 123456 -> "€1,235" */
export function formatEURWhole(cents: number): string {
  return eurWhole.format(Math.round(cents / 100));
}

/** Signed difference, e.g. "+€12.40" / "−€3.10". */
export function formatSignedEUR(cents: number): string {
  if (cents === 0) return formatEUR(0);
  return `${cents > 0 ? '+' : '−'}${formatEUR(Math.abs(cents))}`;
}

/** Percentage change from `before` to `after`, or null when there is no base. */
export function pctChange(before: number, after: number): number | null {
  if (before === 0) return null;
  return ((after - before) / Math.abs(before)) * 100;
}

export function formatPct(p: number | null, digits = 0): string {
  if (p === null || !Number.isFinite(p)) return '—';
  const s = Math.abs(p).toFixed(digits);
  if (Number(s) === 0) return '0%';
  return `${p > 0 ? '+' : '−'}${s}%`;
}

export function sumCents(rows: { amountCents: number }[]): number {
  let total = 0;
  for (const r of rows) total += r.amountCents;
  return total;
}

/** Middle value; for even counts the lower-middle, so the result is always a real observed amount. */
export function medianCents(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}
