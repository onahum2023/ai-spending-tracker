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
    <Input
      className="tag-input"
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
