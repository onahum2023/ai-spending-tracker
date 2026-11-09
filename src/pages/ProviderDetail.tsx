import { useMemo } from 'react';
import { SingleSeriesMonthlyChart } from '../components/charts';
import { TransactionTable } from '../components/TransactionTable';
import { TreatAs } from '../components/TreatAs';
import { Card, EmptyState, Kpi } from '../components/ui';
import { filterPeriod, merchantBreakdown, periodLabel } from '../lib/analytics';
import { dateLabel, monthLabel, monthOf, monthsBetween, ordinal } from '../lib/dates';
import { formatEUR, medianCents, sumCents } from '../lib/money';
import { href } from '../router';
import { useLedger } from '../store';

export function ProviderDetail({ provider }: { provider: string }) {
  const { transactions, span, colors, period, providers, analysis } = useLedger();
  const rows = useMemo(() => transactions.filter((t) => t.provider === provider), [transactions, provider]);
  const patterns = useMemo(() => analysis.patterns.filter((p) => p.provider === provider), [analysis, provider]);

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
  const merchants = merchantBreakdown(rows);
  const first = rows[0].date;
  const last = rows[rows.length - 1].date;

  return (
    <div className="stack">
      <div className="grid kpis">
        <Kpi label="All-time spending" value={formatEUR(total)} sub={`#${rank} of ${providers.length} providers · ${Math.round((total / sumCents(transactions)) * 100)}% of all`} />
        <Kpi label={periodLabel(period)} value={formatEUR(sumCents(periodRows))} sub={`${periodRows.length} charge${periodRows.length === 1 ? '' : 's'} in selected period`} />
        <Kpi label="Transactions" value={rows.length} sub={`in ${activeMonths} of ${months.length} months`} />
        <Kpi label="Typical charge" value={formatEUR(medianCents(rows.map((r) => r.amountCents)))} sub={`median · range ${formatEUR(Math.min(...rows.map((r) => r.amountCents)))}–${formatEUR(Math.max(...rows.map((r) => r.amountCents)))}`} />
        <Kpi label="First → most recent" value={<span style={{ fontSize: 16 }}>{dateLabel(first)}</span>} sub={`Most recent: ${dateLabel(last)}`} />
      </div>

      <div className="grid cols-2">
        <Card title="Monthly spending" subtitle={`${monthLabel(span.firstMonth)} – ${monthLabel(span.lastMonth)}`}>
          <SingleSeriesMonthlyChart rows={rows} months={months} color={colors.color(provider)} />
        </Card>
        <Card title="Subscription patterns" subtitle="Monthly ones are observed in the data, not confirmed. Yearly ones are set by you.">
          {patterns.length === 0 ? (
            <EmptyState>No charge repeats monthly on a similar day for 3+ months, and none is set as a subscription.</EmptyState>
          ) : (
            <div className="stack" style={{ gap: 12 }}>
              {patterns.map((p) => (
                <div key={p.firstDate} className="stack" style={{ gap: 2 }}>
                  <div className="row-between">
                    <strong className="num">~{formatEUR(p.typicalCents)} / {p.cadence === 'yearly' ? 'year' : 'month'}</strong>
                    <span className={`chip ${p.active ? 'chip-active' : 'chip-ended'}`}>{p.active ? 'Still appearing' : 'Stopped'}</span>
                  </div>
                  <span className="small secondary">
                    {p.cadence === 'yearly'
                      ? `Yearly, set by you · last charged ${dateLabel(p.lastDate)}`
                      : `Around the ${ordinal(p.typicalDay)} · ${p.months} ${p.forced ? 'month' + (p.months === 1 ? '' : 's') + ' with charges, set by you' : 'consecutive months'} · ${monthLabel(monthOf(p.firstDate))} – ${monthLabel(monthOf(p.lastDate))}`}
                  </span>
                  <span className="small muted">
                    {p.minCents !== p.maxCents ? `Amounts ${formatEUR(p.minCents)}–${formatEUR(p.maxCents)} · ` : ''}
                    {p.active ? `next expected around ${dateLabel(p.nextExpected)}` : `last seen ${dateLabel(p.lastDate)}`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid cols-2">
        <Card
          title="Transaction history"
          subtitle={`${rows.length} transactions · ${formatEUR(total)}`}
          actions={<a className="btn btn-sm btn-ghost" href={href(['transactions'], { provider })}>Open in Transactions →</a>}
        >
          <TransactionTable rows={rows} showProvider={false} />
        </Card>
        <Card title="Services" subtitle="Each merchant descriptor is a service, with its own charge type. A provider can have several, such as a plan and usage.">
          <div className="table-wrap" style={{ maxHeight: 520, overflowY: 'auto' }}>
            <table className="table">
              <thead>
                <tr><th>Descriptor</th><th>Type</th><th className="amount">Charges</th><th className="amount">Total</th></tr>
              </thead>
              <tbody>
                {merchants.map((m) => (
                  <tr key={m.merchant}>
                    <td className="merchant">{m.merchant}</td>
                    <td><TreatAs provider={provider} merchant={m.merchant} /></td>
                    <td className="amount">{m.count}</td>
                    <td className="amount">{formatEUR(m.totalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
