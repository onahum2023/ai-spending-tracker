import { useEffect, useMemo, useState } from 'react';
import { MAX_TAG_LENGTH } from '../lib/csv';
import { cleanTag, SUGGESTED_TAGS, tagsInUse } from '../lib/tags';
import type { Transaction } from '../lib/types';
import { useLedger } from '../store';
import { Button, ConfirmDialog, Field, Input } from './ui';

export const TAG_LIST_ID = 'tag-suggestions';

/** The shared suggestion list: tags already in use first, then Personal and Business. */
export function TagSuggestions() {
  const { transactions } = useLedger();
  const options = useMemo(() => {
    const used = tagsInUse(transactions);
    return [...used, ...SUGGESTED_TAGS.filter((t) => !used.includes(t))];
  }, [transactions]);
  return (
    <datalist id={TAG_LIST_ID}>
      {options.map((t) => (
        <option key={t} value={t} />
      ))}
    </datalist>
  );
}

/**
 * One charge's tag: Personal or Business in one click, or any other label after "…". Clicking the active tag clears it. A charge
 * has at most one tag.
 */
export function TagInput({ tx }: { tx: Transaction }) {
  const { setTags } = useLedger();
  const cur = tx.tag ?? '';
  const custom = cur !== '' && !SUGGESTED_TAGS.includes(cur);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(cur);
  useEffect(() => setDraft(cur), [cur]);
  const commit = () => {
    setEditing(false);
    const t = cleanTag(draft);
    if (t !== cur) void setTags([tx.id], t || null);
  };
  if (editing) {
    return (
      <Input
        className="tag-input"
        list={TAG_LIST_ID}
        value={draft}
        autoFocus
        placeholder="Client: Acme"
        maxLength={MAX_TAG_LENGTH}
        aria-label={`Tag for ${tx.provider} charge on ${tx.date}`}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setDraft(cur);
            setEditing(false);
          }
        }}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }
  return (
    <span className="tag-toggle" role="group" aria-label={`Tag for ${tx.provider} charge on ${tx.date}`} onClick={(e) => e.stopPropagation()}>
      {SUGGESTED_TAGS.map((t) => (
        <button key={t} type="button" className={cur === t ? 'is-on' : undefined} aria-pressed={cur === t} onClick={() => void setTags([tx.id], cur === t ? null : t)}>
          {t}
        </button>
      ))}
      <button
        type="button"
        className={custom ? 'is-on' : undefined}
        aria-pressed={custom}
        title={custom ? `Tagged “${cur}”. Click to change it.` : 'Another tag, such as a client or project'}
        onClick={() => {
          setDraft(custom ? cur : '');
          setEditing(true);
        }}
      >
        {custom ? cur : '…'}
      </button>
    </span>
  );
}

/** Shown when charges are selected: tag them all at once, or clear their tags. */
export function SelectionBar({ rows, onClear }: { rows: Transaction[]; onClear: () => void }) {
  const { setTags } = useLedger();
  const [draft, setDraft] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const apply = async (t: string | null) => {
    await setTags(rows.map((r) => r.id), t);
    setMessage(t ? `Tagged ${rows.length} charge${rows.length === 1 ? '' : 's'} as “${t}”.` : `Cleared the tag of ${rows.length} charge${rows.length === 1 ? '' : 's'}.`);
    setDraft('');
  };
  const tag = cleanTag(draft);
  return (
    <div className="selection-bar" role="region" aria-label="Selected charges">
      <span className="sel-count">{rows.length} selected</span>
      {SUGGESTED_TAGS.map((t) => (
        <button key={t} type="button" className="sel-btn" onClick={() => void apply(t)}>
          Tag as {t}
        </button>
      ))}
      <input
        className="sel-input"
        list={TAG_LIST_ID}
        value={draft}
        maxLength={MAX_TAG_LENGTH}
        placeholder="Other tag"
        aria-label="Another tag for the selected charges"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && tag && void apply(tag)}
      />
      {tag && (
        <button type="button" className="sel-btn" onClick={() => void apply(tag)}>
          Apply
        </button>
      )}
      <button type="button" className="sel-ghost" onClick={() => void apply(null)}>
        Clear tags
      </button>
      <span className="sel-msg" role="status">{message}</span>
      <button type="button" className="sel-ghost" onClick={onClear}>
        Clear selection
      </button>
    </div>
  );
}

/** Tags (or clears the tags of) every charge currently shown. */
export function BulkTag({ rows }: { rows: Transaction[] }) {
  const { setTags } = useLedger();
  const [draft, setDraft] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const tag = cleanTag(draft);
  const replaced = rows.filter((r) => r.tag && r.tag !== tag).length;
  const tagged = rows.filter((r) => r.tag).length;

  const apply = async (t: string | null) => {
    await setTags(rows.map((r) => r.id), t);
    setMessage(t ? `Tagged ${rows.length} charge${rows.length === 1 ? '' : 's'} as “${t}”.` : `Removed the tag from ${tagged} charge${tagged === 1 ? '' : 's'}.`);
    setConfirm(null);
  };

  return (
    <div className="bulk-tag">
      <div className="row wrap">
        <span className="meta">Tag the {rows.length} charge{rows.length === 1 ? '' : 's'} shown as</span>
        <Input
          list={TAG_LIST_ID}
          value={draft}
          maxLength={MAX_TAG_LENGTH}
          placeholder="Client: Acme"
          aria-label="Tag to apply to all shown charges"
          onChange={(e) => {
            setDraft(e.target.value);
            setMessage(null);
          }}
          style={{ width: 220 }}
         />
        <Button
          disabled={!tag || rows.length === 0}
          onClick={() => (replaced > 0 ? setConfirm(tag) : void apply(tag))}
        >
          Apply
        </Button>
        {tagged > 0 && (
          <Button variant="text" onClick={() => void apply(null)}>
            Remove tags from these
          </Button>
        )}
      </div>
      {message && <div className="meta" role="status" style={{ marginTop: 8 }}>{message}</div>}
      {confirm && (
        <ConfirmDialog
          title="Replace existing tags?"
          confirmLabel={`Replace ${replaced} tag${replaced === 1 ? '' : 's'}`}
          onCancel={() => setConfirm(null)}
          onConfirm={() => void apply(confirm)}
        >
          <p>
            {replaced} of the {rows.length} charges shown already {replaced === 1 ? 'has' : 'have'} a different tag. Applying “{confirm}” replaces it.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}

/**
 * "New charges from this provider get the tag ...". Applied when charges are imported, to charges
 * that arrive without a tag; charges already stored are not changed. Empty removes the rule.
 */
export function TagRuleInput({ provider, saved }: { provider: string; saved: string }) {
  const { setTagRule } = useLedger();
  const [draft, setDraft] = useState(saved);
  useEffect(() => setDraft(saved), [saved]);
  const commit = () => {
    const t = cleanTag(draft);
    if (t === saved) return setDraft(saved);
    void setTagRule(provider, t || null);
  };
  return (
    <Field
      label="Tag new charges"
      title="Charges imported from now on that arrive without a tag get this one. A tag in the file wins, and charges already stored are not changed."
    >
      <Input
        className="tag-input"
        list={TAG_LIST_ID}
        value={draft}
        placeholder="Business"
        maxLength={MAX_TAG_LENGTH}
        aria-label={`Tag new charges from ${provider} as`}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
    </Field>
  );
}
