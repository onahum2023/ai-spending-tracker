import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { labelMap, labelOf, tidyDescriptor } from '../lib/labels';
import { formatEUR, formatPct, formatSignedEUR, pctChange } from '../lib/money';
import { typeLabel, overrideMap, overrideOf, WHY } from '../lib/overrides';
import { providerHref } from '../router';
import { useLedger } from '../store';

export function Card({
  title,
  subtitle,
  actions,
  toolbar,
  children,
  className = '',
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** A row of filters or search above the body, under the heading. */
  toolbar?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="card-head">
          <div>
            {title && <h2>{title}</h2>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      {toolbar && <div className="card-toolbar">{toolbar}</div>}
      <div className="card-body">{children}</div>
    </section>
  );
}

/** One figure with a label and an optional note. `lead` makes it the largest figure on the page. */
export function Stat({ label, value, sub, delta, lead = false }: { label: ReactNode; value: ReactNode; sub?: ReactNode; delta?: ReactNode; lead?: boolean }) {
  return (
    <div className={`stat${lead ? ' stat-lead' : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-figure">
        <div className="stat-value num">{value}</div>
        {delta}
      </div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

/** A small "is it up or down" marker to put beside a figure (`delta` on Stat). Percent only; the amount goes in the tooltip. */
export function DeltaChip({ before, after }: { before: number; after: number }) {
  const pct = pctChange(before, after);
  if (pct === null) return null;
  const d = after - before;
  const tone = d > 0 ? 'up' : d < 0 ? 'down' : 'flat';
  return (
    <span className={`delta-chip ${tone} num`} title={`${formatSignedEUR(d)} (${formatEUR(before)} before)`}>
      {d !== 0 && <span aria-hidden="true">{d > 0 ? '▲' : '▼'}</span>}
      {formatPct(pct)}
      <span className="sr-only">{d > 0 ? ' more spending' : d < 0 ? ' less spending' : ''}</span>
    </span>
  );
}

/** The summary row under a page title: one card, a few figures, the first one leading. */
export function StatStrip({ children }: { children: ReactNode }) {
  return <section className="card stat-strip">{children}</section>;
}

/** Several stats side by side inside a card. */
export function StatGrid({ children, columns = 3 }: { children: ReactNode; columns?: number }) {
  return (
    <div className="stat-grid" style={{ ['--cols' as string]: columns }}>
      {children}
    </div>
  );
}

export type NoticeTone = 'info' | 'warn' | 'error' | 'ok';

/** A message about the page or the data. Warn means the numbers depend on something you can still fix. */
export function Notice({
  tone = 'info',
  actions,
  children,
  className = '',
  role,
}: {
  tone?: NoticeTone;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  role?: 'status' | 'alert';
}) {
  return (
    <div className={`notice notice-${tone}${actions ? ' notice-with-actions' : ''} ${className}`.trim()} role={role ?? (tone === 'error' ? 'alert' : undefined)}>
      <span>{children}</span>
      {actions && <span className="notice-actions">{actions}</span>}
    </div>
  );
}

export function Chevron({ open }: { open: boolean }) {
  return (
    <svg className={`chevron${open ? ' open' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

/** A text toggle that reveals an explanation. Closed by default. The one way to tuck "how is this worked out" away. */
export function Disclosure({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div>
      <button type="button" className="disclosure-btn" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <Chevron open={open} />
        {label}
      </button>
      <div id={id} hidden={!open} className="disclosure-body">
        {children}
      </div>
    </div>
  );
}

/** Search, filters and toggles for a card. Put it in a card's `actions`, or as the first row of the card body. */
export function Toolbar({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`toolbar ${className}`.trim()}>{children}</div>;
}

/** Rows of "name, detail, amount". Use a table instead only when the columns need sorting. */
export function List({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={className}>{children}</div>;
}

export function ListRow({
  lead,
  title,
  meta,
  value,
  total = false,
}: {
  lead?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  value?: ReactNode;
  total?: boolean;
}) {
  return (
    <div className={`list-row${total ? ' is-total' : ''}`}>
      {lead !== undefined && <div className="list-lead num">{lead}</div>}
      <div className="list-main">
        <div>{title}</div>
        {meta && <div className="list-meta">{meta}</div>}
      </div>
      {value !== undefined && <div className="list-value num">{value}</div>}
    </div>
  );
}

/** Spending change. Up = more spending, shown in red; down in blue. Arrow + sign, never colour alone. */
export function Delta({ before, after, showPct = true }: { before: number; after: number; showPct?: boolean }) {
  const d = after - before;
  const cls = d > 0 ? 'delta-up' : d < 0 ? 'delta-down' : 'delta-flat';
  const arrow = d > 0 ? '▲' : d < 0 ? '▼' : '';
  const pct = pctChange(before, after);
  return (
    <span className={`${cls} num`}>
      {arrow && <span aria-hidden="true">{arrow} </span>}
      {formatSignedEUR(d)}
      {showPct && pct !== null && <span> ({formatPct(pct)})</span>}
    </span>
  );
}

export function ProviderDot({ provider }: { provider: string }) {
  const { colors } = useLedger();
  return <span className="dot" style={{ background: colors.color(provider) }} aria-hidden="true" />;
}

export function ProviderLink({ provider }: { provider: string }) {
  return (
    <a className="provider-cell" href={providerHref(provider)} onClick={(e) => e.stopPropagation()}>
      <ProviderDot provider={provider} />
      <span>{provider}</span>
    </a>
  );
}

export function Money({ cents }: { cents: number }) {
  return <span className="num">{formatEUR(cents)}</span>;
}

export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="search">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        className="input"
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export type SortDir = 'asc' | 'desc';

export function SortHeader<K extends string>({
  label,
  k,
  sort,
  onSort,
  className,
  defaultDir = 'desc',
}: {
  label: string;
  k: K;
  sort: { key: K; dir: SortDir };
  onSort: (s: { key: K; dir: SortDir }) => void;
  className?: string;
  defaultDir?: SortDir;
}) {
  const active = sort.key === k;
  return (
    <th className={className} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        className="sort-btn"
        onClick={() => onSort({ key: k, dir: active ? (sort.dir === 'asc' ? 'desc' : 'asc') : defaultDir })}
      >
        {label}
        <span className="sort-ind">{active ? (sort.dir === 'asc' ? '▲' : '▼') : ''}</span>
      </button>
    </th>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  requireText,
  onConfirm,
  onCancel,
  busy,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  requireText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const [typed, setTyped] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  const ok = !requireText || typed === requireText;
  return (
    <div className="overlay" onClick={onCancel}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {children}
        {requireText && (
          <label className="stack" style={{ gap: 6 }}>
            <span className="small secondary">
              Type <strong>{requireText}</strong> to confirm
            </span>
            <input ref={inputRef} className="input" value={typed} onChange={(e) => setTyped(e.target.value)} />
          </label>
        )}
        <div className="dialog-actions">
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-danger-solid" disabled={!ok || busy} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

/**
 * The name of a stream (provider + merchant descriptor): your label if you gave it one,
 * otherwise the descriptor. The descriptor stays available on hover.
 * `labelOnly` shows nothing when there is no label (for places that never showed the descriptor).
 */
export function StreamName({ provider, merchant, className = 'small muted merchant-line', labelOnly = false }: { provider: string; merchant: string; className?: string; labelOnly?: boolean }) {
  const { labels } = useLedger();
  const label = labelOf(labelMap(labels), provider, merchant);
  if (!label && labelOnly) return null;
  return label ? (
    <div className={className.replace('merchant-line', '').trim() + ' stream-label'} title={`Descriptor: ${tidyDescriptor(merchant)}`}>
      {label}
    </div>
  ) : (
    <div className={className}>{tidyDescriptor(merchant)}</div>
  );
}

/**
 * The type of a charge type, as text: what it is read as, and whether you confirmed it. Read-only: the Provider page is the one
 * place to change it, so this links there.
 */
export function TypeNote({ provider, merchant }: { provider: string; merchant: string }) {
  const { analysis, overrides } = useLedger();
  const info = analysis.streamInfo(provider, merchant);
  if (!info) return null;
  const confirmed = overrideOf(overrideMap(overrides), { provider, merchant }) !== undefined;
  return (
    <div className="small muted" title={WHY[info.source]}>
      {typeLabel(info)} · {confirmed ? 'confirmed by you' : 'suggested'} ·{' '}
      <a href={providerHref(provider)} style={{ textDecoration: 'underline' }}>
        change on the provider page
      </a>
    </div>
  );
}
