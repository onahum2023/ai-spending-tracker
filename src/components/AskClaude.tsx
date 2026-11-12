import { useMemo, useState } from 'react';
import { dateLabel } from '../lib/dates';
import { formatEUR } from '../lib/money';
import { SERVICE_TYPE_LABELS } from '../lib/extract/types';
import type { Classified } from '../lib/extract/classify';
import { payloadFor, type Verdict } from '../lib/extract/review';
import { forgetApiKey, KEY_STORE } from '../lib/localPrefs';
import { Pill, type PillKind, Button, Input, Table, Descriptor } from './ui';


function readKey(): string {
  try {
    return localStorage.getItem(KEY_STORE) ?? '';
  } catch {
    return '';
  }
}

/**
 * Opt-in: sends the listed statement lines (and only the fields shown) to Claude
 * with the user's own Anthropic API key. Nothing is sent until the button is pressed.
 */
export function AskClaude({ items, onVerdicts }: { items: Classified[]; onVerdicts: (v: Map<string, Verdict>) => void }) {
  const [apiKey, setApiKey] = useState(readKey);
  const [remember, setRemember] = useState(() => readKey() !== '');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<unknown[] | null>(null);
  /** Claude's answers, held here until the user confirms them. */
  const [proposed, setProposed] = useState<Map<string, Verdict> | null>(null);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);

  const saveKey = (key: string, keep: boolean) => {
    try {
      if (keep && key) localStorage.setItem(KEY_STORE, key);
      else forgetApiKey();
    } catch {
      /* storage blocked: key just isn't remembered */
    }
  };

  const showPreview = () => {
    setPreview(items.map((c, i) => payloadFor(c, `r${i + 1}`)));
  };

  const run = async () => {
    setError(null);
    setBusy('Asking Claude…');
    saveKey(apiKey.trim(), remember);
    try {
      const { askClaude } = await import('../lib/extract/claude');
      const verdicts = await askClaude(apiKey.trim(), items, (done, total) => setBusy(`Asking Claude… ${done} of ${total}`));
      setProposed(verdicts);
      setAccepted(new Set(verdicts.keys()));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const partial = (e as { partial?: Map<string, Verdict> }).partial;
      if (partial && partial.size > 0) {
        // Earlier batches finished and were paid for: still let the user review them.
        setProposed(partial);
        setAccepted(new Set(partial.keys()));
        setNotice(`${message} These are the answers received before it failed; the other lines stay in review.`);
      } else {
        setError(message);
      }
    } finally {
      setBusy(null);
    }
  };

  const confirm = () => {
    if (!proposed) return;
    onVerdicts(new Map([...proposed].filter(([id]) => accepted.has(id))));
    setProposed(null);
    setNotice(null);
    setOpen(false);
  };
  const discard = () => {
    setProposed(null);
    setNotice(null);
    setAccepted(new Set());
  };

  if (proposed) {
    return (
      <ClaudeResults
        items={items}
        proposed={proposed}
        notice={notice}
        accepted={accepted}
        onToggle={(id) =>
          setAccepted((prev) => {
            const next = new Set(prev);
            if (!next.delete(id)) next.add(id);
            return next;
          })
        }
        onSetAll={(on) => setAccepted(on ? new Set(proposed.keys()) : new Set())}
        onConfirm={confirm}
        onDiscard={discard}
      />
    );
  }

  if (!open) {
    return (
      <div className="ask-claude row-between wrap">
        <span className="meta">
          Not sure? You can decide each line yourself with Include / Exclude. Optionally, Claude can review these {items.length} line{items.length === 1 ? '' : 's'} if you have an Anthropic API key.
        </span>
        <Button onClick={() => setOpen(true)}>Ask Claude…</Button>
      </div>
    );
  }

  return (
    <div className="ask-claude stack" style={{ gap: 12 }}>
      <div className="row-between wrap">
        <strong>Ask Claude about {items.length} line{items.length === 1 ? '' : 's'}</strong>
        <Button variant="text" onClick={() => setOpen(false)} disabled={!!busy}>Close</Button>
      </div>
      <p className="meta">
        Only these lines leave your browser, sent directly to Anthropic's API with your key: date, amount, the line's description
        exactly as your bank wrote it (it can include a city or a payment reference), your bank's short name, foreign amount,
        country and why the rules were unsure. No file names or other columns. Check the preview first and leave out any line
        you would rather not send. Claude's answers appear on each line; you can still change them. Usually costs a few cents.
      </p>
      <div className="row wrap" style={{ gap: 8 }}>
        <Input
          style={{ flex: '1 1 260px' }}
          type="password"
          autoComplete="off"
          placeholder="sk-ant-api03-…"
          aria-label="Anthropic API key"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
         />
        <label className="row meta" style={{ gap: 8 }}>
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => {
              setRemember(e.target.checked);
              // Unticking forgets a stored key straight away, not at the next request.
              if (!e.target.checked) forgetApiKey();
            }}
          />
          Remember on this device
        </label>
        <Button variant="text" onClick={() => (preview ? setPreview(null) : showPreview())}>
          {preview ? 'Hide' : 'Show'} exactly what is sent
        </Button>
        <Button variant="primary" onClick={run} disabled={!apiKey.trim() || !!busy}>
          {busy ?? 'Ask Claude'}
        </Button>
      </div>
      {remember && <p className="meta">The key is stored in this browser only. Untick to forget it.</p>}
      {error && <div className="notice notice-error">{error}</div>}
      {preview && <pre className="ask-preview">{JSON.stringify(preview, null, 2)}</pre>}
    </div>
  );
}

