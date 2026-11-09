import { useMemo, useState } from 'react';
import { evaluateBudgets, hasBudgets, type BudgetLine, type Budgets } from '../lib/budgets';
import { CATEGORIES, CATEGORY_LABELS, type Category } from '../lib/categories';
import { monthLabelLong } from '../lib/dates';
import { centsToPlain, formatEUR, parseAmountToCents } from '../lib/money';
import { useLedger } from '../store';
import { Card } from './ui';

/** "120", "120.5", "1 200,00", "€120" -> cents. Empty -> null (no budget). Throws a readable message when invalid. */
export function parseBudgetInput(raw: string): number | null {
  const t = raw.replace(/[€\s]/g, '').replace(',', '.');
  if (t === '') return null;
  const cents = parseAmountToCents(t);
  if (cents === null || cents <= 0) throw new Error(`"${raw.trim()}" is not an amount like 120 or 120.50`);
  return cents;
}

const STATUS_LABEL = { under: 'On track', 'at-risk': 'At risk', over: 'Over' } as const;
const STATUS_CLASS = { under: 'chip-ok', 'at-risk': 'chip-warn', over: 'chip-over' } as const;

function BudgetBar({ line }: { line: BudgetLine }) {
  const scale = Math.max(line.budgetCents, line.projectedCents ?? 0, line.actualCents, 1);
  const actualPct = (Math.min(line.actualCents, scale) / scale) * 100;
  const estCents = line.projectedCents !== null ? Math.max(line.projectedCents - line.actualCents, 0) : 0;
  const estPct = (Math.min(estCents, scale - line.actualCents) / scale) * 100;
  const markPct = (line.budgetCents / scale) * 100;
  return (
    <div
      className="budget-bar"
      role="img"
      aria-label={`${formatEUR(line.actualCents)} spent of ${formatEUR(line.budgetCents)} budget${line.projectedCents !== null ? `, estimated ${formatEUR(line.projectedCents)} by month end` : ''}`}
    >
      <div className={`budget-actual${line.status === 'over' ? ' is-over' : ''}`} style={{ width: `${actualPct}%` }} />
      {estPct > 0 && <div className="forecast-est" style={{ left: `${actualPct}%`, width: `${estPct}%` }} />}
      <div className="budget-mark" style={{ left: `${markPct}%` }} title={`Budget ${formatEUR(line.budgetCents)}`} />
    </div>
  );
}

export function BudgetCard() {
  const { transactions, today, analysis, budgets, setBudgets } = useLedger();
  const [editing, setEditing] = useState(false);
  const report = useMemo(
    () => evaluateBudgets(transactions, budgets, today, analysis.categoryOf),
    [transactions, budgets, today, analysis],
  );
  const present = useMemo(() => {
    const s = new Set<Category>();
    for (const t of transactions) s.add(analysis.categoryOf(t));
    return CATEGORIES.filter((c) => s.has(c) || budgets.byCategory[c]);
  }, [transactions, analysis, budgets]);

  if (editing) {
    return (
      <Card title="Monthly budget" subtitle="Leave a field empty for no budget. Saved in this browser only.">
        <BudgetForm
          initial={budgets}
          categories={present}
          onCancel={() => setEditing(false)}
          onSave={async (b) => {
            await setBudgets(b);
            setEditing(false);
          }}
        />
      </Card>
    );
  }

  if (!hasBudgets(budgets)) {
    return (
      <Card title="Monthly budget" subtitle="Set a limit and see it against the month-end estimate">
        <button className="btn" onClick={() => setEditing(true)}>Set a budget…</button>
      </Card>
    );
  }

  return (
    <Card
      title={`Budget · ${monthLabelLong(report.month)}`}
      subtitle="Spent so far, with the month-end estimate"
      actions={<button className="btn btn-sm" onClick={() => setEditing(true)}>Edit</button>}
    >
      <div className="stack" style={{ gap: 16 }}>
        {report.lines.map((l) => (
          <div key={l.key}>
            <div className="row-between">
              <span style={{ fontWeight: 600 }}>{l.label}</span>
              <span className={`chip ${STATUS_CLASS[l.status]}`}>{STATUS_LABEL[l.status]}</span>
            </div>
            <BudgetBar line={l} />
            <div className="row-between small">
              <span className="secondary">{l.summary}</span>
              <span className="num muted">
                {formatEUR(l.actualCents)} of {formatEUR(l.budgetCents)}
              </span>
            </div>
          </div>
        ))}
        {report.note && <p className="small muted">{report.note}</p>}
      </div>
    </Card>
  );
}

function BudgetForm({
  initial,
  categories,
  onSave,
  onCancel,
}: {
  initial: Budgets;
  categories: Category[];
  onSave: (b: Budgets) => Promise<void>;
  onCancel: () => void;
}) {
  const [total, setTotal] = useState(initial.totalCents ? centsToPlain(initial.totalCents) : '');
  const [cats, setCats] = useState<Partial<Record<Category, string>>>(
    Object.fromEntries(Object.entries(initial.byCategory).map(([k, v]) => [k, centsToPlain(v as number)])),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    try {
      const next: Budgets = { totalCents: parseBudgetInput(total), byCategory: {} };
      for (const c of categories) {
        const v = parseBudgetInput(cats[c] ?? '');
        if (v !== null) next.byCategory[c] = v;
      }
      setBusy(true);
      setError(null);
      await onSave(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the budget.');
      setBusy(false);
    }
  };

  const field = (id: string, label: string, value: string, onChange: (v: string) => void) => (
    <label key={id} className="budget-field">
      <span>{label}</span>
      <span className="budget-input">
        <span className="muted" aria-hidden="true">€</span>
        <input className="input input-sm" inputMode="decimal" placeholder="no budget" value={value} onChange={(e) => onChange(e.target.value)} aria-label={`${label} budget per month, in euros`} />
      </span>
    </label>
  );

  return (
    <div className="stack" style={{ gap: 10 }}>
      {field('total', 'All spending', total, setTotal)}
      <div className="small secondary" style={{ marginTop: 4 }}>Per category</div>
      {categories.map((c) => field(c, CATEGORY_LABELS[c], cats[c] ?? '', (v) => setCats((prev) => ({ ...prev, [c]: v }))))}
      {error && <div className="notice notice-error">{error}</div>}
      <div className="row wrap">
        <button className="btn btn-primary" onClick={() => void save()} disabled={busy}>Save budget</button>
        <button className="btn" onClick={onCancel} disabled={busy}>Cancel</button>
        {hasBudgets(initial) && (
          <button
            className="btn btn-ghost"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onSave({ totalCents: null, byCategory: {} });
            }}
          >
            Remove budget
          </button>
        )}
      </div>
    </div>
  );
}
