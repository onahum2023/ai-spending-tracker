import { useMemo, useState } from 'react';
import { filterPeriod } from '../lib/analytics';
import { monthOf, yearOf } from '../lib/dates';
import { forecastCurrentMonth, type Forecast } from '../lib/forecast';
import type { Period, Transaction } from '../lib/types';
import { useLedger } from '../store';
import { MonthlyCategoryChart, MonthlyProviderChart, TypeChart } from './charts';
import { Card, Disclosure, ReadChip, Segmented } from './ui';

/** What the Overview works out once and hands to its parts, so the page and the Welcome page's preview show the same thing. */
export interface OverviewData {
  period: Period;
  /** The newest recorded date: the one "as of" date for the page. */
  asOf: string;
  inProgress: boolean;
  yearInProgress: boolean;
  periodRows: Transaction[];
  forecast: Forecast;
  chartMonths: string[];
  chartProps: {
    rows: Transaction[];
    months: string[];
    projection: { month: string; charges: Extract<Forecast, { status: 'ok' }>['expected'] } | undefined;
    selectedMonth: string | null;
    onSelectMonth: (month: string) => void;
    fill: boolean;
  };
  chartYear: string;
}

/** Null until there is data. Reads the nearest ledger, so inside a demo-only provider it is the demo's Overview. */
export function useOverviewData(): OverviewData | null {
  const { transactions, span, period, setPeriod, today, analysis } = useLedger();
  // The month that is still in progress: where the estimate and the budget apply.
  const currentMonth = span ? monthOf(span.lastDate > today ? span.lastDate : today) : '';
  const periodRows = useMemo(() => filterPeriod(transactions, period), [transactions, period]);
  const forecast = useMemo(
    () => forecastCurrentMonth(transactions, today, undefined, analysis.expected, analysis.typeOf),
    [transactions, today, analysis],
  );
  if (!span) return null;

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
  return {
    period,
    asOf: span.lastDate,
    inProgress,
    yearInProgress,
    periodRows,
    forecast,
    chartMonths,
    chartProps: {
      rows: transactions,
      months: chartMonths,
      projection,
      selectedMonth: period.kind === 'month' ? period.month : null,
      // A bar is a period: clicking one does what picking that month in the date selector does.
      onSelectMonth: (month: string) => setPeriod({ kind: 'month', month }),
      fill: true,
    },
    chartYear: period.kind === 'all' ? '' : ` · ${period.kind === 'year' ? period.year : yearOf(period.month)}`,
  };
}

type ChartView = 'provider' | 'category' | 'type';
const VIEW_NAMES: Record<ChartView, string> = { provider: 'provider', category: 'category', type: 'commitment type' };

/** The monthly chart card: grouping toggle top right, legend, chart. Bar click behaviour is the page's own (`onSelectMonth`). */
export function OverviewChartCard({ data }: { data: OverviewData }) {
  const { analysis } = useLedger();
  const [view, setView] = useState<ChartView>('provider');
  const { chartProps, chartYear } = data;
  return (
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
  );
}
