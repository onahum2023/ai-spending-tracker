import { useEffect, useMemo, useState } from 'react';
import { MAX_TAG_LENGTH } from '../lib/csv';
import { cleanTag, SUGGESTED_TAGS, tagsInUse } from '../lib/tags';
import type { Transaction } from '../lib/types';
import { useLedger } from '../store';
import { ConfirmDialog } from './ui';

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

/** Edits one charge's tag in place. Saves when the field loses focus or Enter is pressed. */
export function TagInput({ tx }: { tx: Transaction }) {
  const { setTags } = useLedger();
  const [draft, setDraft] = useState(tx.tag ?? '');
  useEffect(() => setDraft(tx.tag ?? ''), [tx.tag]);
  const commit = () => {
    const t = cleanTag(draft);
    if (t === (tx.tag ?? '')) return setDraft(tx.tag ?? '');
    void setTags([tx.id], t || null);
  };
  return (
    <input
      className="input input-sm tag-input"
      list={TAG_LIST_ID}
      value={draft}
      placeholder="Add tag"
      maxLength={MAX_TAG_LENGTH}
      aria-label={`Tag for ${tx.provider} charge on ${tx.date}`}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      onClick={(e) => e.stopPropagation()}
    />
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
        <span className="small secondary">Tag the {rows.length} charge{rows.length === 1 ? '' : 's'} shown as</span>
        <input
          className="input input-sm"
          list={TAG_LIST_ID}
          value={draft}
          maxLength={MAX_TAG_LENGTH}
          placeholder="e.g. Business or Client: Acme"
          aria-label="Tag to apply to all shown charges"
          onChange={(e) => {
            setDraft(e.target.value);
            setMessage(null);
          }}
          style={{ width: 220 }}
        />
        <button
          className="btn btn-sm"
          disabled={!tag || rows.length === 0}
          onClick={() => (replaced > 0 ? setConfirm(tag) : void apply(tag))}
        >
          Apply
        </button>
        {tagged > 0 && (
          <button className="btn btn-sm btn-ghost" onClick={() => void apply(null)}>
            Remove tags from these
          </button>
        )}
      </div>
      {message && <div className="small secondary" role="status" style={{ marginTop: 6 }}>{message}</div>}
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
