import { useCallback, useMemo, useState } from 'react';
import { MonthlyCategoryChart, MonthlyProviderChart, TypeChart } from '../components/charts';
import { BudgetCard } from '../components/BudgetCard';
import { ForecastCard } from '../components/ForecastCard';
import { MonthPanel } from '../components/MonthPanel';
import { TransactionTable } from '../components/TransactionTable';
import { Card, Delta, Disclosure, EmptyState, Kpi, ProviderDot, ReadChip, Segmented } from '../components/ui';
import {
  filterPeriod,
  monthTotal,
  monthTotalThroughDay,
  periodLabel,
  rowsInMonths,
  summarizeProviders,
  totalsByMonth,
} from '../lib/analytics';
import { addMonths, dateLabel, dayOf, daysInMonth, monthLabel, monthLabelLong, monthOf, monthShort, yearOf } from '../lib/dates';
import { formatEUR, formatPct, pctChange, sumCents } from '../lib/money';
import { reviewCounts } from '../lib/providerChargeTypes';
import type { Period } from '../lib/types';
import { href, providerHref } from '../router';
import { useLedger } from '../store';

type ChartView = 'provider' | 'category' | 'type';
const VIEW_NAMES: Record<ChartView, string> = { provider: 'provider', category: 'category', type: 'commitment type' };

