import { useMemo, useState } from 'react';
import { Card, CardNote, EmptyState, Pill, ProviderDot, SearchInput, SortHeader, type SortDir } from '../components/ui';
import { filterPeriod, lastCompleteMonth, periodLabel, providerTotals, rowsInMonths } from '../lib/analytics';
import { CATEGORIES, CATEGORY_LABELS, type Category } from '../lib/categories';
import { addMonths, dateLabel, monthLabel, monthShort } from '../lib/dates';
import { formatEUR, sumCents } from '../lib/money';
import { KIND_LABELS, type ChargeKind } from '../lib/overrides';
import { providerTrend, TREND_MIN_CENTS, TREND_MIN_PCT, type Trend } from '../lib/trend';
import { reviewCounts } from '../lib/providerChargeTypes';
import { navigate, providerHref } from '../router';
import { useLedger } from '../store';

type Key = 'provider' | 'period' | 'trend' | 'total' | 'count' | 'first' | 'last';

const KINDS: ChargeKind[] = ['subscription', 'usage', 'other'];

export function Providers() {
  const { transactions, providers, period, overrides, span, today, analysis } = useLedger();
  const toReview = useMemo(() => reviewCounts(transactions, overrides), [transactions, overrides]);
  const toReviewTotal = [...toReview.values()].reduce((a, b) => a + b, 0);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<Category | ''>('');
  const [kind, setKind] = useState<ChargeKind | ''>('');
  const [sort, setSort] = useState<{ key: Key; dir: SortDir }>({ key: 'period', dir: 'desc' });

  const periodRows = useMemo(() => filterPeriod(transactions, period), [transactions, period]);
  const periodTotals = useMemo(() => providerTotals(periodRows), [periodRows]);
  const allTotal = sumCents(transactions);
  const label = periodLabel(period);

  // Spending in the last 3 complete months against the 3 before, one-time charges left out: sums of recorded charges, whatever
  // the period picker says.
  const trend = useMemo(() => {
    if (!span) return null;
    const L = lastCompleteMonth(span, today);
    const lastFrom = addMonths(L, -2);
    const prevFrom = addMonths(L, -5);
    const prevTo = addMonths(L, -3);
    const recurringOrUsage = (r: (typeof transactions)[number]) => analysis.typeOf(r).kind !== 'other';
    return {
      last: providerTotals(rowsInMonths(transactions, lastFrom, L).filter(recurringOrUsage)),
      prev: providerTotals(rowsInMonths(transactions, prevFrom, prevTo).filter(recurringOrUsage)),
      lastLabel: `${monthShort(lastFrom)}–${monthLabel(L)}`,
      prevLabel: `${monthShort(prevFrom)}–${monthLabel(prevTo)}`,
    };
  }, [transactions, span, today, analysis]);

  // What each provider's charges are, by category and by commitment type (the app's read of them), for the filters.
  const traits = useMemo(() => {
    const out = new Map<string, { categories: Set<Category>; kinds: Set<ChargeKind> }>();
    for (const t of transactions) {
      const e = out.get(t.provider) ?? { categories: new Set<Category>(), kinds: new Set<ChargeKind>() };
      e.categories.add(analysis.categoryOf(t));
      e.kinds.add(analysis.typeOf(t).kind);
      out.set(t.provider, e);
    }
    return out;
  }, [transactions, analysis]);
  const trendCents = (provider: string) => (trend?.last.get(provider) ?? 0) - (trend?.prev.get(provider) ?? 0);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = providers
      .filter((p) => !needle || p.provider.toLowerCase().includes(needle))
      .filter((p) => !category || traits.get(p.provider)?.categories.has(category))
      .filter((p) => !kind || traits.get(p.provider)?.kinds.has(kind))
      .map((p) => ({ ...p, periodCents: periodTotals.get(p.provider) ?? 0 }));
    const m = sort.dir === 'asc' ? 1 : -1;
    return list.sort((a, b) => {
      let c = 0;
      switch (sort.key) {
        case 'provider': c = a.provider.localeCompare(b.provider); break;
        case 'period': c = a.periodCents - b.periodCents; break;
        case 'trend': c = trendCents(a.provider) - trendCents(b.provider); break;
        case 'total': c = a.totalCents - b.totalCents; break;
        case 'count': c = a.count - b.count; break;
        case 'first': c = a.firstDate.localeCompare(b.firstDate); break;
        case 'last': c = a.lastDate.localeCompare(b.lastDate); break;
      }
      return c * m || b.totalCents - a.totalCents || a.provider.localeCompare(b.provider);
    });
  }, [providers, periodTotals, q, category, kind, traits, trend, sort]);

  const filtered = q.trim() !== '' || category !== '' || kind !== '';
  const activeInPeriod = providers.filter((p) => (periodTotals.get(p.provider) ?? 0) !== 0).length;

  return (
    <Card
      title={`${providers.length} providers`}
      subtitle={`${formatEUR(sumCents(periodRows))} in ${label} · ${formatEUR(allTotal)} all time`}
    >
      <CardNote>
        {activeInPeriod} with spending in {label}
        {toReviewTotal ? ` · ${toReviewTotal} charge type${toReviewTotal === 1 ? '' : 's'} to review` : ''}
      </CardNote>
      <div className="filters" style={{ marginBottom: 12 }}>
        <div style={{ flex: '1 1 200px', maxWidth: 260 }}>
          <SearchInput value={q} onChange={setQ} placeholder="Search providers, like Anthropic" />
        </div>
        <label>
          Category
          <select className="select input-sm" value={category} aria-label="Filter by category" onChange={(e) => setCategory(e.target.value as Category | '')}>
            <option value="">All</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>
        </label>
        <label title="What kind of charges a provider has, as the app reads them. A type you confirmed on the provider's page counts as confirmed.">
          Commitment type
          <select className="select input-sm" value={kind} aria-label="Filter by commitment type" onChange={(e) => setKind(e.target.value as ChargeKind | '')}>
            <option value="">All</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>{KIND_LABELS[k]}</option>
            ))}
          </select>
        </label>
        {filtered && (
          <button className="btn btn-sm btn-ghost" onClick={() => { setQ(''); setCategory(''); setKind(''); }}>
            Clear filters
          </button>
        )}
      </div>
      {rows.length === 0 ? (
        <EmptyState>No providers match these filters.</EmptyState>
      ) : (
        <>
          <div className="table-wrap desktop-table">
            <table className="table">
              <thead>
                <tr>
                  <SortHeader label="Provider" k="provider" sort={sort} onSort={setSort} defaultDir="asc" />
                  <SortHeader label={label} k="period" sort={sort} onSort={setSort} className="amount" />
                  <SortHeader label="Trend" k="trend" sort={sort} onSort={setSort} />
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
                      <td className="nowrap">{trend && <TrendCell last={trend.last.get(p.provider) ?? 0} prev={trend.prev.get(p.provider) ?? 0} labels={trend} />}</td>
                      <td className="amount">{formatEUR(p.totalCents)}</td>
                      <td className="hide-sm" style={{ width: 160 }}>
                        <div className="row" style={{ gap: 8 }}>
                          <div className="bar-track" style={{ flex: 1 }}>
                            <ShareFill provider={p.provider} share={share} />
                          </div>
                          <span className="small secondary num" style={{ width: 34, textAlign: 'right' }}>
                            {(share * 100).toFixed(share < 0.1 ? 1 : 0)}%
                          </span>
                        </div>
                      </td>
                      <td className="amount">{p.count}</td>
                      <td className="date">{dateLabel(p.firstDate)}</td>
                      <td className="date">{dateLabel(p.lastDate)}</td>
                      <td>
                        {toReview.get(p.provider) ? (
                          <Pill kind="attention">{toReview.get(p.provider)} to review</Pill>
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
                <span className="num" style={{ fontWeight: 600 }}>{formatEUR(p.totalCents)}</span>
                {trend && (
                  <span className="small" style={{ gridColumn: '1 / -1' }}>
                    <TrendCell last={trend.last.get(p.provider) ?? 0} prev={trend.prev.get(p.provider) ?? 0} labels={trend} />
                  </span>
                )}
                <span className="small secondary" style={{ gridColumn: '1 / -1' }}>
                  {label}: {p.periodCents ? formatEUR(p.periodCents) : '—'} · {p.count} charges · {dateLabel(p.firstDate)} – {dateLabel(p.lastDate)}
                  {toReview.get(p.provider) ? ` · ${toReview.get(p.provider)} to review` : ''}
                </span>
              </a>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

function ShareFill({ provider, share }: { provider: string; share: number }) {
  const { colors } = useLedger();
  return <div className="bar-fill" style={{ width: `${Math.max(share * 100, 1)}%`, background: colors.color(provider) }} />;
}

/** Last 3 complete months against the 3 before, one-time charges left out: an arrow and a word, never colour alone. */
function TrendCell({ last, prev, labels }: { last: number; prev: number; labels: { lastLabel: string; prevLabel: string } }) {
  const t: Trend = providerTrend(last, prev);
  if (t.direction === 'none') return <span className="muted">—</span>;
  const title = `${labels.lastLabel}: ${formatEUR(last)}. Before that, ${labels.prevLabel}: ${formatEUR(prev)}. One-time charges are left out. An arrow needs a change of more than ${Math.round(TREND_MIN_PCT * 100)}% and more than ${formatEUR(TREND_MIN_CENTS)}.`;
  const cls = t.direction === 'up' ? 'delta-up' : t.direction === 'down' ? 'delta-down' : 'delta-flat';
  const arrow = t.direction === 'up' ? '▲' : t.direction === 'down' ? '▼' : '→';
  const text =
    t.direction === 'flat'
      ? 'flat'
      : t.kind === 'new'
      ? 'new'
      : t.kind === 'ended'
      ? 'none'
      : `${t.deltaCents > 0 ? '+' : ''}${Math.round((t.pct ?? 0) * 100)}%`;
  return (
    <span className={`${cls} num`} title={title}>
      <span aria-hidden="true">{arrow} </span>
      {text}
      <span className="sr-only">{` (${title})`}</span>
    </span>
  );
}
