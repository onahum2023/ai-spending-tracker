import { useMemo, useRef, useState, type ReactNode } from 'react';
import type { ParsedRow } from '../lib/csv';
import { dateLabel } from '../lib/dates';
import { commitImport } from '../lib/db';
import { planImport } from '../lib/dedupe';
import { classifyRows, type Classified, type Decision } from '../lib/extract/classify';
import { mergeFiles, readStatementFile } from '../lib/extract/load';
import { summarizeDetails } from '../lib/extract/parse';
import { SERVICE_TYPE_LABELS, SERVICE_TYPES, type ReadResult, type ServiceType, type StatementRow } from '../lib/extract/types';
import { VENDORS } from '../lib/extract/vendors';
import { formatEUR, sumCents } from '../lib/money';
import { exportCsv } from '../lib/download';
import { useLedger } from '../store';
import { AskClaude } from './AskClaude';
import { Button, Descriptor, EmptyState, Input, Pill, Segmented, SearchInput, Select, Table } from './ui';

const PAGE = 100;
const KNOWN_PROVIDERS = [...new Set(VENDORS.map((v) => v.provider))].sort();

function period(rows: StatementRow[]): string {
  if (!rows.length) return '';
  const dates = rows.map((r) => r.date).sort();
  return `${dateLabel(dates[0])} – ${dateLabel(dates[dates.length - 1])}`;
}

