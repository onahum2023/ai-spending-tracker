import { dataSpan } from './analytics';
import type { Category } from './categories';
import { CATEGORIES, CATEGORY_LABELS } from './categories';
import { forecastCurrentMonth } from './forecast';
import { formatEUR } from './money';
import type { LedgerRow } from './types';

/*
 * Budgets
 * -------
 * A monthly budget, in total and/or per category, compared with what has been spent
 * so far this month and with the month-end estimate (see forecast.ts). Saved in this
 * browser only. A category estimate uses the same method as the total, applied to that
 * category's charges.
 */

export interface Budgets {
  /** Whole-month budget across everything. */
  totalCents: number | null;
  byCategory: Partial<Record<Category, number>>;
}

export const EMPTY_BUDGETS: Budgets = { totalCents: null, byCategory: {} };

export function hasBudgets(b: Budgets): boolean {
  return b.totalCents !== null || Object.values(b.byCategory).some((v) => typeof v === 'number' && v > 0);
}

/** Cleans anything read from storage or a form: positive whole cents only. */
export function normalizeBudgets(raw: unknown): Budgets {
  const out: Budgets = { totalCents: null, byCategory: {} };
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as { totalCents?: unknown; byCategory?: unknown };
  const ok = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
  if (ok(r.totalCents)) out.totalCents = r.totalCents;
  if (r.byCategory && typeof r.byCategory === 'object') {
    for (const c of CATEGORIES) {
      const v = (r.byCategory as Record<string, unknown>)[c];
      if (ok(v)) out.byCategory[c] = v;
    }
  }
  return out;
}

export type BudgetStatus = 'under' | 'at-risk' | 'over';

export interface BudgetLine {
  key: 'total' | Category;
  label: string;
  budgetCents: number;
  actualCents: number;
  /** Month-end estimate, or null when there is not enough history for one. */
  projectedCents: number | null;
  status: BudgetStatus;
  /** One plain sentence: "On track to exceed by €40", "€120 left". */
  summary: string;
}

export interface BudgetReport {
  month: string;
  lines: BudgetLine[];
  /** Set when estimates are unavailable, so the page can say why. */
  note: string | null;
}

function line(
  key: BudgetLine['key'],
  label: string,
  budgetCents: number,
  actualCents: number,
  projectedCents: number | null,
): BudgetLine {
  let status: BudgetStatus = 'under';
  let summary: string;
  if (actualCents > budgetCents) {
    status = 'over';
    summary = `Over budget by ${formatEUR(actualCents - budgetCents)}`;
  } else if (projectedCents !== null && projectedCents > budgetCents) {
    status = 'at-risk';
    summary = `On track to exceed by ${formatEUR(projectedCents - budgetCents)}`;
  } else if (projectedCents !== null) {
    summary = `${formatEUR(budgetCents - actualCents)} left · estimated ${formatEUR(budgetCents - projectedCents)} under`;
  } else {
    summary = `${formatEUR(budgetCents - actualCents)} left`;
  }
  return { key, label, budgetCents, actualCents, projectedCents, status, summary };
}

export function evaluateBudgets<T extends LedgerRow>(
  rows: T[],
  budgets: Budgets,
  today: string,
  categoryFor: (row: T) => Category,
): BudgetReport {
  const span = dataSpan(rows);
  const total = forecastCurrentMonth(rows, today, span);
  const month = total.month;
  const projectedOf = (f: ReturnType<typeof forecastCurrentMonth>) => (f.status === 'ok' ? f.projectedCents : null);

  const lines: BudgetLine[] = [];
  if (budgets.totalCents !== null) {
    lines.push(line('total', 'All spending', budgets.totalCents, total.actualCents, projectedOf(total)));
  }
  for (const c of CATEGORIES) {
    const b = budgets.byCategory[c];
    if (!b) continue;
    const subset = rows.filter((r) => categoryFor(r) === c);
    const f = forecastCurrentMonth(subset, today, span);
    lines.push(line(c, CATEGORY_LABELS[c], b, f.actualCents, projectedOf(f)));
  }
  return {
    month,
    lines,
    note: total.status === 'insufficient' ? `No month-end estimate: ${total.reason}` : null,
  };
}
