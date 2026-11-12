import { useState } from 'react';
import { AboutCard } from '../components/AboutCard';
import { ImportPanel } from '../components/ImportPanel';
import { QuarterExport } from '../components/QuarterExport';
import { Card, CardNote, ConfirmDialog, Button, Table } from '../components/ui';
import { exportCsv } from '../lib/download';
import { StatementImport } from '../components/StatementImport';
import { dateLabel } from '../lib/dates';
import { clearAll } from '../lib/db';
import { clearLocalPrefs } from '../lib/localPrefs';
import { formatEUR, sumCents } from '../lib/money';
import { useLedger } from '../store';

export function DataPage() {
  const { transactions, imports, span, providers, reload, mode, exitDemo } = useLedger();
  const demo = mode === 'demo';
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const clear = async () => {
    setBusy(true);
    try {
      await clearAll();
      clearLocalPrefs(); // a remembered API key and the demo flag
      await reload();
      window.location.hash = '#/';
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <div className="stack">
      <Card
        title={demo ? 'Use your own data: extract AI charges from statements' : 'Extract AI charges from bank or card statements'}
        subtitle="Excel, CSV and Revolut PDF, read in your browser"
      >
        <CardNote>Review before anything is saved.</CardNote>
        <StatementImport onImported={demo ? () => (window.location.hash = '#/') : undefined} />
      </Card>
      <div className="grid cols-2">
        <Card
          title={demo ? 'Or import a ledger CSV' : 'Import a ledger CSV'}
          subtitle={demo ? 'Replaces the demo data, never mixed with it' : 'Same format as an export, reviewed before saving'}
        >
          <ImportPanel onImported={demo ? () => (window.location.hash = '#/') : undefined} />
        </Card>
        <Card
          title={demo ? 'Demo data' : 'Stored data'}
          subtitle={demo ? 'Invented transactions, not saved anywhere' : 'Kept only in this browser, nothing is uploaded'}
        >
          <CardNote>
            {demo
              ? 'Generated in your browser each time you open the demo.'
              : 'Stored in IndexedDB on this device. It is not synced to other devices.'}
          </CardNote>
          <div className="stat-row" style={{ gridTemplateColumns: 'repeat(3, auto)', justifyContent: 'start' }}>
            <div><div className="section-label">Transactions</div><div className="value num">{transactions.length}</div></div>
            <div><div className="section-label">Providers</div><div className="value num">{providers.length}</div></div>
            <div><div className="section-label">Total</div><div className="value num">{formatEUR(sumCents(transactions))}</div></div>
          </div>
          {span && <p className="meta" style={{ marginTop: 8 }}>{dateLabel(span.firstDate)} – {dateLabel(span.lastDate)}</p>}
          <div className="row wrap" style={{ marginTop: 16 }}>
            <Button
              onClick={() => exportCsv(transactions, demo ? 'ai-spending-example.csv' : undefined)}
              disabled={!transactions.length}
            >
              {demo ? 'Download demo as CSV' : 'Export all as CSV'}
            </Button>
            {demo ? (
              <Button onClick={exitDemo}>
                Exit demo
              </Button>
            ) : (
              <Button variant="danger" onClick={() => setConfirming(true)} disabled={!transactions.length}>
                Clear local data…
              </Button>
            )}
          </div>
          <p className="meta" style={{ marginTop: 12 }}>
            Exports use the import format (Merchant, Provider, Amount, Date, plus Type and Tag when used), so an export can be re-imported
            or loaded on another device. The file holds transactions only: budgets, corrections, labels, categories, tag rules and the import history are not in it.
          </p>
        </Card>
      </div>

      <QuarterExport />

      <div className="grid cols-2">
        <Card title="Import history">
          {imports.length === 0 ? (
            <p className="muted">No imports yet.</p>
          ) : (
            <Table>
                <thead>
                  <tr>
                    <th>When</th><th>File</th><th className="amount">Rows</th><th className="amount">Added</th><th className="amount">Skipped</th><th className="amount">Invalid</th>
                  </tr>
                </thead>
                <tbody>
                  {[...imports].reverse().map((i) => (
                    <tr key={i.id}>
                      <td className="date">{new Date(i.importedAt).toLocaleString()}</td>
                      <td>{i.fileName}</td>
                      <td className="amount">{i.rowsInFile}</td>
                      <td className="amount">{i.added}</td>
                      <td className="amount">{i.skippedDuplicates}</td>
                      <td className="amount">{i.invalid}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
          )}
        </Card>
        <Card title="How duplicates are handled">
          <div className="stack meta" style={{ gap: 8 }}>
            <p>
              The CSV has no transaction IDs, so a record is identified by all four values together:
              date, provider, merchant descriptor and amount (exact match).
            </p>
            <p>
              Two identical charges on the same day can be real, so identical rows within one file are never merged.
              Instead, counts are compared: if a file contains a record <strong>N</strong> times and it is already stored{' '}
              <strong>M</strong> times, <strong>N − M</strong> copies are added (never fewer than zero).
            </p>
            <p>
              Re-importing the same file or an export adds nothing. A newer statement that overlaps an older one only adds the new rows.
              Every skipped row is listed in the import review, so nothing is discarded silently.
            </p>
            <p>Rows that fail validation (missing fields, malformed amounts or dates) are listed with their row number and are not imported.</p>
          </div>
        </Card>
      </div>

      <AboutCard />

      {confirming && (
        <ConfirmDialog
          title="Delete all local data?"
          confirmLabel={`Delete ${transactions.length} transactions`}
          requireText="DELETE"
          busy={busy}
          onCancel={() => setConfirming(false)}
          onConfirm={clear}
        >
          <p>
            This permanently removes all {transactions.length} transactions ({formatEUR(sumCents(transactions))}), their tags, your budgets,
            your corrections, labels, categories and tag rules, a remembered Anthropic API key, and the import history from this browser. It can't be undone.
          </p>
          <Button onClick={() => exportCsv(transactions)}>
            Export a backup first
          </Button>
        </ConfirmDialog>
      )}
    </div>
  );
}
