import { useMemo, useState } from 'react';
import { BudgetCard } from '../components/BudgetSection';
import { heroLabel, OverviewHero, OverviewTiles } from '../components/OverviewHero';
import { MonthlyCategoryChart, MonthlyProviderChart, TypeChart } from '../components/charts';
import { TransactionTable } from '../components/TransactionTable';
import { Button, Card, CardAction, Disclosure, EmptyState, ProviderAvatar, ReadChip, Segmented } from '../components/ui';
import { filterPeriod, periodKey, periodLabel, summarizeProviders } from '../lib/analytics';
import { OTHER_KEY } from '../lib/colors';
import { dateLabel, daysInMonth, monthLabel, monthOf, yearOf } from '../lib/dates';
import { forecastCurrentMonth } from '../lib/forecast';
import { formatEUR, sumCents } from '../lib/money';
import type { Period } from '../lib/types';
import { href, providerHref } from '../router';
import { useLedger } from '../store';

type ChartView = 'provider' | 'category' | 'type';
const VIEW_NAMES: Record<ChartView, string> = { provider: 'provider', category: 'category', type: 'commitment type' };

/**
 * The Overview. Row 1: the hero (what the period came to, and for the month in progress what is still due) beside four stat tiles.
 * Row 2: the monthly chart and who the money went to. Row 3: the period's charges and the budget.
 */
export function Overview() {
  const { transactions, span, period, setPeriod, today, analysis } = useLedger();
  const [view, setView] = useState<ChartView>('provider');
  // The month that is still in progress: where the estimate and the budget apply.
  const currentMonth = span ? monthOf(span.lastDate > today ? span.lastDate : today) : '';
  const periodRows = useMemo(() => filterPeriod(transactions, period), [transactions, period]);
  const forecast = useMemo(
    () => forecastCurrentMonth(transactions, today, undefined, analysis.expected, analysis.typeOf),
    [transactions, today, analysis],
  );

  if (!span) return null;

  // One "as of" date for the whole page: where the data runs through (the header says "Data through").
  const asOf = span.lastDate;
  const inProgress = period.kind === 'month' && period.month === currentMonth;
  const yearInProgress = period.kind === 'year' && period.year === yearOf(currentMonth);

  const chartMonths =
    period.kind === 'all'
      ? span.months
      : span.months.filter((m) => yearOf(m) === (period.kind === 'year' ? period.year : yearOf(period.month)));
  // Charges still due stack on the current month's bar, in whichever grouping the chart shows.
  const projection =
    forecast.status === 'ok' && forecast.expected.length > 0 && chartMonths.includes(forecast.month)
      ? { month: forecast.month, charges: forecast.expected }
      : undefined;

  const selectedMonth = period.kind === 'month' ? period.month : null;
  // A bar is a period: clicking one does what picking that month in the date selector does.
  const openMonth = (month: string) => setPeriod({ kind: 'month', month });
  const chartProps = { rows: transactions, months: chartMonths, projection, selectedMonth, onSelectMonth: openMonth, fill: true };
  const chartYear = period.kind === 'all' ? '' : ` · ${period.kind === 'year' ? period.year : yearOf(period.month)}`;

  return (
    <div className="stack overview">
      <div className="overview-hero">
        <OverviewHero label={heroLabel(period, inProgress, yearInProgress)} totalCents={sumCents(periodRows)} inProgress={inProgress} forecast={forecast} />
        <OverviewTiles period={period} inProgress={inProgress} asOf={asOf} />
      </div>

      <div className="overview-row">
        <Card
          className="chart-card"
          title="Monthly spending"
          subtitle={`By ${VIEW_NAMES[view]}${chartYear}`}
          badge={view === 'type' ? <ReadChip>Suggested</ReadChip> : undefined}
          action={
            <Segmented<ChartView>
              label="Group by"
              value={view}
              onChange={setView}
              options={[
                { value: 'provider', label: 'Provider' },
                { value: 'category', label: 'Category' },
                { value: 'type', label: 'Commitment' },
              ]}
            />
          }
        >
          <div className="chart-body">
            {view === 'provider' ? (
              <MonthlyProviderChart {...chartProps} />
            ) : view === 'type' ? (
              <TypeChart {...chartProps} typeOf={analysis.typeOf} />
            ) : (
              <MonthlyCategoryChart {...chartProps} categoryFor={analysis.categoryOf} />
            )}
          </div>
          {view === 'type' && (
            <div style={{ marginTop: 12 }}>
              <Disclosure label="How are these found?">
                <p className="meta" style={{ margin: 0 }}>
                  Amounts and dates are the ledger. Whether a charge is a subscription, usage or one-time is the app's read, and stays a
                  suggestion until you confirm it on the provider's page: a charge is a subscription once it has appeared monthly for three
                  months in a row, and usage when the same descriptor is charged three or more times without that rhythm.
                </p>
              </Disclosure>
            </div>
          )}
        </Card>
        <WhoItWentTo rows={periodRows} label={periodLabel(period)} />
      </div>

      <div className="overview-row">
        <ChargesCard key={periodKey(period)} period={period} />
        <BudgetCard />
      </div>
      {today < span.lastDate && (
        <p className="meta">Note: some transactions are dated after today ({dateLabel(today)}).</p>
      )}
    </div>
  );
}

