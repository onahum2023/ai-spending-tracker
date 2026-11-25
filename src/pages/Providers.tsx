import { useMemo, useState } from 'react';
import { Card, EmptyState, ProviderDot, SearchInput, SortHeader, Stat, StatStrip, Toolbar, type SortDir } from '../components/ui';
import { providerTotals, rowsInMonths } from '../lib/analytics';
import { addMonths, dateLabel, monthLabel } from '../lib/dates';
import { formatEUR, sumCents } from '../lib/money';
import { reviewCounts } from '../lib/providerChargeTypes';
import { navigate, providerHref } from '../router';
import { useLedger } from '../store';

type Key = 'provider' | 'period' | 'total' | 'count' | 'first' | 'last';

export function Providers() {
  const { transactions, providers, span, overrides } = useLedger();
  const toReview = useMemo(() => reviewCounts(transactions, overrides), [transactions, overrides]);
  const toReviewTotal = [...toReview.values()].reduce((a, b) => a + b, 0);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ key: Key; dir: SortDir }>({ key: 'period', dir: 'desc' });

  // A fixed window instead of the period picker: the last 12 months up to the latest charge.
  const periodRows = useMemo(
    () => (span ? rowsInMonths(transactions, addMonths(span.lastMonth, -11), span.lastMonth) : []),
    [transactions, span],
  );
  const periodTotals = useMemo(() => providerTotals(periodRows), [periodRows]);
  const allTotal = sumCents(transactions);
  const label = 'Last 12 months';
  const since = span ? monthLabel(addMonths(span.lastMonth, -11)) : '';

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = providers
      .filter((p) => !needle || p.provider.toLowerCase().includes(needle))
      .map((p) => ({ ...p, periodCents: periodTotals.get(p.provider) ?? 0 }));
    const m = sort.dir === 'asc' ? 1 : -1;
    return list.sort((a, b) => {
      let c = 0;
      switch (sort.key) {
        case 'provider': c = a.provider.localeCompare(b.provider); break;
        case 'period': c = a.periodCents - b.periodCents; break;
        case 'total': c = a.totalCents - b.totalCents; break;
        case 'count': c = a.count - b.count; break;
        case 'first': c = a.firstDate.localeCompare(b.firstDate); break;
        case 'last': c = a.lastDate.localeCompare(b.lastDate); break;
      }
      return c * m || b.totalCents - a.totalCents || a.provider.localeCompare(b.provider);
    });
  }, [providers, periodTotals, q, sort]);

  const activeInPeriod = providers.filter((p) => (periodTotals.get(p.provider) ?? 0) !== 0).length;

  return (
    <div className="stack">
      <StatStrip>
        <Stat lead label="Last 12 months" value={formatEUR(sumCents(periodRows))} sub={`${activeInPeriod} of ${providers.length} providers charged since ${since}`} />
        <Stat label="All time" value={formatEUR(allTotal)} sub={`across ${providers.length} providers`} />
        <Stat
          label="Charge types to review"
          value={toReviewTotal}
          sub={toReviewTotal ? 'Open a provider to confirm them' : 'Everything is confirmed'}
        />
      </StatStrip>

    <Card icon="users" tone="brand"
      title="All providers"
      subtitle="Select a provider to see its charges and confirm how they are read"
      actions={
        <Toolbar>
          <div className="toolbar-search">
            <SearchInput value={q} onChange={setQ} placeholder="Search providers" />
          </div>
        </Toolbar>
      }
    >
      {rows.length === 0 ? (
        <EmptyState>No providers match “{q}”.</EmptyState>
      ) : (
        <>
          <div className="table-wrap desktop-table">
            <table className="table">
              <thead>
                <tr>
                  <SortHeader label="Provider" k="provider" sort={sort} onSort={setSort} defaultDir="asc" />
                  <SortHeader label={label} k="period" sort={sort} onSort={setSort} className="amount" />
                  <SortHeader label="All time" k="total" sort={sort} onSort={setSort} className="amount" />
                  <th className="hide-sm">Share of all time</th>
                  <SortHeader label="Transactions" k="count" sort={sort} onSort={setSort} className="amount" />
                  <SortHeader label="First charge" k="first" sort={sort} onSort={setSort} defaultDir="asc" />
                  <SortHeader label="Most recent" k="last" sort={sort} onSort={setSort} />
                  <th title="Charge types you have not confirmed yet. Open the provider to review them.">To review</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const share = allTotal ? p.totalCents / allTotal : 0;
                  return (
                    <tr key={p.provider} className="clickable" onClick={() => navigate(['providers', p.provider])}>
                      <td>
                        <a className="provider-cell" href={providerHref(p.provider)} onClick={(e) => e.stopPropagation()}>
                          <ProviderDot provider={p.provider} />
                          {p.provider}
                        </a>
                      </td>
                      <td className="amount">
                        {p.periodCents ? formatEUR(p.periodCents) : <span className="muted">—</span>}
                      </td>
                      <td className="amount">{formatEUR(p.totalCents)}</td>
                      <td className="hide-sm share-cell">
                        <div className="row">
                          <div className="bar-track share-track">
                            <ShareFill provider={p.provider} share={share} />
                          </div>
                          <span className="small muted num share-pct">
                            {(share * 100).toFixed(share < 0.1 ? 1 : 0)}%
                          </span>
                        </div>
                      </td>
                      <td className="amount">{p.count}</td>
                      <td className="date">{dateLabel(p.firstDate)}</td>
                      <td className="date">{dateLabel(p.lastDate)}</td>
                      <td>
                        {toReview.get(p.provider) ? (
                          <span className="chip chip-warn">{toReview.get(p.provider)} to review</span>
                        ) : (
                          <span className="muted" title="Every charge type is confirmed">✓</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mobile-cards">
            {rows.map((p) => (
              <a key={p.provider} className="m-card" href={providerHref(p.provider)}>
                <span className="provider-cell">
                  <ProviderDot provider={p.provider} />
                  {p.provider}
                </span>
                <span className="num strong">{formatEUR(p.totalCents)}</span>
                <span className="small muted m-card-wide">
                  {label}: {p.periodCents ? formatEUR(p.periodCents) : '—'} · {p.count} charges · {dateLabel(p.firstDate)} – {dateLabel(p.lastDate)}
                  {toReview.get(p.provider) ? ` · ${toReview.get(p.provider)} to review` : ''}
                </span>
              </a>
            ))}
          </div>
        </>
      )}
    </Card>
    </div>
  );
}

function ShareFill({ provider, share }: { provider: string; share: number }) {
  const { colors } = useLedger();
  return <div className="bar-fill" style={{ width: `${Math.max(share * 100, 1)}%`, background: colors.color(provider) }} />;
}
