import { useMemo } from 'react';
import { TransactionTable, type TxSortKey } from '../components/TransactionTable';
import { Card, SearchInput, type SortDir } from '../components/ui';
import { daysInMonth } from '../lib/dates';
import { centsToPlain, formatEUR, sumCents } from '../lib/money';
import { navigate, type Route } from '../router';
import { useLedger } from '../store';

/** Filters live in the URL so provider pages and the overview can deep-link here. */
export function Transactions({ route }: { route: Route }) {
  const { transactions, providers, span, period } = useLedger();
  const q = route.query.get('q') ?? '';
  const provider = route.query.get('provider') ?? '';
  const from = route.query.get('from') ?? '';
  const to = route.query.get('to') ?? '';
  const sortKey = (route.query.get('sort') as TxSortKey) || 'date';
  const sortDir = (route.query.get('dir') as SortDir) || 'desc';

  const update = (patch: Record<string, string>) => {
    const next = { q, provider, from, to, sort: sortKey === 'date' ? '' : sortKey, dir: sortDir === 'desc' ? '' : sortDir, ...patch };
    navigate(['transactions'], next, true);
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return transactions.filter((t) => {
      if (provider && t.provider !== provider) return false;
      if (from && t.date < from) return false;
      if (to && t.date > to) return false;
      if (needle) {
        const hay = `${t.merchant} ${t.provider} ${centsToPlain(t.amountCents)} ${t.date}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [transactions, q, provider, from, to]);

  const anyFilter = q || provider || from || to;

  const usePeriod = () => {
    if (period.kind === 'all') return update({ from: '', to: '' });
    if (period.kind === 'year') return update({ from: `${period.year}-01-01`, to: `${period.year}-12-31` });
    update({ from: `${period.month}-01`, to: `${period.month}-${String(daysInMonth(period.month)).padStart(2, '0')}` });
  };

  return (
    <div className="stack">
      <div className="card card-pad">
        <div className="filters">
          <div style={{ flex: '1 1 220px', minWidth: 180 }}>
            <SearchInput value={q} onChange={(v) => update({ q: v })} placeholder="Search merchant, provider, amount" />
          </div>
          <select className="select" aria-label="Provider" value={provider} onChange={(e) => update({ provider: e.target.value })}>
            <option value="">All providers</option>
            {[...providers].sort((a, b) => a.provider.localeCompare(b.provider)).map((p) => (
              <option key={p.provider} value={p.provider}>{p.provider}</option>
            ))}
          </select>
          <label>
            From
            <input className="input" type="date" value={from} min={span?.firstDate} max={span?.lastDate} onChange={(e) => update({ from: e.target.value })} />
          </label>
          <label>
            To
            <input className="input" type="date" value={to} min={span?.firstDate} max={span?.lastDate} onChange={(e) => update({ to: e.target.value })} />
          </label>
          <button className="btn btn-sm" onClick={usePeriod} title="Set the date range to the period selected in the header">
            Use selected period
          </button>
          {anyFilter && (
            <button className="btn btn-sm btn-ghost" onClick={() => navigate(['transactions'], {}, true)}>
              Clear filters
            </button>
          )}
        </div>
        {from && to && from > to && <div className="notice notice-warn" style={{ marginTop: 10 }}>The start date is after the end date.</div>}
      </div>

      <Card
        title={`${filtered.length} of ${transactions.length} transactions`}
        subtitle={`${formatEUR(sumCents(filtered))} shown${provider ? ` · ${provider}` : ''}`}
        actions={
          provider ? (
            <a className="btn btn-sm btn-ghost" href={`#/providers/${encodeURIComponent(provider)}`}>{provider} details →</a>
          ) : undefined
        }
      >
        <TransactionTable
          rows={filtered}
          sort={{ key: sortKey, dir: sortDir }}
          onSort={(s) => update({ sort: s.key, dir: s.dir })}
          emptyText="No transactions match these filters."
        />
      </Card>
    </div>
  );
}
