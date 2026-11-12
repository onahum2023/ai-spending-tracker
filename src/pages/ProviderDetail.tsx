import { useMemo } from 'react';
import { ProviderMonthlyChart } from '../components/charts';
import { TransactionTable } from '../components/TransactionTable';
import { TagRuleInput, TagSuggestions } from '../components/TagEditor';
import { ChargeTypesCard } from '../components/ChargeTypes';
import { Card, CardAction, CardSection, EmptyState, ReadChip, StatRow } from '../components/ui';
import { CATEGORIES, CATEGORY_LABELS, isCategory } from '../lib/categories';
import { filterPeriod, periodLabel } from '../lib/analytics';
import { dateLabel, monthLabel, monthOf, yearOf } from '../lib/dates';
import { forecastCurrentMonth } from '../lib/forecast';
import { formatEUR, medianCents, sumCents } from '../lib/money';
import { href } from '../router';
import { useLedger } from '../store';

export function ProviderDetail({ provider }: { provider: string }) {
  const { transactions, span, period, setPeriod, today, analysis, providers, providerCategories, setProviderCategory, tagRules } = useLedger();
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
          No transactions for “{provider}”. <a href={href(['providers'])} style={{ textDecoration: 'underline' }}>Back to providers</a>
        </EmptyState>
      </Card>
    );
  }

  const total = sumCents(rows);
  const periodRows = filterPeriod(rows, period);
  const rank = providers.findIndex((p) => p.provider === provider) + 1;
  const first = rows.reduce((a, r) => (r.date < a ? r.date : a), rows[0].date);
  const last = rows.reduce((a, r) => (r.date > a ? r.date : a), rows[0].date);
  const amounts = rows.map((r) => r.amountCents);

  // The same chart as the Overview's: the months of the selected year (all months for All time), from the provider's first charge.
  const currentMonth = monthOf(span.lastDate > today ? span.lastDate : today);
  const inProgress = period.kind === 'month' && period.month === currentMonth;
  const yearInProgress = period.kind === 'year' && period.year === yearOf(currentMonth);
  const chartYear = period.kind === 'all' ? null : period.kind === 'year' ? period.year : yearOf(period.month);
  const fromFirst = span.months.filter((m) => m >= monthOf(first));
  const inYear = fromFirst.filter((m) => chartYear === null || yearOf(m) === chartYear);
  const months = inYear.length > 0 ? inYear : fromFirst;
  const projection =
    forecast.status === 'ok' && forecast.expected.length > 0 && months.includes(forecast.month)
      ? { month: forecast.month, charges: forecast.expected }
      : undefined;
  const title = `${provider} · ${periodLabel(period)}`;

  return (
    <div className="stack">
      <TagSuggestions />
      <div className="overview-top">
        <Card
          className="chart-card"
          title={title}
          subtitle={inProgress || yearInProgress ? `As of last import, ${dateLabel(span.lastDate)}` : undefined}
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
          <div className="chart-caption">Monthly spending{chartYear === null ? '' : ` · ${chartYear}`}</div>
          <div className="chart-body">
            <ProviderMonthlyChart
              provider={provider}
              rows={rows}
              months={months}
              projection={projection}
              selectedMonth={period.kind === 'month' ? period.month : null}
              onSelectMonth={(month) => setPeriod({ kind: 'month', month })}
              fill
            />
          </div>
        </Card>

        <Card className="overview-side" title="At a glance" subtitle="All time">
          <CardSection>
            <StatRow label="Total" value={formatEUR(total)} sub={`#${rank} of ${providers.length} · ${Math.round((total / sumCents(transactions)) * 100)}%`} />
            <StatRow label="Charges" value={rows.length} sub={`since ${monthLabel(monthOf(first))}`} />
            <StatRow label="Typical charge" value={formatEUR(medianCents(amounts))} sub={`median · range ${formatEUR(Math.min(...amounts))}–${formatEUR(Math.max(...amounts))}`} />
            <StatRow label="Last charge" value={dateLabel(last)} />
          </CardSection>
          <CardSection label="Provider settings">
            <div className="stack" style={{ gap: 12, marginTop: 12 }}>
              <TagRuleInput provider={provider} saved={tagRules.find((r) => r.provider === provider)?.tag ?? ''} />
              <label className="field" title="Charts, budgets and overlap use this category for every charge from this provider. Totals never change.">
                Category
                <select
                  className="select"
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
            </div>
          </CardSection>
        </Card>
      </div>

      <ChargeTypesCard provider={provider} rows={rows} />

      <Card
        title="Transaction history"
        subtitle={`${rows.length} transactions · ${formatEUR(total)}`}
        action={<CardAction href={href(['transactions'], { provider })}>Open in Transactions</CardAction>}
      >
        <TransactionTable rows={rows} showProvider={false} />
      </Card>
    </div>
  );
}
