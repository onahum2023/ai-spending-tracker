import { useMemo, useState } from 'react';
import { evaluateBudgets, hasBudgets, type BudgetLine, type Budgets } from '../lib/budgets';
import { CATEGORIES, CATEGORY_LABELS, type Category } from '../lib/categories';
import { monthLabelLong } from '../lib/dates';
import { centsToPlain, formatEUR, parseAmountToCents } from '../lib/money';
import { useLedger } from '../store';
import { CardAction, CardSection, Button, Input } from './ui';

/** "120", "120.5", "1 200,00", "€120" -> cents. Empty -> null (no budget). Throws a readable message when invalid. */
export function parseBudgetInput(raw: string): number | null {
  const t = raw.replace(/[€\s]/g, '').replace(',', '.');
  if (t === '') return null;
  const cents = parseAmountToCents(t);
  if (cents === null || cents <= 0) throw new Error(`"${raw.trim()}" is not an amount like 120 or 120.50`);
  return cents;
}

function BudgetBar({ line }: { line: BudgetLine }) {
  const scale = Math.max(line.budgetCents, line.atLeastCents ?? 0, line.actualCents, 1);
  const actualPct = (Math.min(line.actualCents, scale) / scale) * 100;
  const estCents = line.atLeastCents !== null ? Math.max(line.atLeastCents - line.actualCents, 0) : 0;
  const estPct = (Math.min(estCents, scale - line.actualCents) / scale) * 100;
  const markPct = (line.budgetCents / scale) * 100;
  return (
    <div
      className="budget-bar"
      role="img"
      aria-label={`${formatEUR(line.actualCents)} spent of ${formatEUR(line.budgetCents)} budget${line.atLeastCents !== null ? `, at least ${formatEUR(line.atLeastCents)} by month end` : ''}`}
    >
      <div className={`budget-actual${line.status === 'over' ? ' is-over' : ''}`} style={{ width: `${actualPct}%` }} />
      {estPct > 0 && <div className="forecast-est" style={{ left: `${actualPct}%`, width: `${estPct}%` }} />}
      <div className="budget-mark" style={{ left: `${markPct}%` }} title={`Budget ${formatEUR(line.budgetCents)}`} />
    </div>
  );
}

/**
 * The monthly budget, as plain rows in the side column: a link to set one, or, once set, a small bar of what is recorded plus
 * what is still due against it.
 */
export function BudgetSection() {
  const { transactions, today, analysis, budgets, setBudgets } = useLedger();
  const [editing, setEditing] = useState(false);
  const report = useMemo(
    () => evaluateBudgets(transactions, budgets, today, analysis.categoryOf, analysis.expected, analysis.typeOf),
    [transactions, budgets, today, analysis],
  );
  const present = useMemo(() => {
    const s = new Set<Category>();
    for (const t of transactions) s.add(analysis.categoryOf(t));
    return CATEGORIES.filter((c) => s.has(c) || budgets.byCategory[c]);
  }, [transactions, analysis, budgets]);

  if (editing) {
    return (
      <CardSection label="Budget">
        <p className="meta" style={{ margin: '4px 0 12px' }}>Leave a field empty for no budget. Saved in this browser only.</p>
        <BudgetForm
          initial={budgets}
          categories={present}
          onCancel={() => setEditing(false)}
          onSave={async (b) => {
            await setBudgets(b);
            setEditing(false);
          }}
        />
      </CardSection>
    );
  }

  if (!hasBudgets(budgets)) {
    return (
      <CardSection label="Budget">
        <Button variant="text" onClick={() => setEditing(true)}>Set a monthly budget</Button>
      </CardSection>
    );
  }

  return (
    <CardSection label={`Budget · ${monthLabelLong(report.month)}`} action={<CardAction onClick={() => setEditing(true)}>Edit</CardAction>}>
      <div className="stack" style={{ gap: 16, marginTop: 12 }}>
        {report.lines.map((l) => (
          <div key={l.key}>
            <div className="row-between">
              <span>{l.label}</span>
              <span className="num amt-row">
                {formatEUR(l.atLeastCents ?? l.actualCents)} <span className="meta" style={{ fontWeight: 400 }}>of {formatEUR(l.budgetCents)}</span>
              </span>
            </div>
            <BudgetBar line={l} />
            <div className="meta">{l.summary}</div>
          </div>
        ))}
        {report.note && <p className="meta">{report.note}</p>}
      </div>
    </CardSection>
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
        <Input inputMode="decimal" placeholder="500" value={value} onChange={(e) => onChange(e.target.value)} aria-label={`${label} budget per month, in euros`} />
      </span>
    </label>
  );

  return (
    <div className="stack" style={{ gap: 12 }}>
      {field('total', 'All spending', total, setTotal)}
      <div className="meta" style={{ marginTop: 4 }}>Per category</div>
      {categories.map((c) => field(c, CATEGORY_LABELS[c], cats[c] ?? '', (v) => setCats((prev) => ({ ...prev, [c]: v }))))}
      {error && <div className="notice notice-error">{error}</div>}
      <div className="row wrap">
        <Button variant="primary" onClick={() => void save()} disabled={busy}>Save budget</Button>
        <Button onClick={onCancel} disabled={busy}>Cancel</Button>
        {hasBudgets(initial) && (
          <Button variant="text"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onSave({ totalCents: null, byCategory: {} });
            }}
          >
            Remove budget
          </Button>
        )}
      </div>
    </div>
  );
}
