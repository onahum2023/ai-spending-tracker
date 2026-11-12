import { useRef, useState, type ReactNode } from 'react';
import { parseLedgerCsv, type ParseResult, type ParsedRow } from '../lib/csv';
import { dateLabel } from '../lib/dates';
import { commitImport } from '../lib/db';
import { planImport, type ImportPlan } from '../lib/dedupe';
import { formatEUR, sumCents } from '../lib/money';
import { useLedger } from '../store';
import { Button, Descriptor, StatTile, Table } from './ui';

interface Preview {
  fileName: string;
  parse: ParseResult;
  plan: ImportPlan<ParsedRow> | null;
}

/** Pick or drop a CSV, review a validation + duplicate preview, then commit. */
export function ImportPanel({ onImported, extraActions }: { onImported?: () => void; extraActions?: ReactNode }) {
  // Duplicates are checked against stored data only; demo rows are never stored.
  const { stored, reload, tagRules } = useLedger();
  const [drag, setDrag] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const readText = (fileName: string, text: string) => {
    const parse = parseLedgerCsv(text);
    const plan = parse.fatal ? null : planImport(parse.rows, stored);
    setPreview({ fileName, parse, plan });
    setMessage(null);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (!/\.csv$/i.test(file.name) && file.type !== 'text/csv') {
      setMessage({ kind: 'error', text: `"${file.name}" is not a CSV file.` });
      return;
    }
    try {
      readText(file.name, await file.text());
    } catch {
      setMessage({ kind: 'error', text: `Could not read "${file.name}".` });
    }
  };

  const commit = async () => {
    if (!preview?.plan) return;
    setBusy(true);
    try {
      const res = await commitImport(
        preview.fileName,
        preview.parse.rows,
        preview.parse.rowsInFile,
        preview.parse.errors.length,
        tagRules,
      );
      await reload();
      // Ask the browser not to evict this site's storage under pressure (it may say no).
      void navigator.storage?.persist?.().catch(() => false);
      setPreview(null);
      setMessage({
        kind: 'ok',
        text:
          `Imported ${res.added} transaction${res.added === 1 ? '' : 's'} from ${preview.fileName}` +
          (res.skippedDuplicates ? `; skipped ${res.skippedDuplicates} already stored` : '') +
          (res.taggedByRule ? `; ${res.taggedByRule} tagged by your tag rules` : '') +
          '.',
      });
      onImported?.();
    } catch (e) {
      setMessage({ kind: 'error', text: `Import failed: ${e instanceof Error ? e.message : 'unknown error'}. Nothing was saved.` });
    } finally {
      setBusy(false);
    }
  };

  if (preview) {
    const { parse, plan, fileName } = preview;
    return (
      <div className="stack">
        <div className="row-between wrap">
          <div>
            <h3>Review import</h3>
            <p className="meta">{fileName}</p>
          </div>
          <div className="row">
            <Button onClick={() => setPreview(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={commit} disabled={busy || !plan || plan.toAdd.length === 0}>
              {plan && plan.toAdd.length > 0
                ? `Import ${plan.toAdd.length} transaction${plan.toAdd.length === 1 ? '' : 's'}`
                : 'Nothing to import'}
            </Button>
          </div>
        </div>

        {parse.fatal && <div className="notice notice-error">{parse.fatal}</div>}

        {plan && (
          <div className="stat-grid">
            <StatTile label="Rows in file" value={parse.rowsInFile} />
            <StatTile label="New, will be added" value={plan.toAdd.length} meta={formatEUR(sumCents(plan.toAdd))} />
            <StatTile label="Already stored" value={plan.duplicates.length} />
            <StatTile label="Invalid rows" value={parse.errors.length} />
          </div>
        )}

        {parse.warnings.map((w) => (
          <div key={w} className="notice notice-warn">{w}</div>
        ))}

        {parse.errors.length > 0 && (
          <div className="stack" style={{ gap: 8 }}>
            <div className="notice notice-error">
              {parse.errors.length} row{parse.errors.length === 1 ? '' : 's'} could not be read and will not be imported.
              Fix them in the file and import again; valid rows can be imported now.
            </div>
            <Table scrollHeight={220}>
                <thead>
                  <tr><th>Row</th><th>Problem</th><th>Content</th></tr>
                </thead>
                <tbody>
                  {parse.errors.slice(0, 200).map((e) => (
                    <tr key={e.sourceRow}>
                      <td className="num">{e.sourceRow}</td>
                      <td>{e.message}</td>
                      <td><Descriptor>{e.raw}</Descriptor></td>
                    </tr>
                  ))}
                </tbody>
              </Table>
          </div>
        )}

        {plan && plan.duplicates.length > 0 && (
          <details>
            <summary className="meta" style={{ cursor: 'pointer' }}>
              {plan.duplicates.length} row{plan.duplicates.length === 1 ? ' is' : 's are'} already stored and will be skipped — show
            </summary>
            <Table scrollHeight={220}>
                <tbody>
                  {plan.duplicates.slice(0, 300).map((r) => (
                    <tr key={r.sourceRow}>
                      <td className="num muted">Row {r.sourceRow}</td>
                      <td className="date">{dateLabel(r.date)}</td>
                      <td>{r.provider}</td>
                      <td><Descriptor>{r.merchant}</Descriptor></td>
                      <td className="amount">{formatEUR(r.amountCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
          </details>
        )}

        {plan && plan.repeatedInFile.length > 0 && (
          <div className="notice notice-info">
            {plan.repeatedInFile.length} record{plan.repeatedInFile.length === 1 ? ' appears' : 's appear'} more than once in this file
            (same date, provider, merchant and amount). They are kept as separate charges, since identical charges can be legitimate.
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="stack">
      <div
        className={`dropzone${drag ? ' drag' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void onFile(e.dataTransfer.files[0]);
        }}
      >
        <strong>Drop a CSV file here</strong>
        <p className="small">
          Columns: Merchant, Provider, Amount, Date (YYYY-MM-DD). Amounts are treated as EUR.
          <br />
          The file is read in your browser and saved only on this device. Nothing is uploaded.
        </p>
        <div className="row" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
          <Button variant="primary" onClick={() => inputRef.current?.click()} disabled={busy}>
            Choose CSV file…
          </Button>
          {extraActions}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
      {message && <div className={`notice notice-${message.kind}`}>{message.text}</div>}
    </div>
  );
}
