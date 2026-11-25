import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { labelMap, labelOf, tidyDescriptor } from '../lib/labels';
import { formatEUR, formatPct, formatSignedEUR, pctChange } from '../lib/money';
import { typeLabel, overrideMap, overrideOf, WHY } from '../lib/overrides';
import { providerHref } from '../router';
import { useLedger } from '../store';
import { vendorLetter, vendorMark } from '../lib/vendorIcons';

export type Tone = 'brand' | 'rise' | 'overlap' | 'saving' | 'amber' | 'teal' | 'ink';
export type IconName =
  | 'repeat' | 'trend' | 'layers' | 'piggy' | 'check' | 'tag' | 'calendar' | 'bell' | 'list' | 'gauge'
  | 'pie' | 'users' | 'stop' | 'file' | 'download' | 'upload' | 'info' | 'chart' | 'compare' | 'lock';

const ICON_PATHS: Record<IconName, ReactNode> = {
  repeat: <><path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="m7 22-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></>,
  trend: <><path d="M22 7 13.5 15.5l-5-5L2 17" /><path d="M16 7h6v6" /></>,
  layers: <><path d="m12 2 10 5-10 5L2 7z" /><path d="m2 12 10 5 10-5" /><path d="m2 17 10 5 10-5" /></>,
  piggy: <><path d="M19 5c-1.5 0-2.8.6-3.7 1.6A7 7 0 0 0 5 11c0 2.2 1 4.2 2.6 5.5V20h3v-2h3v2h3v-3.4A6.9 6.9 0 0 0 19 14h2v-4h-2a7 7 0 0 0-.9-2.1" /><path d="M15.5 11h.01" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
  tag: <><path d="M12 2H2v10l9.3 9.3a1 1 0 0 0 1.4 0l8.6-8.6a1 1 0 0 0 0-1.4z" /><circle cx="7" cy="7" r="1.5" /></>,
  calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></>,
  list: <><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></>,
  gauge: <><path d="m12 14 4-4" /><path d="M3.3 19a10 10 0 1 1 17.4 0" /></>,
  pie: <><path d="M21.2 15.9A10 10 0 1 1 8 2.8" /><path d="M22 12A10 10 0 0 0 12 2v10z" /></>,
  users: <><circle cx="9" cy="8" r="4" /><path d="M2 21c0-4 3-6 7-6s7 2 7 6" /><path d="M16 3.1a4 4 0 0 1 0 7.8M22 21c0-3-1.7-5-4.5-5.8" /></>,
  stop: <><circle cx="12" cy="12" r="9" /><path d="M9 9h6v6H9z" /></>,
  file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8M8 17h5" /></>,
  download: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></>,
  upload: <><path d="M12 15V3" /><path d="m7 8 5-5 5 5" /><path d="M5 21h14" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 16v-5M12 8h.01" /></>,
  chart: <><path d="M3 3v18h18" /><path d="M7 15v2M11 11v6M15 8v9M19 5v12" /></>,
  compare: <><path d="M3 12h4l3-8 4 16 3-8h4" /></>,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
};

/** A line icon on the shared 24px grid. Decorative: always paired with text. */
export function Icon({ name, size = 17 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {ICON_PATHS[name]}
    </svg>
  );
}

export function Card({
  title,
  subtitle,
  actions,
  toolbar,
  icon,
  tone = 'brand',
  children,
  className = '',
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** A small coloured icon beside the title. The tone says what kind of thing the card is about. */
  icon?: IconName;
  tone?: Tone;
  /** A row of filters or search above the body, under the heading. */
  toolbar?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className={`card-head${icon ? ' has-icon' : ''}`}>
          <div>
            {title &&
              (icon ? (
                <div className="card-title">
                  <span className={`card-icon tone-${tone}`}>
                    <Icon name={icon} />
                  </span>
                  <h2>{title}</h2>
                </div>
              ) : (
                <h2>{title}</h2>
              ))}
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
        <div className="stat-value num">{lead && typeof value === 'string' ? <FigureText text={value} /> : value}</div>
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

/** A euro amount set for reading at size: "€" and cents smaller than the whole euros. Other text is left as it is. */
export function FigureText({ text }: { text: string }) {
  const m = text.match(/^([^€\d]*)€([\d,]+)(\.\d+)?(.*)$/);
  if (!m) return <>{text}</>;
  return (
    <>
      {m[1]}
      <span className="fig-cur">€</span>
      {m[2]}
      {m[3] && <span className="fig-cents">{m[3]}</span>}
      {m[4]}
    </>
  );
}

export function Figure({ cents }: { cents: number }) {
  return <span className="num"><FigureText text={formatEUR(cents)} /></span>;
}

/** The provider's mark on a small tile, or its first letter when there is no mark. Decorative: the name is always written next to it. */
export function VendorMark({ provider, size = 'md' }: { provider: string; size?: 'sm' | 'md' | 'lg' }) {
  const svg = vendorMark(provider);
  return svg ? (
    <span className={`vm vm-${size}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />
  ) : (
    <span className={`vm vm-${size} vm-letter`} aria-hidden="true">{vendorLetter(provider)}</span>
  );
}

/** Kept for existing call sites: a provider is shown by its mark. */
export function ProviderDot({ provider, size }: { provider: string; size?: 'sm' | 'md' | 'lg' }) {
  return <VendorMark provider={provider} size={size} />;
}

/** Overlapping tools: their marks overlap. */
export function VendorStack({ providers }: { providers: string[] }) {
  return (
    <span className="vm-stack" aria-hidden="true">
      {providers.slice(0, 4).map((p) => (
        <VendorMark key={p} provider={p} />
      ))}
    </span>
  );
}

/** A price change read like a correction on a statement: the old price struck through, then the new one and how much it moved. */
export function PriceJump({ from, to, showAmounts = true }: { from: number; to: number; showAmounts?: boolean }) {
  const up = to > from;
  const ratio = from > 0 ? to / from : null;
  const pct = pctChange(from, to);
  const label = up ? (ratio !== null && ratio >= 2 ? `×${ratio.toFixed(1)}` : formatPct(pct)) : formatPct(pct);
  return (
    <span className="price-jump num">
      {showAmounts && (
        <>
          <s className={`was ${up ? 'was-up' : 'was-down'}`}>{formatEUR(from)}</s> <strong>{formatEUR(to)}</strong>{' '}
        </>
      )}
      <span className={`chip ${up ? 'chip-over' : 'chip-down'}`} title={`${formatEUR(from)} to ${formatEUR(to)}`}>
        <span aria-hidden="true">{up ? '▲' : '▼'}</span> {label}
        <span className="sr-only">{up ? ' price up' : ' price down'}</span>
      </span>
    </span>
  );
}

export function ProviderLink({ provider }: { provider: string }) {
  return (
    <a className="provider-cell" href={providerHref(provider)} onClick={(e) => e.stopPropagation()}>
      <VendorMark provider={provider} />
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
