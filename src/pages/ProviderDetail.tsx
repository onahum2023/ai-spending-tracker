import { useMemo } from 'react';
import { ProviderMonthlyChart } from '../components/charts';
import { TransactionTable } from '../components/TransactionTable';
import { TagRuleInput, TagSuggestions } from '../components/TagEditor';
import { ChargeTypesCard } from '../components/ChargeTypes';
import { Button, Card, CardAction, CardSection, EmptyState, Field, ReadChip, Select, StatRow } from '../components/ui';
import { CATEGORIES, CATEGORY_LABELS, isCategory } from '../lib/categories';
import { rowsInMonths } from '../lib/analytics';
import { addMonths, dateLabel, daysInMonth, monthLabel, monthOf } from '../lib/dates';
import { forecastCurrentMonth } from '../lib/forecast';
import { formatEUR, medianCents, sumCents } from '../lib/money';
import { href, navigate } from '../router';
import { useLedger } from '../store';

export function ProviderDetail({ provider }: { provider: string }) {
  const { transactions, span, today, analysis, providers, providerCategories, setProviderCategory, tagRules } = useLedger();
  const ownCategory = providerCategories.find((c) => c.provider === provider)?.category ?? '';
  const rows = useMemo(() => transactions.filter((t) => t.provider === provider), [transactions, provider]);
  const forecast = useMemo(
    () => forecastCurrentMonth(rows, today, span, analysis.expected.filter((e) => e.provider === provider), analysis.typeOf),
    [rows, today, span, analysis, provider],
  );

  if (!span) return null;
  if (rows.length === 0) {
    return (
      <Card title="Provider not found">
        <EmptyState>
          No transactions for “{provider}”. <Button variant="text" href={href(['providers'])}>Back to providers</Button>
        </EmptyState>
      </Card>
    );
  }

  const total = sumCents(rows);
  // No period picker here: the provider page always shows the last 12 months up to the latest charge, beside all time.
  const fromMonth = addMonths(span.lastMonth, -11);
  const periodRows = rowsInMonths(rows, fromMonth, span.lastMonth);
  const rank = providers.findIndex((p) => p.provider === provider) + 1;
  const first = rows.reduce((a, r) => (r.date < a ? r.date : a), rows[0].date);
  const last = rows.reduce((a, r) => (r.date > a ? r.date : a), rows[0].date);
  const amounts = rows.map((r) => r.amountCents);

  // The chart shows the same 12 months, from the provider's first charge if that is later.
  const currentMonth = monthOf(span.lastDate > today ? span.lastDate : today);
  const inProgress = span.lastMonth === currentMonth;
  const months = span.months.filter((m) => m >= fromMonth && m >= monthOf(first));
  const projection =
    forecast.status === 'ok' && forecast.expected.length > 0 && months.includes(forecast.month)
      ? { month: forecast.month, charges: forecast.expected }
      : undefined;
  const title = `${provider} · last 12 months`;

  return (
    <div className="stack">
      <TagSuggestions />
      <div className="overview-top">
        <Card
          className="chart-card"
          title={title}
          subtitle={`${monthLabel(fromMonth)} to ${monthLabel(span.lastMonth)}, data through ${dateLabel(span.lastDate)}`}
        >
          <div className="headline">
            <div className="headline-amount amt-hero num">{formatEUR(sumCents(periodRows))}</div>
            {inProgress && forecast.status === 'ok' && forecast.stillToComeCents > 0 && (
              <div className="headline-est">
                <span className="swatch-hatch" aria-hidden="true" />
                <span>
                  at least <strong className="num">{formatEUR(forecast.atLeastCents)}</strong> by month end
                </span>
                <ReadChip>Estimate</ReadChip>
              </div>
            )}
          </div>
          <div className="chart-caption">Monthly spending · select a month to see its charges</div>
          <div className="chart-body">
            <ProviderMonthlyChart
              provider={provider}
              rows={rows}
              months={months}
              projection={projection}
              selectedMonth={null}
              onSelectMonth={(month) => navigate(['transactions'], { provider, from: `${month}-01`, to: `${month}-${String(daysInMonth(month)).padStart(2, '0')}` })}
              fill
            />
          </div>
        </Card>

        <Card icon="gauge" tone="accent" className="overview-side" title="At a glance" subtitle="All time">
          <CardSection>
            <StatRow label="Total" value={formatEUR(total)} sub={`#${rank} of ${providers.length} · ${Math.round((total / sumCents(transactions)) * 100)}%`} />
            <StatRow label="Charges" value={rows.length} sub={`since ${monthLabel(monthOf(first))}`} />
            <StatRow label="Typical charge" value={formatEUR(medianCents(amounts))} sub={`median · range ${formatEUR(Math.min(...amounts))}–${formatEUR(Math.max(...amounts))}`} />
            <StatRow label="Last charge" value={dateLabel(last)} />
          </CardSection>
          <CardSection label="Provider settings">
            <div className="stack" style={{ gap: 12, marginTop: 12 }}>
              <TagRuleInput provider={provider} saved={tagRules.find((r) => r.provider === provider)?.tag ?? ''} />
              <Field label="Category" title="Charts, budgets and overlap use this category for every charge from this provider. Totals never change.">
                <Select
                  value={ownCategory}
                  aria-label={`Category for ${provider}`}
                  onChange={(e) => void setProviderCategory(provider, isCategory(e.target.value) ? e.target.value : null)}
                >
                  <option value="">Automatic</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                  ))}
                </Select>
              </Field>
            </div>
          </CardSection>
        </Card>
      </div>

      <ChargeTypesCard provider={provider} rows={rows} />

      <Card icon="list" tone="accent"
        title="Transaction history"
        subtitle={`${rows.length} transactions · ${formatEUR(total)}`}
        action={<CardAction href={href(['transactions'], { provider })}>Open in Transactions</CardAction>}
      >
        <TransactionTable rows={rows} showProvider={false} />
      </Card>
    </div>
  );
}
