import { useMemo, useState } from 'react';
import { exportCsv } from '../lib/download';
import { formatEUR } from '../lib/money';
import { quarterLabel, quarterReport, quartersIn, tagsInUse, UNTAGGED } from '../lib/tags';
import { href } from '../router';
import { useLedger } from '../store';
import { Card, EmptyState } from './ui';

/** Charges of one quarter, optionally one tag, as a CSV for expense claims or an accountant. */
export function QuarterExport() {
  const { transactions, mode } = useLedger();
  const quarters = useMemo(() => quartersIn(transactions), [transactions]);
  const tags = useMemo(() => tagsInUse(transactions), [transactions]);
  const [quarter, setQuarter] = useState('');
  const [tag, setTag] = useState('');
  const q = quarters.includes(quarter) ? quarter : quarters[0];
  const report = useMemo(() => (q ? quarterReport(transactions, q, tag || null) : null), [transactions, q, tag]);

  const download = () => {
    if (!report) return;
    const slug = tag ? `-${tag.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tag'}` : '';
    exportCsv(report.rows, `ai-spending-${report.quarter}${slug}${mode === 'demo' ? '-demo' : ''}.csv`);
  };

  return (
    <Card title="Export a quarter" subtitle="Charges for one quarter, optionally for one tag, for expense claims or your accountant">
      {!report ? (
        <EmptyState>No transactions yet.</EmptyState>
      ) : (
        <div className="stack" style={{ gap: 12 }}>
          <div className="filters">
            <label>
              Quarter
              <select className="select" value={q} onChange={(e) => setQuarter(e.target.value)}>
                {quarters.map((x) => (
                  <option key={x} value={x}>{quarterLabel(x)}</option>
                ))}
              </select>
            </label>
            <label>
              Tag
              <select className="select" value={tag} onChange={(e) => setTag(e.target.value)}>
                <option value="">All charges</option>
                {tags.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
                <option value={UNTAGGED}>{UNTAGGED}</option>
              </select>
            </label>
          </div>

          {report.rows.length === 0 ? (
            <p className="small muted">No charges match.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Tag</th>
                    <th className="amount">Charges</th>
                    <th className="amount">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {report.totals.map((t) => (
                    <tr key={t.tag}>
                      <td>{t.tag === UNTAGGED ? <span className="muted">{UNTAGGED}</span> : t.tag}</td>
                      <td className="amount">{t.count}</td>
                      <td className="amount">{formatEUR(t.totalCents)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>{quarterLabel(report.quarter)}</td>
                    <td className="amount">{report.rows.length}</td>
                    <td className="amount">{formatEUR(report.totalCents)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <div className="row wrap">
            <button className="btn" onClick={download} disabled={report.rows.length === 0}>
              Download {report.rows.length} charge{report.rows.length === 1 ? '' : 's'} as CSV
            </button>
            {tags.length === 0 && (
              <a className="small" href={href(['transactions'])} style={{ textDecoration: 'underline' }}>
                Nothing is tagged yet: tag charges on the Transactions page
              </a>
            )}
          </div>
          <p className="small muted">
            Amounts are as charged, in euro. The ledger has no VAT figures, so VAT is not split out. The file includes a Tag column and can be
            re-imported.
          </p>
        </div>
      )}
    </Card>
  );
}
