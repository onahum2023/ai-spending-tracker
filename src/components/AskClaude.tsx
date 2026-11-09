import { useState } from 'react';
import type { Classified } from '../lib/extract/classify';
import { buildChatPrompt, chatUrl, lineIds, parseChatAnswer, payloadFor, type Verdict } from '../lib/extract/review';

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
  const [answer, setAnswer] = useState('');
  const [note, setNote] = useState<string | null>(null);

  const saveKey = (key: string, keep: boolean) => {
    try {
      if (keep && key) localStorage.setItem(KEY_STORE, key);
      else localStorage.removeItem(KEY_STORE);
    } catch {
      /* storage blocked: key just isn't remembered */
    }
  };

  const showPreview = () => setPreview(items.map((c, i) => payloadFor(c, `r${i + 1}`)));

  const openChat = async () => {
    setError(null);
    setNote(null);
    const prompt = buildChatPrompt(items);
    const url = chatUrl(prompt);
    window.open(url ?? 'https://claude.ai/new', '_blank', 'noopener,noreferrer');
    let copied = true;
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      copied = false;
    }
    setNote(
      url
        ? 'claude.ai opened with the lines filled in. Press Send there, then paste its answer below.'
        : copied
          ? 'Too many lines to fit in a link. The prompt is copied: paste it into the new claude.ai chat, press Send, then paste the answer below.'
          : 'Too many lines to fit in a link and the clipboard is blocked. Use "Show exactly what is sent", or review fewer lines.',
    );
  };

  const applyAnswer = () => {
    setError(null);
    setNote(null);
    try {
      const { verdicts } = parseChatAnswer(answer, lineIds(items));
      onVerdicts(verdicts);
      setAnswer('');
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
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
          Not sure? You can decide each line yourself with Include / Exclude. Optionally, Claude can review these {items.length} line{items.length === 1 ? '' : 's'}, with your Claude subscription or an Anthropic API key.
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
      <div className="stack" style={{ gap: 8 }}>
        <strong className="small">Option 1: use my Claude subscription</strong>
        <p className="small secondary">
          Opens claude.ai in a new tab with these lines already typed in. Nothing is sent until you press Send there. Then paste
          Claude's answer back here. The same fields as below are included.
        </p>
        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn btn-primary" onClick={() => void openChat()}>Open in Claude…</button>
          <button className="btn btn-sm btn-ghost" onClick={() => (preview ? setPreview(null) : showPreview())}>
            {preview ? 'Hide' : 'Show'} exactly what is sent
          </button>
        </div>
        {note && <div className="notice notice-info">{note}</div>}
        <textarea
          className="input"
          rows={4}
          placeholder="Paste Claude's answer here (the JSON starting with {&quot;results&quot;…)"
          aria-label="Claude's answer"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
        />
        <div>
          <button className="btn" onClick={applyAnswer} disabled={!answer.trim()}>Apply the answer</button>
        </div>
      </div>
      <strong className="small">Option 2: use an Anthropic API key</strong>
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
