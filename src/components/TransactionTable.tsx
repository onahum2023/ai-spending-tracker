import { useMemo, useState } from 'react';
import { dateLabel } from '../lib/dates';
import { formatEUR, sumCents } from '../lib/money';
import { SERVICE_TYPE_LABELS } from '../lib/extract/types';
import type { Transaction } from '../lib/types';
import { navigate } from '../router';
import { EmptyState, ProviderLink, SortHeader, type SortDir } from './ui';

export type TxSortKey = 'date' | 'merchant' | 'provider' | 'type' | 'amount';

export function sortTransactions(rows: Transaction[], key: TxSortKey, dir: SortDir): Transaction[] {
  const m = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    let c = 0;
    if (key === 'amount') c = a.amountCents - b.amountCents;
    else if (key === 'merchant') c = a.merchant.localeCompare(b.merchant);
    else if (key === 'provider') c = a.provider.localeCompare(b.provider);
    else if (key === 'type') c = (a.type ?? '').localeCompare(b.type ?? '');
    if (c === 0) c = a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    if (c === 0) c = a.id - b.id;
    return c * m;
  });
}

const PAGE = 100;

export function TransactionTable({
  rows,
  showProvider = true,
  sort: controlledSort,
  onSort,
  showTotal = true,
  emptyText = 'No transactions match.',
  initialSort = { key: 'date', dir: 'desc' },
}: {
  rows: Transaction[];
  showProvider?: boolean;
  sort?: { key: TxSortKey; dir: SortDir };
  onSort?: (s: { key: TxSortKey; dir: SortDir }) => void;
  showTotal?: boolean;
  emptyText?: string;
  initialSort?: { key: TxSortKey; dir: SortDir };
}) {
  const [localSort, setLocalSort] = useState<{ key: TxSortKey; dir: SortDir }>(initialSort);
  const sort = controlledSort ?? localSort;
  const setSort = onSort ?? setLocalSort;
  const [limit, setLimit] = useState(PAGE);
  const sorted = useMemo(() => sortTransactions(rows, sort.key, sort.dir), [rows, sort.key, sort.dir]);
  const visible = sorted.slice(0, limit);
  const total = sumCents(rows);
  const showType = rows.some((r) => r.type);

  if (rows.length === 0) return <EmptyState>{emptyText}</EmptyState>;

  const openProvider = (t: Transaction) => navigate(['providers', t.provider]);

  return (
    <>
      <div className="table-wrap desktop-table">
        <table className="table">
          <thead>
            <tr>
              <SortHeader label="Date" k="date" sort={sort} onSort={setSort} />
              <SortHeader label="Merchant descriptor" k="merchant" sort={sort} onSort={setSort} defaultDir="asc" />
              {showProvider && <SortHeader label="Provider" k="provider" sort={sort} onSort={setSort} defaultDir="asc" />}
              {showType && <SortHeader label="Type" k="type" sort={sort} onSort={setSort} defaultDir="asc" className="hide-sm" />}
              <SortHeader label="Amount" k="amount" sort={sort} onSort={setSort} className="amount" />
            </tr>
          </thead>
          <tbody>
            {visible.map((t) => (
              <tr
                key={t.id}
                className={showProvider ? 'clickable' : undefined}
                onClick={showProvider ? () => openProvider(t) : undefined}
                title={showProvider ? `Open ${t.provider}` : undefined}
              >
                <td className="date">{dateLabel(t.date)}</td>
                <td className="merchant">{t.merchant}</td>
                {showProvider && (
                  <td>
                    <ProviderLink provider={t.provider} />
                  </td>
                )}
                {showType && <td className="hide-sm">{t.type ? <span className="chip">{SERVICE_TYPE_LABELS[t.type]}</span> : <span className="muted">—</span>}</td>}
                <td className="amount">{formatEUR(t.amountCents)}</td>
              </tr>
            ))}
          </tbody>
          {showTotal && (
            <tfoot>
              <tr>
                <td colSpan={(showProvider ? 3 : 2) + (showType ? 1 : 0)}>
                  {rows.length} transaction{rows.length === 1 ? '' : 's'}
                </td>
                <td className="amount">{formatEUR(total)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="mobile-cards">
        {visible.map((t) => (
          <div key={t.id} className="m-card">
            {showProvider ? <ProviderLink provider={t.provider} /> : <span className="secondary">{dateLabel(t.date)}</span>}
            <span className="num" style={{ fontWeight: 600 }}>{formatEUR(t.amountCents)}</span>
            <span className="merchant">
              {showProvider ? `${dateLabel(t.date)} · ` : ''}
              {t.merchant}
            </span>
          </div>
        ))}
        {showTotal && (
          <div className="m-card" style={{ fontWeight: 600 }}>
            <span>{rows.length} transactions</span>
            <span className="num">{formatEUR(total)}</span>
          </div>
        )}
      </div>

      {sorted.length > limit && (
        <div className="row" style={{ justifyContent: 'center', paddingTop: 10 }}>
          <button className="btn btn-sm" onClick={() => setLimit((l) => l + PAGE)}>
            Show more ({sorted.length - limit} remaining)
          </button>
        </div>
      )}
    </>
  );
}
