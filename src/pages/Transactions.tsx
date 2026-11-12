import { useMemo, useState } from 'react';
import { BulkTag, TagSuggestions } from '../components/TagEditor';
import { TransactionTable, type TxSortKey } from '../components/TransactionTable';
import { Button, Card, CardAction, ConfirmDialog, Field, Input, SearchInput, Select, type SortDir } from '../components/ui';
import { dateLabel, daysInMonth } from '../lib/dates';
import { KIND_LABELS, type ChargeKind } from '../lib/overrides';
import { centsToPlain, formatEUR, sumCents } from '../lib/money';
import { tagsInUse, UNTAGGED } from '../lib/tags';
import type { Transaction } from '../lib/types';
import { href, navigate, type Route } from '../router';
import { useLedger } from '../store';

/** Filters live in the URL so provider pages and the overview can deep-link here. */
export function Transactions({ route }: { route: Route }) {
  const { transactions, providers, span, period, analysis, mode, deleteTransactions } = useLedger();
  const [pendingDelete, setPendingDelete] = useState<Transaction | null>(null);
  const [deleting, setDeleting] = useState(false);
  const q = route.query.get('q') ?? '';
  const provider = route.query.get('provider') ?? '';
  const type = route.query.get('type') ?? '';
  const tag = route.query.get('tag') ?? '';
  const from = route.query.get('from') ?? '';
  const to = route.query.get('to') ?? '';
  const sortKey = (route.query.get('sort') as TxSortKey) || 'date';
  const sortDir = (route.query.get('dir') as SortDir) || 'desc';

  const update = (patch: Record<string, string>) => {
    const next = { q, provider, type, tag, from, to, sort: sortKey === 'date' ? '' : sortKey, dir: sortDir === 'desc' ? '' : sortDir, ...patch };
    navigate(['transactions'], next, true);
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return transactions.filter((t) => {
      if (provider && t.provider !== provider) return false;
      if (type && analysis.typeOf(t).kind !== type) return false;
      if (tag && (tag === UNTAGGED ? t.tag : t.tag !== tag)) return false;
      if (from && t.date < from) return false;
      if (to && t.date > to) return false;
      if (needle) {
        const hay = `${t.merchant} ${t.provider} ${centsToPlain(t.amountCents)} ${t.date}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [transactions, analysis, q, provider, type, tag, from, to]);

  const anyFilter = q || provider || type || tag || from || to;
  const tags = useMemo(() => tagsInUse(transactions), [transactions]);
  const types: ChargeKind[] = ['subscription', 'usage', 'other'];

  const usePeriod = () => {
    if (period.kind === 'all') return update({ from: '', to: '' });
    if (period.kind === 'year') return update({ from: `${period.year}-01-01`, to: `${period.year}-12-31` });
    update({ from: `${period.month}-01`, to: `${period.month}-${String(daysInMonth(period.month)).padStart(2, '0')}` });
  };

  return (
    <div className="stack">
      <Card>
        <div className="filters">
          <div style={{ flex: '1 1 220px', minWidth: 180 }}>
            <SearchInput value={q} onChange={(v) => update({ q: v })} label="Search transactions" placeholder="Cursor or 20.00" />
          </div>
          <Select aria-label="Provider" value={provider} onChange={(e) => update({ provider: e.target.value })}>
            <option value="">All providers</option>
            {[...providers].sort((a, b) => a.provider.localeCompare(b.provider)).map((p) => (
              <option key={p.provider} value={p.provider}>{p.provider}</option>
            ))}
          </Select>
          <Select aria-label="Type" value={type} onChange={(e) => update({ type: e.target.value })}>
            <option value="">All types</option>
            {types.map((ty) => (
              <option key={ty} value={ty}>{KIND_LABELS[ty]}</option>
            ))}
          </Select>
          {(tags.length > 0 || tag) && (
            <Select aria-label="Tag" value={tag} onChange={(e) => update({ tag: e.target.value })}>
              <option value="">All tags</option>
              {tags.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
              <option value={UNTAGGED}>{UNTAGGED}</option>
            </Select>
          )}
          <Field inline label="From">
            <Input type="date" value={from} min={span?.firstDate} max={span?.lastDate} onChange={(e) => update({ from: e.target.value })} />
          </Field>
          <Field inline label="To">
            <Input type="date" value={to} min={span?.firstDate} max={span?.lastDate} onChange={(e) => update({ to: e.target.value })} />
          </Field>
          <Button onClick={usePeriod} title="Set the date range to the period selected in the header">
            Use selected period
          </Button>
          {anyFilter && (
            <Button variant="text" onClick={() => navigate(['transactions'], {}, true)}>
              Clear filters
            </Button>
          )}
        </div>
        {from && to && from > to && <div className="notice notice-warn" style={{ marginTop: 12 }}>The start date is after the end date.</div>}
      </Card>

      <Card
        title={`${filtered.length} of ${transactions.length} transactions`}
        subtitle={`${formatEUR(sumCents(filtered))} shown${provider ? ` · ${provider}` : ''}`}
        action={
          <>
            {provider && <CardAction href={`#/providers/${encodeURIComponent(provider)}`}>{provider} details</CardAction>}
            <CardAction href={href(['data'])}>Export a quarter</CardAction>
          </>
        }
      >
        <TagSuggestions />
        {filtered.length > 0 && <BulkTag rows={filtered} />}
        <TransactionTable
          editableTags
          onDelete={setPendingDelete}
          rows={filtered}
          sort={{ key: sortKey, dir: sortDir }}
          onSort={(s) => update({ sort: s.key, dir: s.dir })}
          emptyText="No transactions match these filters."
        />
      </Card>

      {pendingDelete && (
        <ConfirmDialog
          title="Delete this charge?"
          confirmLabel="Delete charge"
          busy={deleting}
          onCancel={() => setPendingDelete(null)}
          onConfirm={async () => {
            setDeleting(true);
            try {
              await deleteTransactions([pendingDelete.id]);
              setPendingDelete(null);
            } finally {
              setDeleting(false);
            }
          }}
        >
          <p>
            <strong>{pendingDelete.provider}</strong> · {formatEUR(pendingDelete.amountCents)} · {dateLabel(pendingDelete.date)}
            <br />
            <span className="meta">{pendingDelete.merchant.trim()}</span>
          </p>
          <p className="meta">
            {mode === 'demo'
              ? 'The charge is removed from the demo until you leave it. Nothing is saved.'
              : 'The charge is removed from this browser, and from totals, insights and the next-month estimate. If you import a file that contains it again, it comes back.'}
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
