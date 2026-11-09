import { useState } from 'react';
import type { Classified } from '../lib/extract/classify';
import type { Verdict } from '../lib/extract/claude';

const KEY_STORE = 'ai-spending-tracker.anthropic-key';

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

  const saveKey = (key: string, keep: boolean) => {
    try {
      if (keep && key) localStorage.setItem(KEY_STORE, key);
      else localStorage.removeItem(KEY_STORE);
    } catch {
      /* storage blocked: key just isn't remembered */
    }
  };

  const showPreview = async () => {
    const { payloadFor } = await import('../lib/extract/claude');
    setPreview(items.map((c, i) => payloadFor(c, `r${i + 1}`)));
  };

  const run = async () => {
    setError(null);
    setBusy('Asking Claude…');
    saveKey(apiKey.trim(), remember);
    try {
      const { askClaude } = await import('../lib/extract/claude');
      const verdicts = await askClaude(apiKey.trim(), items, (done, total) => setBusy(`Asking Claude… ${done} of ${total}`));
      onVerdicts(verdicts);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  if (!open) {
    return (
      <div className="ask-claude row-between wrap">
        <span className="small secondary">
          Not sure? Claude can review these {items.length} line{items.length === 1 ? '' : 's'} with your own Anthropic API key.
        </span>
        <button className="btn btn-sm" onClick={() => setOpen(true)}>Ask Claude…</button>
      </div>
    );
  }

  return (
    <div className="ask-claude stack" style={{ gap: 10 }}>
      <div className="row-between wrap">
        <strong>Ask Claude about {items.length} line{items.length === 1 ? '' : 's'}</strong>
        <button className="btn btn-sm btn-ghost" onClick={() => setOpen(false)} disabled={!!busy}>Close</button>
      </div>
      <p className="small secondary">
        Only these lines leave your browser, sent directly to Anthropic's API with your key: date, amount, merchant name,
        your bank's short name, foreign amount, country and why the rules were unsure. No file names, references or
        addresses. Claude's answers appear on each line; you can still change them. Usually costs a few cents.
      </p>
      <div className="row wrap" style={{ gap: 8 }}>
        <input
          className="input"
          style={{ flex: '1 1 260px' }}
          type="password"
          autoComplete="off"
          placeholder="Anthropic API key (sk-ant-…)"
          aria-label="Anthropic API key"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
        <label className="row small secondary" style={{ gap: 6 }}>
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Remember on this device
        </label>
        <button className="btn btn-sm btn-ghost" onClick={() => (preview ? setPreview(null) : void showPreview())}>
          {preview ? 'Hide' : 'Show'} exactly what is sent
        </button>
        <button className="btn btn-primary" onClick={run} disabled={!apiKey.trim() || !!busy}>
          {busy ?? 'Ask Claude'}
        </button>
      </div>
      {remember && <p className="small muted">The key is stored in this browser only. Untick to forget it.</p>}
      {error && <div className="notice notice-error">{error}</div>}
      {preview && <pre className="ask-preview">{JSON.stringify(preview, null, 2)}</pre>}
    </div>
  );
}