export function StatementImport({ onImported, intro }: { onImported?: () => void; intro?: ReactNode }) {
  const { stored, reload, tagRules } = useLedger();
  const [results, setResults] = useState<ReadResult[]>([]);
  const [items, setItems] = useState<Classified[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [includeInfra, setIncludeInfra] = useState(true);
  const [tab, setTab] = useState<Decision>('include');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [drag, setDrag] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Mirrors of state that async work (reading several dropped files) must see fresh, not as captured at drop time.
  const resultsRef = useRef<ReadResult[]>([]);
  const infraRef = useRef(true);
  const setAllResults = (next: ReadResult[]) => {
    resultsRef.current = next;
    setResults(next);
  };
  const okRows = (all: ReadResult[]) => mergeFiles(all.filter((r) => !r.error)).rows;

  const merged = useMemo(() => mergeFiles(results.filter((r) => !r.error)), [results]);

  /** Re-runs the rules but keeps decisions you (or Claude) made by hand. */
  const reclassify = (rows: StatementRow[], infra: boolean, previous: Classified[]) => {
    const manual = new Map(previous.filter((c) => c.by !== 'rules').map((c) => [c.row.id, c]));
    return classifyRows(rows, { includeInfra: infra }).map((c) => manual.get(c.row.id) ?? c);
  };

  const addFiles = async (files: FileList | File[]) => {
    setMessage(null);
    const replaced = new Set<string>();
    for (const f of [...files]) {
      setBusy(`Reading ${f.name}…`);
      const r = await readStatementFile(f);
      replaced.add(r.fileName);
      // Always build on the latest list, so two overlapping drops cannot overwrite each other.
      setAllResults([...resultsRef.current.filter((x) => x.fileName !== r.fileName), r]);
    }
    setBusy(null);
    // A re-dropped file gets new row ids: hand decisions made on its old rows no longer apply.
    setItems((prev) => reclassify(okRows(resultsRef.current), infraRef.current, prev.filter((c) => !replaced.has(c.row.source))));
    setTab('include');
    setLimit(PAGE);
  };

  const removeFile = (name: string) => {
    setAllResults(resultsRef.current.filter((r) => r.fileName !== name));
    setItems((prev) => reclassify(okRows(resultsRef.current), infraRef.current, prev.filter((c) => c.row.source !== name)));
  };

  const toggleInfra = (on: boolean) => {
    infraRef.current = on;
    setIncludeInfra(on);
    setItems((prev) => reclassify(merged.rows, on, prev));
  };

  const update = (id: string, patch: Partial<Pick<Classified, 'decision' | 'provider' | 'type'>>) => {
    setItems((prev) =>
      prev.map((c) => {
        if (c.row.id !== id) return c;
        const next = { ...c, ...patch, by: 'you' as const };
        if (patch.decision === 'include') {
          next.provider ??= c.row.label ?? c.row.merchant.split(/[,*]| {2,}/)[0].trim();
          next.type ??= 'subscription';
        }
        return next;
      }),
    );
  };

  const counts = { include: 0, review: 0, exclude: 0 };
  for (const c of items) counts[c.decision]++;
  const included = useMemo(() => items.filter((c) => c.decision === 'include'), [items]);
  const missingProvider = included.filter((c) => !c.provider?.trim()).length;
  const askable = useMemo(() => items.filter((c) => c.decision === 'review' && c.by === 'rules'), [items]);

  const ledgerRows: ParsedRow[] = useMemo(
    () =>
      included
        .slice()
        .sort((a, b) => a.row.date.localeCompare(b.row.date))
        .map((c, i) => ({
          merchant: c.row.merchant,
          provider: (c.provider ?? '').trim(),
          amountCents: c.row.amountCents,
          date: c.row.date,
          ...(c.type ? { type: c.type } : {}),
          sourceRow: i + 2,
        })),
    [included],
  );
  const alreadyStored = useMemo(() => planImport(ledgerRows, stored).duplicates.length, [ledgerRows, stored]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items
      .filter((c) => c.decision === tab)
      .filter((c) => !needle || `${c.row.merchant} ${c.row.label ?? ''} ${c.provider ?? ''} ${c.row.date}`.toLowerCase().includes(needle))
      .sort((a, b) => b.row.date.localeCompare(a.row.date));
  }, [items, tab, q]);

  const commit = async () => {
    if (missingProvider) return;
    setBusy('Saving…');
    try {
      const label = results.length === 1 ? results[0].fileName : `${results.length} statements`;
      const res = await commitImport(label, ledgerRows, ledgerRows.length, 0, tagRules);
      await reload();
      void navigator.storage?.persist?.().catch(() => false);
      setMessage({
        kind: 'ok',
        text: `Added ${res.added} charge${res.added === 1 ? '' : 's'} to the ledger${res.skippedDuplicates ? `; ${res.skippedDuplicates} were already stored` : ''}${res.taggedByRule ? `; ${res.taggedByRule} tagged by your tag rules` : ''}.`,
      });
      setAllResults([]);
      setItems([]);
      onImported?.();
    } catch (e) {
      setMessage({ kind: 'error', text: `Saving failed: ${e instanceof Error ? e.message : 'unknown error'}. Nothing was saved.` });
    } finally {
      setBusy(null);
    }
  };

  const okFiles = results.filter((r) => !r.error);

  return (
    <div className="stack">
      {intro}
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
          void addFiles(e.dataTransfer.files);
        }}
      >
        <strong>{results.length ? 'Add more statements' : 'Drop bank or card statements here'}</strong>
        <p className="small">
          Excel (.xlsx) or CSV exports from your bank or card, and Revolut PDF statements. Add several at once.
          <br />
          Files are read in your browser. Nothing is uploaded.
        </p>
        <Button variant="primary" onClick={() => inputRef.current?.click()} disabled={!!busy}>
          Choose files…
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.xlsx,.csv,.txt,application/pdf,text/csv"
          hidden
          onChange={(e) => {
            if (e.target.files) void addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {busy && (
        <div className="row meta">
          <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
          {busy}
        </div>
      )}
      {message && <div className={`notice notice-${message.kind}`}>{message.text}</div>}

      {results.length > 0 && (
        <div className="file-list">
          {results.map((r) => (
            <div key={r.fileName} className={`file-item${r.error ? ' file-error' : ''}`}>
              <div className="row-between">
                <strong className="small">{r.fileName}</strong>
                <Button variant="text" onClick={() => removeFile(r.fileName)} aria-label={`Remove ${r.fileName}`}>
                  Remove
                </Button>
              </div>
              {r.error ? (
                <div className="small" style={{ color: 'var(--danger)' }}>{r.error}</div>
              ) : (
                <div className="meta">
                  {r.format === 'amex' ? 'American Express export' : r.format === 'revolut-pdf' ? 'Revolut PDF statement' : 'Table export'} · {r.rows.length} lines · {period(r.rows)}
                  {r.notes.length > 0 && <div>{r.notes.join(' ')}</div>}
                </div>
              )}
            </div>
          ))}
          {merged.dropped > 0 && (
            <div className="meta">{merged.dropped} line{merged.dropped === 1 ? '' : 's'} appeared in more than one file and {merged.dropped === 1 ? 'was' : 'were'} counted once.</div>
          )}
        </div>
      )}

      {okFiles.length > 0 && (
        <>
          <div className="row-between wrap">
            <Segmented<Decision>
              label="Show"
              value={tab}
              onChange={(d) => {
                setTab(d);
                setLimit(PAGE);
              }}
              options={[
                { value: 'include', label: `AI charges (${counts.include})` },
                { value: 'review', label: `Needs review (${counts.review})` },
                { value: 'exclude', label: `Not AI (${counts.exclude})` },
              ]}
            />
            <div className="row wrap" style={{ gap: 12 }}>
              <label className="row meta" style={{ gap: 8 }}>
                <input type="checkbox" checked={includeInfra} onChange={(e) => toggleInfra(e.target.checked)} />
                Include hosting, domains & dev tools
              </label>
              <div style={{ width: 220 }}>
                <SearchInput value={q} onChange={(v) => { setQ(v); setLimit(PAGE); }} label="Search these lines" placeholder="Anthropic" />
              </div>
            </div>
          </div>

          {tab === 'review' && counts.review > 0 && (
            <div className="notice notice-info">
              These might be AI spending. Include or exclude each one; the reason the rules were unsure is shown on every line.
            </div>
          )}
          {tab === 'review' && askable.length > 0 && (
            <AskClaude
              items={askable}
              onVerdicts={(v) =>
                void import('../lib/extract/claude').then(({ applyVerdicts }) => setItems((prev) => applyVerdicts(prev, v)))
              }
            />
          )}

          <datalist id="known-providers">
            {KNOWN_PROVIDERS.map((p) => <option key={p} value={p} />)}
          </datalist>

          {visible.length === 0 ? (
            <EmptyState>Nothing here.</EmptyState>
          ) : (
            <Table scrollHeight={520} tableClassName="stmt-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Statement line</th>
                    <th className="amount">Amount</th>
                    {tab !== 'exclude' && <th>Provider</th>}
                    {tab !== 'exclude' && <th>Type</th>}
                    <th>Why</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visible.slice(0, limit).map((c) => (
                    <tr key={c.row.id}>
                      <td className="date">{dateLabel(c.row.date)}</td>
                      <td>
                        <Descriptor>{c.row.merchant}</Descriptor>
                        <div className="meta stmt-sub" title={[c.row.label, c.row.details, c.row.country].filter(Boolean).join(' · ')}>
                          {[c.row.label, summarizeDetails(c.row.details), c.row.country].filter(Boolean).join(' · ')}
                        </div>
                      </td>
                      <td className="amount">{formatEUR(c.row.amountCents)}</td>
                      {tab !== 'exclude' && (
                        <td>
                          <Input
                            list="known-providers"
                            value={c.provider ?? ''}
                            placeholder="Anthropic"
                            aria-label="Provider"
                            onChange={(e) => update(c.row.id, { provider: e.target.value })}
                           />
                        </td>
                      )}
                      {tab !== 'exclude' && (
                        <td>
                          <Select
                            aria-label="Type"
                            value={c.type ?? ''}
                            onChange={(e) => update(c.row.id, { type: (e.target.value || null) as ServiceType | null })}
                          >
                            <option value="">—</option>
                            {SERVICE_TYPES.map((t) => <option key={t} value={t}>{SERVICE_TYPE_LABELS[t]}</option>)}
                          </Select>
                        </td>
                      )}
                      <td className="meta why">
                        {c.by !== 'rules' && <><Pill kind={c.by === 'you' ? 'neutral' : 'inferred'}>{c.by === 'you' ? 'You' : 'Claude'}</Pill>{' '}</>}
                        {c.reasons.join('. ')}
                      </td>
                      <td className="nowrap">
                        {c.decision !== 'include' && (
                          <Button onClick={() => update(c.row.id, { decision: 'include' })}>Include</Button>
                        )}
                        {c.decision !== 'exclude' && (
                          <Button variant="text" onClick={() => update(c.row.id, { decision: 'exclude' })}>Exclude</Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
            </Table>
          )}
          {visible.length > limit && (
            <div className="row" style={{ justifyContent: 'center' }}>
              <Button onClick={() => setLimit((l) => l + PAGE)}>Show more ({visible.length - limit} remaining)</Button>
            </div>
          )}

          <div className="row-between wrap stmt-footer">
            <div className="meta">
              <strong className="num">{included.length}</strong> AI charges · <strong className="num">{formatEUR(sumCents(included.map((c) => c.row)))}</strong>
              {alreadyStored > 0 && <> · {alreadyStored} already in your ledger (skipped)</>}
              {counts.review > 0 && <> · {counts.review} still to review</>}
              {missingProvider > 0 && <span style={{ color: 'var(--danger)' }}> · {missingProvider} included without a provider</span>}
            </div>
            <div className="row wrap">
              <Button disabled={!ledgerRows.length} onClick={() => exportCsv(ledgerRows, 'ai-spending-ledger.csv')}>
                Download as CSV
              </Button>
              <Button variant="primary" disabled={ledgerRows.length - alreadyStored <= 0 || missingProvider > 0 || !!busy} onClick={commit}>
                {ledgerRows.length - alreadyStored > 0 ? `Add ${ledgerRows.length - alreadyStored} charges to the ledger` : 'Nothing new to add'}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