const TOP_PROVIDERS = 6;

/** Who the period's money went to: the top six providers and the rest as "Other", each with its amount, share and a bar. */
function WhoItWentTo({ rows, label }: { rows: { provider: string; amountCents: number; date: string; merchant: string }[]; label: string }) {
  const { colors } = useLedger();
  const summary = summarizeProviders(rows);
  const total = sumCents(rows);
  const top = summary.slice(0, TOP_PROVIDERS);
  const rest = summary.slice(TOP_PROVIDERS);
  const restCents = sumCents(rest.map((s) => ({ amountCents: s.totalCents })));
  const max = top[0]?.totalCents ?? 1;
  const share = (cents: number) => `${Math.round((cents / total) * 100)}%`;
  return (
    <Card
      title="Who it went to"
      subtitle={`${label} · ${formatEUR(total)}`}
      action={<CardAction href={href(['providers'])}>All providers</CardAction>}
    >
      {summary.length === 0 ? (
        <EmptyState>No spending recorded in this period.</EmptyState>
      ) : (
        <div className="bar-list">
          {top.map((s) => (
            <a key={s.provider} className="bar-item" href={providerHref(s.provider)}>
              <span className="bar-name">
                <ProviderAvatar provider={s.provider} size={20} />
                <span>{s.provider}</span>
              </span>
              <span className="num bar-amount">
                {formatEUR(s.totalCents)} <span className="meta">{share(s.totalCents)}</span>
              </span>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${(s.totalCents / max) * 100}%`, background: colors.color(s.provider) }} />
              </div>
            </a>
          ))}
          {rest.length > 0 && (
            <div className="bar-item">
              <span className="bar-name">
                <ProviderAvatar provider={OTHER_KEY} size={20} text={`+${rest.length}`} />
                <span>Other ({rest.length})</span>
              </span>
              <span className="num bar-amount">
                {formatEUR(restCents)} <span className="meta">{share(restCents)}</span>
              </span>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${(restCents / max) * 100}%`, background: colors.otherColor }} />
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

const TOP_CHARGES = 5;

/**
 * The period's charges, largest first: the top few, then all of them. This is the way from the Overview into the transactions
 * behind a bar: the footer opens the Transactions page already filtered to the period.
 */
function ChargesCard({ period }: { period: Period }) {
  const { transactions } = useLedger();
  const [all, setAll] = useState(false);
  const rows = useMemo(
    () => [...filterPeriod(transactions, period)].sort((a, b) => b.amountCents - a.amountCents || (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [transactions, period],
  );
  const shown = all ? rows : rows.slice(0, TOP_CHARGES);
  const filter =
    period.kind === 'month'
      ? { from: `${period.month}-01`, to: `${period.month}-${String(daysInMonth(period.month))}` }
      : period.kind === 'year'
        ? { from: `${period.year}-01-01`, to: `${period.year}-12-31` }
        : undefined;
  const title = period.kind === 'month' ? `Charges in ${monthLabel(period.month)}` : `Largest charges · ${periodLabel(period)}`;
  return (
    <Card
      title={title}
      subtitle={`${rows.length} transaction${rows.length === 1 ? '' : 's'}, largest first`}
      action={<CardAction href={href(['transactions'], filter)}>Open in Transactions</CardAction>}
    >
      <div className={all ? 'charges-scroll' : undefined}>
        <TransactionTable rows={shown} showType={false} showTotal={all} initialSort={{ key: 'amount', dir: 'desc' }} emptyText="No charges recorded in this period." />
      </div>
      {rows.length > TOP_CHARGES && (
        <div className="card-foot">
          <Button variant="text" onClick={() => setAll((v) => !v)} aria-expanded={all}>
            {all ? `Show top ${TOP_CHARGES}` : `Show all ${rows.length}`}
          </Button>
        </div>
      )}
    </Card>
  );
}
