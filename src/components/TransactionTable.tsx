import { useMemo, useState } from 'react';
import { dateLabel } from '../lib/dates';
import { formatEUR, sumCents } from '../lib/money';
import { typeLabel, WHY } from '../lib/overrides';
import type { Transaction } from '../lib/types';
import { navigate, providerHref } from '../router';
import { useLedger } from '../store';
import { TagInput } from './TagEditor';
import { EmptyState, Pill, ProviderLink, SortHeader, type SortDir } from './ui';

export type TxSortKey = 'date' | 'merchant' | 'provider' | 'type' | 'tag' | 'amount';

export function sortTransactions(rows: Transaction[], key: TxSortKey, dir: SortDir, typeText: (t: Transaction) => string = (t) => t.type ?? ''): Transaction[] {
  const m = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    let c = 0;
    if (key === 'amount') c = a.amountCents - b.amountCents;
    else if (key === 'merchant') c = a.merchant.localeCompare(b.merchant);
    else if (key === 'provider') c = a.provider.localeCompare(b.provider);
    else if (key === 'type') c = typeText(a).localeCompare(typeText(b));
    else if (key === 'tag') c = (a.tag ?? '').localeCompare(b.tag ?? '');
    if (c === 0) c = a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    if (c === 0) c = a.id - b.id;
    return c * m;
  });
}

const PAGE = 100;

export function TransactionTable({
  rows,
  showProvider = true,
  showType = true,
  sort: controlledSort,
  onSort,
  showTotal = true,
  emptyText = 'No transactions match.',
  initialSort = { key: 'date', dir: 'desc' },
  editableTags = false,
  onDelete,
}: {
  rows: Transaction[];
  showProvider?: boolean;
  /** The Type column. Off where the table is narrow and the type is not the point. */
  showType?: boolean;
  sort?: { key: TxSortKey; dir: SortDir };
  onSort?: (s: { key: TxSortKey; dir: SortDir }) => void;
  showTotal?: boolean;
  emptyText?: string;
  initialSort?: { key: TxSortKey; dir: SortDir };
  /** Show a Tag column the user can edit. Without it, a Tag column appears only when some charge has a tag. */
  editableTags?: boolean;
  /** Adds a delete button to each charge. The caller asks for confirmation and does the deleting. */
  onDelete?: (t: Transaction) => void;
}) {
  const [localSort, setLocalSort] = useState<{ key: TxSortKey; dir: SortDir }>(initialSort);
  const sort = controlledSort ?? localSort;
  const setSort = onSort ?? setLocalSort;
  const [limit, setLimit] = useState(PAGE);
  const { analysis } = useLedger();
  const typeText = (t: Transaction) => typeLabel(analysis.typeOf(t));
  const sorted = useMemo(() => sortTransactions(rows, sort.key, sort.dir, (t) => typeLabel(analysis.typeOf(t))), [rows, sort.key, sort.dir, analysis]);
  const visible = sorted.slice(0, limit);
  const total = sumCents(rows);
  const showTag = editableTags || rows.some((r) => r.tag);

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
              {showTag && <SortHeader label="Tag" k="tag" sort={sort} onSort={setSort} defaultDir="asc" />}
              <SortHeader label="Amount" k="amount" sort={sort} onSort={setSort} className="amount" />
              {onDelete && <th><span className="sr-only">Delete</span></th>}
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
                {showType && (
                  <td className="hide-sm" onClick={(e) => e.stopPropagation()}>
                    <a className="type-text" href={providerHref(t.provider)} title={`${WHY[analysis.typeOf(t).source]}. Change it on the provider page.`}>
                      {typeText(t)}
                    </a>
                  </td>
                )}
                {showTag && (
                  <td onClick={(e) => e.stopPropagation()}>
                    {editableTags ? <TagInput tx={t} /> : t.tag ? <Pill kind="neutral">{t.tag}</Pill> : <span className="muted">—</span>}
                  </td>
                )}
                <td className="amount">{formatEUR(t.amountCents)}</td>
                {onDelete && (
                  <td className="row-action" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="btn btn-sm btn-ghost btn-icon"
                      onClick={() => onDelete(t)}
                      aria-label={`Delete the ${t.provider} charge of ${formatEUR(t.amountCents)} on ${dateLabel(t.date)}`}
                      title="Delete this charge"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v5M14 11v5" />
                      </svg>
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          {showTotal && (
            <tfoot>
              <tr>
                <td colSpan={2 + (showProvider ? 1 : 0) + (showType ? 1 : 0) + (showTag ? 1 : 0)}>
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
              {t.tag ? ` · #${t.tag}` : ''}
            </span>
            {onDelete && (
              <button className="btn-text" style={{ gridColumn: '1 / -1', justifySelf: 'start' }} onClick={() => onDelete(t)}>
                Delete this charge
              </button>
            )}
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
