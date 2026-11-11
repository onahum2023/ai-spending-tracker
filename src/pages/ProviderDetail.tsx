import { useMemo } from 'react';
import { SingleSeriesMonthlyChart } from '../components/charts';
import { TransactionTable } from '../components/TransactionTable';
import { TagRuleInput, TagSuggestions } from '../components/TagEditor';
import { ChargeTypesCard } from '../components/ChargeTypes';
import { Card, EmptyState, Kpi } from '../components/ui';
import { CATEGORIES, CATEGORY_LABELS, isCategory } from '../lib/categories';
import { filterPeriod, periodLabel } from '../lib/analytics';
import { dateLabel, monthLabel, monthOf, monthsBetween } from '../lib/dates';
import { formatEUR, medianCents, sumCents } from '../lib/money';
import { href } from '../router';
import { useLedger } from '../store';

export function ProviderDetail({ provider }: { provider: string }) {
  const { transactions, span, colors, period, providers, providerCategories, setProviderCategory, tagRules } = useLedger();
  const ownCategory = providerCategories.find((c) => c.provider === provider)?.category ?? '';
  const rows = useMemo(() => transactions.filter((t) => t.provider === provider), [transactions, provider]);

  if (!span) return null;
  if (rows.length === 0) {
    return (
      <Card title="Provider not found">
        <EmptyState>
          No transactions for “{provider}”. <a href={href(['providers'])} style={{ textDecoration: 'underline' }}>Back to providers</a>
        </EmptyState>
      </Card>
    );
  }

  const total = sumCents(rows);
  const periodRows = filterPeriod(rows, period);
  const months = monthsBetween(span.firstMonth, span.lastMonth);
  const activeMonths = new Set(rows.map((r) => monthOf(r.date))).size;
  const rank = providers.findIndex((p) => p.provider === provider) + 1;
  const first = rows[0].date;
  const last = rows[rows.length - 1].date;

  return (
    <div className="stack">
      <TagSuggestions />
      <div className="grid kpis">
        <Kpi label="All-time spending" value={formatEUR(total)} sub={`#${rank} of ${providers.length} providers · ${Math.round((total / sumCents(transactions)) * 100)}% of all`} />
        <Kpi label={periodLabel(period)} value={formatEUR(sumCents(periodRows))} sub={`${periodRows.length} charge${periodRows.length === 1 ? '' : 's'} in selected period`} />
        <Kpi label="Transactions" value={rows.length} sub={`in ${activeMonths} of ${months.length} months`} />
        <Kpi label="Typical charge" value={formatEUR(medianCents(rows.map((r) => r.amountCents)))} sub={`median · range ${formatEUR(Math.min(...rows.map((r) => r.amountCents)))}–${formatEUR(Math.max(...rows.map((r) => r.amountCents)))}`} />
        <Kpi label="First → most recent" value={<span style={{ fontSize: 16 }}>{dateLabel(first)}</span>} sub={`Most recent: ${dateLabel(last)}`} />
      </div>

      <Card title="Monthly spending" subtitle={`${monthLabel(span.firstMonth)} – ${monthLabel(span.lastMonth)}`}>
        <SingleSeriesMonthlyChart rows={rows} months={months} color={colors.color(provider)} />
      </Card>

      <ChargeTypesCard
        provider={provider}
        rows={rows}
        actions={
          <>
            <TagRuleInput provider={provider} saved={tagRules.find((r) => r.provider === provider)?.tag ?? ''} />
            <label className="row small" style={{ gap: 6 }} title="Charts, budgets and overlap use this category for every charge from this provider. Totals never change.">
              <span className="secondary">Category</span>
              <select
                className="select input-sm"
                value={ownCategory}
                aria-label={`Category for ${provider}`}
                onChange={(e) => void setProviderCategory(provider, isCategory(e.target.value) ? e.target.value : null)}
              >
                <option value="">Automatic</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                ))}
              </select>
            </label>
          </>
        }
      />

      <Card
        title="Transaction history"
        subtitle={`${rows.length} transactions · ${formatEUR(total)}`}
        actions={<a className="btn btn-sm btn-ghost" href={href(['transactions'], { provider })}>Open in Transactions →</a>}
      >
        <TransactionTable rows={rows} showProvider={false} />
      </Card>
    </div>
  );
}
