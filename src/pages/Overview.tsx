import { useMemo, useState } from 'react';
import { BudgetCard } from '../components/BudgetSection';
import { heroLabel, OverviewHero, OverviewTiles } from '../components/OverviewHero';
import { OverviewChartCard, useOverviewData } from '../components/OverviewParts';
import { TransactionTable } from '../components/TransactionTable';
import { Button, Card, CardAction, EmptyState, ProviderAvatar } from '../components/ui';
import { filterPeriod, periodKey, periodLabel, summarizeProviders } from '../lib/analytics';
import { OTHER_KEY } from '../lib/colors';
import { dateLabel, daysInMonth, monthLabel } from '../lib/dates';
import { formatEUR, sumCents } from '../lib/money';
import type { Period } from '../lib/types';
import { href, providerHref } from '../router';
import { useLedger } from '../store';

/**
 * The Overview. Row 1: the hero card (what the period came to, and for the month in progress what is still due) beside the card of
 * four stat tiles. Row 2: the monthly chart and who the money went to. Row 3: the period's charges and the budget.
 */
export function Overview() {
  const { span, period, today } = useLedger();
  const data = useOverviewData();
  if (!span || !data) return null;
  const { asOf, inProgress, yearInProgress, periodRows, forecast } = data;

  return (
    <div className="stack overview">
      <div className="overview-hero">
        <OverviewHero label={heroLabel(period, inProgress, yearInProgress, asOf)} totalCents={sumCents(periodRows)} inProgress={inProgress} forecast={forecast} />
        <OverviewTiles period={period} inProgress={inProgress} asOf={asOf} />
      </div>

      <div className="overview-row">
        <OverviewChartCard data={data} />
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
