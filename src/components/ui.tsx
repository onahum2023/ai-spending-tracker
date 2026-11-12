import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { labelMap, labelOf, tidyDescriptor } from '../lib/labels';
import { formatEUR, formatPct, formatSignedEUR, pctChange } from '../lib/money';
import { typeLabel, overrideMap, overrideOf, WHY } from '../lib/overrides';
import { providerHref } from '../router';
import { useLedger } from '../store';

/**
 * The one card. Every card in the app is this component, so spacing, header and type sizes live in one place (see the
 * "Standard card" tokens in styles.css).
 *
 * - `title`: sentence case. `subtitle`: one line under it; keep it short and put longer explanations in the body.
 * - `badge`: the "Estimate" / "App's read" pill, after the title (the app's one marker for inferred values).
 * - `action`: top right. Use `CardAction` (accent text link with a trailing arrow). A control that is not a link, such as a
 *   segmented toggle, may sit here too.
 */
export function Card({
  title,
  subtitle,
  badge,
  action,
  children,
  className = '',
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`.trim()}>
      {(title || action) && (
        <header className="card-head">
          <div className="card-head-text">
            <div className="card-title-row">
              {title && <h2 className="card-title">{title}</h2>}
              {badge}
            </div>
            {subtitle && (
              <p className="card-sub" title={typeof subtitle === 'string' ? subtitle : undefined}>
                {subtitle}
              </p>
            )}
          </div>
          {action && <div className="card-actions">{action}</div>}
        </header>
      )}
      <div className="card-body">{children}</div>
    </section>
  );
}

/** A card's action: accent text, no underline, trailing arrow. A link when it has an `href`, otherwise a button. */
export function CardAction({ href, onClick, children, ariaLabel }: { href?: string; onClick?: () => void; children: ReactNode; ariaLabel?: string }) {
  const content = (
    <>
      {children}
      <span aria-hidden="true" className="card-action-arrow">→</span>
    </>
  );
  return href !== undefined ? (
    <a className="card-action" href={href} aria-label={ariaLabel}>
      {content}
    </a>
  ) : (
    <button type="button" className="card-action" onClick={onClick} aria-label={ariaLabel}>
      {content}
    </button>
  );
}

/** A short explanation at the top of a card's body: meta text, so the card's subtitle can stay on one line. */
export function CardNote({ children }: { children: ReactNode }) {
  return <p className="meta card-note">{children}</p>;
}

/** A section inside a card: a small label, with a divider above every section but the first. */
export function CardSection({ label, badge, action, children, className = '' }: { label?: ReactNode; badge?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card-section ${className}`.trim()}>
      {(label || badge || action) && (
        <div className="section-head">
          <div className="row" style={{ gap: 8 }}>
            {label && <h3 className="section-label">{label}</h3>}
            {badge}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** One figure in a card: a label, a key figure on the same line, and a meta line under them. */
export function StatRow({ label, value, sub }: { label: ReactNode; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="side-row">
      <div className="side-row-main">
        <span className="side-label">{label}</span>
        <span className="side-value num">{value}</span>
      </div>
      {sub && <div className="side-sub">{sub}</div>}
    </div>
  );
}

/** A stat tile: a card without a title, so its label is a section label, its value a key figure, its note meta text. */
export function Kpi({ label, value, sub }: { label: ReactNode; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="card kpi">
      <div className="section-label">{label}</div>
      <div className="amt-key num">{value}</div>
      {sub && <div className="meta">{sub}</div>}
    </div>
  );
}

/** Spending change: an arrow and a sign in the accent colour, whichever way it goes (never red or green). */
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

/** A change in spending for the side column: the same arrow-and-sign style as `Delta`, always accent. */
export function Change({ before, after, showPct = true }: { before: number; after: number; showPct?: boolean }) {
  const d = after - before;
  const arrow = d > 0 ? '▲' : d < 0 ? '▼' : '';
  const pct = pctChange(before, after);
  return (
    <span className="change num">
      {arrow && <span aria-hidden="true">{arrow} </span>}
      {formatSignedEUR(d)}
      {showPct && pct !== null && <span className="change-pct"> ({formatPct(pct)})</span>}
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
export function StreamName({ provider, merchant, className = 'small secondary merchant-line', labelOnly = false }: { provider: string; merchant: string; className?: string; labelOnly?: boolean }) {
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
    <div className="small secondary" title={WHY[info.source]}>
      {typeLabel(info)} · {confirmed ? 'confirmed by you' : 'suggested'} ·{' '}
      <a href={providerHref(provider)} style={{ textDecoration: 'underline' }}>
        change on the provider page
      </a>
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

/** A text toggle that reveals its children. Closed by default. */
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

export type PillKind = 'neutral' | 'inferred' | 'attention';

/**
 * The only pill. Three kinds: neutral (a fact about state: Stopped, One-time), inferred (the app's read: Estimate, App's guess)
 * and attention (worth a look: Price change, Overlap, Still charging).
 */
export function Pill({ kind = 'neutral', title, children }: { kind?: PillKind; title?: string; children: ReactNode }) {
  return (
    <span className={`pill pill-${kind}`} title={title}>
      {children}
    </span>
  );
}

/** Marks something the app worked out, as opposed to something recorded in the ledger. */
export function ReadChip({ children = 'App’s read' }: { children?: ReactNode }) {
  return (
    <Pill kind="inferred" title="Worked out by the app from your charges. It is not recorded in the ledger.">
      {children}
    </Pill>
  );
}