export function Overview() {
  const { transactions, span, period, today, analysis, overrides } = useLedger();
  const [view, setView] = useState<ChartView>('provider');
  // The month whose transactions are open in the side sheet, and, from the comparison card, only up to a day of it.
  const [drill, setDrill] = useState<{ month: string; throughDay?: number } | null>(null);
  const closeDrill = useCallback(() => setDrill(null), []);
  const periodRows = useMemo(() => filterPeriod(transactions, period), [transactions, period]);
  const toReview = useMemo(() => [...reviewCounts(transactions, overrides).values()].reduce((a, b) => a + b, 0), [transactions, overrides]);

  if (!span) return null;

  const chartMonths =
    period.kind === 'all'
      ? span.months
      : span.months.filter((m) => yearOf(m) === (period.kind === 'year' ? period.year : yearOf(period.month)));

  return (
    <div className="stack">
      <KpiRow period={period} onOpenMonth={(month, throughDay) => setDrill({ month, throughDay })} />
      {toReview > 0 && (
        <p className="small muted" style={{ margin: '-6px 0 0' }}>
          {toReview} charge type{toReview === 1 ? '' : 's'} still follow{toReview === 1 ? 's' : ''} the app's suggestion.{' '}
          <a href={href(['providers'])} style={{ textDecoration: 'underline' }}>Review on the Providers page</a>
        </p>
      )}

      <div className="grid cols-2">
        <Card
          title={`Monthly spending by ${VIEW_NAMES[view]}${period.kind === 'all' ? '' : ` · ${period.kind === 'year' ? period.year : yearOf(period.month)}`}`}
          subtitle={view === 'type' ? <>Click a month to list its transactions · <ReadChip /> Types are suggestions until you confirm them</> : 'Click a month to list its transactions'}
          actions={
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
          {view === 'provider' ? (
            <MonthlyProviderChart
              rows={transactions}
              months={chartMonths}
              selectedMonth={drill?.month ?? (period.kind === 'month' ? period.month : null)}
              onSelectMonth={(m) => setDrill({ month: m })}
            />
          ) : view === 'type' ? (
            <TypeChart
              rows={transactions}
              months={chartMonths}
              typeOf={analysis.typeOf}
              selectedMonth={drill?.month ?? (period.kind === 'month' ? period.month : null)}
              onSelectMonth={(m) => setDrill({ month: m })}
            />
          ) : (
            <MonthlyCategoryChart
              rows={transactions}
              months={chartMonths}
              categoryFor={analysis.categoryOf}
              selectedMonth={drill?.month ?? (period.kind === 'month' ? period.month : null)}
              onSelectMonth={(m) => setDrill({ month: m })}
            />
          )}
          {view === 'type' && (
            <div style={{ marginTop: 10 }}>
              <Disclosure label="How are these found?">
                <p className="small muted" style={{ margin: 0 }}>
                  Amounts and dates are the ledger. Whether a charge is a subscription, usage or one-time is the app's read: a charge is a
                  subscription once it has appeared monthly for three months in a row, and usage when the same descriptor is charged three
                  or more times without that rhythm. A type you confirm on the provider's page replaces the app's read for that charge type.
                </p>
              </Disclosure>
            </div>
          )}
        </Card>
        <div className="stack">
          <ForecastCard />
          <BudgetCard />
        </div>
      </div>

      <div className="grid cols-2">
        <ChargesCard period={period} />
        <ContributorsCard rows={periodRows} label={periodLabel(period)} />
      </div>
      {drill && (
        <MonthPanel
          month={drill.month}
          throughDay={drill.throughDay}
          onClose={closeDrill}
          onShowFullMonth={() => setDrill({ month: drill.month })}
        />
      )}
      {today < span.lastDate && (
        <p className="small muted">Note: some transactions are dated after today ({dateLabel(today)}).</p>
      )}
    </div>
  );
}

function KpiRow({ period, onOpenMonth }: { period: Period; onOpenMonth: (month: string, throughDay?: number) => void }) {
  const { transactions, span, today } = useLedger();
  if (!span) return null;
  const byMonth = totalsByMonth(transactions);
  const currentMonth = monthOf(today);

  if (period.kind === 'month') {
    const m = period.month;
    const prev = addMonths(m, -1);
    const cur = byMonth.get(m) ?? 0;
    const before = byMonth.get(prev) ?? 0;
    const inProgress = m === currentMonth;
    const day = dayOf(today);
    const prevSameDays = monthTotalThroughDay(transactions, prev, day);
    const y = yearOf(m);
    const yearRows = filterPeriod(transactions, { kind: 'year', year: y });
    const yearMonths = span.months.filter((x) => yearOf(x) === y);
    const count = transactions.filter((t) => monthOf(t.date) === m).length;
    const providers = new Set(transactions.filter((t) => monthOf(t.date) === m).map((t) => t.provider)).size;
    const yearProviders = new Set(yearRows.map((t) => t.provider)).size;
    const isLatest = m === span.lastMonth;
    return (
      <div className="grid kpis">
        <Kpi
          label={
            <>
              {monthLabelLong(m)}
              {inProgress ? (
                <span className="chip chip-warn">In progress</span>
              ) : (
                isLatest && <span className="chip chip-accent">Latest</span>
              )}
            </>
          }
          value={formatEUR(cur)}
          sub={`${count} charge${count === 1 ? '' : 's'}${inProgress ? ` · through ${dateLabel(today)}` : ''}`}
        />
        <Kpi label={`Previous month · ${monthLabel(prev)}`} value={formatEUR(before)} sub={prev < span.firstMonth ? 'Before recorded history' : `${transactions.filter((t) => monthOf(t.date) === prev).length} charges`} />
        <Kpi
          onClick={inProgress ? () => onOpenMonth(prev, day) : undefined}
          hint={inProgress ? `List the transactions of ${monthShort(prev)} 1–${day}` : undefined}
          label={inProgress ? `vs same point in ${monthShort(prev)}` : 'Month over month'}
          value={
            inProgress ? (
              <Delta before={prevSameDays} after={cur} showPct={false} />
            ) : before === 0 && cur === 0 ? (
              '—'
            ) : (
              <Delta before={before} after={cur} showPct={false} />
            )
          }
          sub={
            inProgress ? (
              <>
                {monthShort(prev)} 1–{day}: {formatEUR(prevSameDays)}. Full {monthShort(prev)} total was {formatEUR(before)}.
              </>
            ) : before > 0 ? (
              `${formatPct(pctChange(before, cur))} vs ${monthLabel(prev)}`
            ) : (
              'No spending the month before'
            )
          }
        />
        <Kpi
          label={`${y} total`}
          value={formatEUR(sumCents(yearRows))}
          sub={`${monthShort(yearMonths[0])}–${monthShort(yearMonths[yearMonths.length - 1])} · avg ${formatEUR(Math.round(sumCents(yearRows) / yearMonths.length))}/mo`}
        />
        <Kpi label="Providers with spending" value={providers} sub={`in ${monthShort(m)} · ${yearProviders} in ${y}`} />
      </div>
    );
  }

  if (period.kind === 'year') {
    const y = period.year;
    const months = span.months.filter((m) => yearOf(m) === y);
    const rows = filterPeriod(transactions, period);
    const total = sumCents(rows);
    const prevYearRows = filterPeriod(transactions, { kind: 'year', year: y - 1 });
    const hasPrev = prevYearRows.length > 0;
    // Like-for-like: same calendar months last year
    const firstMM = months[0].slice(5);
    const lastMM = months[months.length - 1].slice(5);
    const samePrev = sumCents(rowsInMonths(transactions, `${y - 1}-${firstMM}`, `${y - 1}-${lastMM}`));
    const partial = months.length < 12;
    const best = [...months].sort((a, b) => (byMonth.get(b) ?? 0) - (byMonth.get(a) ?? 0))[0];
    return (
      <div className="grid kpis">
        <Kpi label={`${y} total`} value={formatEUR(total)} sub={`${rows.length} charges · ${monthShort(months[0])}–${monthShort(months[months.length - 1])}`} />
        <Kpi label={`${y - 1} total`} value={hasPrev ? formatEUR(sumCents(prevYearRows)) : '—'} sub={hasPrev ? `${prevYearRows.length} charges` : 'No recorded data'} />
        <Kpi
          label={partial ? `vs same months of ${y - 1}` : `vs ${y - 1}`}
          value={hasPrev ? <Delta before={samePrev} after={total} showPct={false} /> : '—'}
          sub={hasPrev ? <>{monthShort(months[0])}–{monthShort(months[months.length - 1])} {y - 1}: {formatEUR(samePrev)} ({formatPct(pctChange(samePrev, total))})</> : 'Nothing to compare'}
        />
        <Kpi label="Average per month" value={formatEUR(Math.round(total / months.length))} sub={`Highest: ${monthLabel(best)} (${formatEUR(byMonth.get(best) ?? 0)})`} />
        <Kpi label="Providers with spending" value={new Set(rows.map((r) => r.provider)).size} sub={`in ${y}`} />
      </div>
    );
  }

  const total = sumCents(transactions);
  const best = [...span.months].sort((a, b) => (byMonth.get(b) ?? 0) - (byMonth.get(a) ?? 0))[0];
  const latest = monthTotal(transactions, span.lastMonth);
  return (
    <div className="grid kpis">
      <Kpi label="All-time total" value={formatEUR(total)} sub={`${transactions.length} charges since ${monthLabel(span.firstMonth)}`} />
      <Kpi label={`Latest month · ${monthLabel(span.lastMonth)}`} value={formatEUR(latest)} sub={span.lastMonth === monthOf(today) ? 'In progress' : `Last charge ${dateLabel(span.lastDate)}`} />
      <Kpi label="Average per month" value={formatEUR(Math.round(total / span.months.length))} sub={`over ${span.months.length} months`} />
      <Kpi label="Highest month" value={formatEUR(byMonth.get(best) ?? 0)} sub={monthLabel(best)} />
      <Kpi label="Providers" value={new Set(transactions.map((t) => t.provider)).size} sub="with recorded spending" />
    </div>
  );
}

function ContributorsCard({ rows, label }: { rows: { provider: string; amountCents: number; date: string; merchant: string }[]; label: string }) {
  const summary = summarizeProviders(rows);
  const total = sumCents(rows);
  const top = summary.slice(0, 8);
  const max = top[0]?.totalCents ?? 1;
  return (
    <Card
      title="Largest contributors"
      subtitle={`${label} · ${formatEUR(total)} across ${summary.length} provider${summary.length === 1 ? '' : 's'}`}
      actions={<a className="btn btn-sm btn-ghost" href={href(['providers'])}>All providers →</a>}
    >
      {summary.length === 0 ? (
        <EmptyState>No spending recorded in this period.</EmptyState>
      ) : (
        <div className="bar-list">
          {top.map((s) => (
            <a key={s.provider} className="bar-item" href={providerHref(s.provider)}>
              <span className="bar-name">
                <ProviderDot provider={s.provider} />
                <span>{s.provider}</span>
              </span>
              <span className="num">
                {formatEUR(s.totalCents)} <span className="muted small">{Math.round((s.totalCents / total) * 100)}%</span>
              </span>
              <div className="bar-track">
                <ProviderBarFill provider={s.provider} width={(s.totalCents / max) * 100} />
              </div>
            </a>
          ))}
          {summary.length > top.length && (
            <a className="small muted" href={href(['providers'])}>
              + {summary.length - top.length} more providers ({formatEUR(sumCents(summary.slice(8).map((s) => ({ amountCents: s.totalCents }))))})
            </a>
          )}
        </div>
      )}
    </Card>
  );
}

function ProviderBarFill({ provider, width }: { provider: string; width: number }) {
  const { colors } = useLedger();
  return <div className="bar-fill" style={{ width: `${width}%`, background: colors.color(provider) }} />;
}

function ChargesCard({ period }: { period: Period }) {
  const { transactions } = useLedger();
  const rows = filterPeriod(transactions, period);
  if (period.kind === 'month') {
    return (
      <Card
        title={`Charges in ${monthLabel(period.month)}`}
        subtitle={`${rows.length} transaction${rows.length === 1 ? '' : 's'}`}
        actions={
          <a className="btn btn-sm btn-ghost" href={href(['transactions'], { from: `${period.month}-01`, to: `${period.month}-${String(daysInMonth(period.month))}` })}>
            Open in Transactions →
          </a>
        }
      >
        <div style={{ maxHeight: 360, overflowY: 'auto' }}>
          <TransactionTable rows={rows} emptyText="No charges recorded in this month." />
        </div>
      </Card>
    );
  }
  const largest = [...rows].sort((a, b) => b.amountCents - a.amountCents).slice(0, 8);
  return (
    <Card title="Largest charges" subtitle={`${periodLabel(period)} · top ${largest.length} of ${rows.length}`}>
      <TransactionTable rows={largest} showTotal={false} initialSort={{ key: 'amount', dir: 'desc' }} />
    </Card>
  );
}