type Outcome = { label: string; kind: PillKind; note: string };
function outcomeOf(v: Verdict): Outcome {
  if (v.confidence === 'low') return { label: 'Not sure', kind: 'attention', note: 'Stays in review, with Claude’s note' };
  return v.is_ai_spending
    ? { label: 'AI charge', kind: 'inferred', note: 'Moves to AI charges' }
    : { label: 'Not AI', kind: 'neutral', note: 'Moves to Not AI' };
}

/** Step two: shows what Claude answered and applies only what the user confirms. */
function ClaudeResults({
  items, proposed, notice, accepted, onToggle, onSetAll, onConfirm, onDiscard,
}: {
  items: Classified[];
  proposed: Map<string, Verdict>;
  notice: string | null;
  accepted: Set<string>;
  onToggle: (rowId: string) => void;
  onSetAll: (on: boolean) => void;
  onConfirm: () => void;
  onDiscard: () => void;
}) {
  const rows = useMemo(() => items.filter((c) => proposed.has(c.row.id)), [items, proposed]);
  const unanswered = items.length - rows.length;
  const tally = { ai: 0, no: 0, unsure: 0 };
  for (const c of rows) {
    if (!accepted.has(c.row.id)) continue;
    const v = proposed.get(c.row.id)!;
    if (v.confidence === 'low') tally.unsure++;
    else if (v.is_ai_spending) tally.ai++;
    else tally.no++;
  }
  return (
    <div className="ask-claude stack" style={{ gap: 12 }}>
      <div className="row-between wrap">
        <strong>Claude answered {rows.length} of {items.length} line{items.length === 1 ? '' : 's'}</strong>
        <div className="row" style={{ gap: 8 }}>
          <Button variant="text" onClick={() => onSetAll(true)}>Select all</Button>
          <Button variant="text" onClick={() => onSetAll(false)}>Select none</Button>
        </div>
      </div>
      {notice && <div className="notice notice-error">{notice}</div>}
      <p className="meta">
        Nothing has changed yet. Untick any answer you disagree with, then confirm. You can still change any line afterwards.
        {unanswered > 0 && <> Claude did not answer {unanswered} line{unanswered === 1 ? '' : 's'}; they stay in review.</>}
      </p>
      <Table scrollHeight={360} tableClassName="stmt-table">
          <thead>
            <tr>
              <th />
              <th>Date</th>
              <th>Statement line</th>
              <th className="amount">Amount</th>
              <th>Claude says</th>
              <th>Provider · type</th>
              <th>Why</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const v = proposed.get(c.row.id)!;
              const o = outcomeOf(v);
              const on = accepted.has(c.row.id);
              return (
                <tr key={c.row.id} style={on ? undefined : { opacity: 0.5 }}>
                  <td>
                    <input type="checkbox" checked={on} onChange={() => onToggle(c.row.id)} aria-label={`Accept the answer for ${c.row.merchant}`} />
                  </td>
                  <td className="date">{dateLabel(c.row.date)}</td>
                  <td><Descriptor>{c.row.merchant}</Descriptor></td>
                  <td className="amount">{formatEUR(c.row.amountCents)}</td>
                  <td>
                    <Pill kind={o.kind}>{o.label}</Pill>
                    <div className="meta">{v.confidence} confidence</div>
                  </td>
                  <td className="small">
                    {v.is_ai_spending && v.confidence !== 'low' ? [v.provider, v.type ? SERVICE_TYPE_LABELS[v.type] : null].filter(Boolean).join(' · ') || '—' : '—'}
                  </td>
                  <td className="meta why">{v.reason}<div className="muted">{o.note}</div></td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      <div className="row-between wrap">
        <div className="meta">
          Will apply {accepted.size}: <strong className="num">{tally.ai}</strong> to AI charges, <strong className="num">{tally.no}</strong> to Not AI,{' '}
          <strong className="num">{tally.unsure}</strong> unsure (stay in review).
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Button variant="text" onClick={onDiscard}>Discard answers</Button>
          <Button variant="primary" onClick={onConfirm} disabled={accepted.size === 0}>
            Apply {accepted.size} answer{accepted.size === 1 ? '' : 's'}
          </Button>
        </div>
      </div>
    </div>
  );
}
