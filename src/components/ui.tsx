import { useEffect, useId, useRef, useState, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ComponentProps, type ReactNode } from 'react';
import { labelMap, labelOf, tidyDescriptor } from '../lib/labels';
import { formatEUR, formatPct, formatSignedEUR, pctChange } from '../lib/money';
import { typeLabel, overrideMap, overrideOf, WHY } from '../lib/overrides';
import { providerHref } from '../router';
import { useLedger } from '../store';
import { avatarColors, providerInitials } from './avatar';
import { vendorMark } from '../lib/vendorIcons';

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(' ');

/**
 * The one card. Every card in the app is this component, so spacing, header and type sizes live in one place (see the
 * "Standard card" tokens in styles.css).
 *
 * - `title`: sentence case. `subtitle`: one line under it; keep it short and put longer explanations in the body.
 * - `badge`: the "Estimate" / "App's read" pill, after the title (the app's one marker for inferred values).
 * - `action`: top right. Use `CardAction` (accent text link with a trailing arrow). A control that is not a link, such as a
 *   segmented toggle, may sit here too.
 */
export type Tone = 'accent' | 'rise' | 'saving' | 'overlap' | 'amber' | 'teal' | 'ink';
export type IconName =
  | 'repeat' | 'trend' | 'layers' | 'piggy' | 'check' | 'tag' | 'calendar' | 'list' | 'gauge' | 'pie' | 'users'
  | 'stop' | 'file' | 'download' | 'upload' | 'info' | 'chart' | 'compare' | 'lock' | 'bolt'
  | 'browser' | 'disk' | 'server' | 'user' | 'cloud' | 'code';

const ICON_PATHS: Record<IconName, ReactNode> = {
  repeat: <><path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="m7 22-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></>,
  trend: <><path d="M22 7 13.5 15.5l-5-5L2 17" /><path d="M16 7h6v6" /></>,
  layers: <><path d="m12 2 10 5-10 5L2 7z" /><path d="m2 12 10 5 10-5" /><path d="m2 17 10 5 10-5" /></>,
  piggy: <><path d="M19 5c-1.5 0-2.8.6-3.7 1.6A7 7 0 0 0 5 11c0 2.2 1 4.2 2.6 5.5V20h3v-2h3v2h3v-3.4A6.9 6.9 0 0 0 19 14h2v-4h-2a7 7 0 0 0-.9-2.1" /><path d="M15.5 11h.01" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
  tag: <><path d="M12 2H2v10l9.3 9.3a1 1 0 0 0 1.4 0l8.6-8.6a1 1 0 0 0 0-1.4z" /><circle cx="7" cy="7" r="1.5" /></>,
  calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
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
  bolt: <><path d="M13 2 3 14h9l-1 8 10-12h-9z" /></>,
  browser: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M2 9h20" /><path d="M6 6.5h.01M9 6.5h.01" /></>,
  disk: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></>,
  server: <><rect x="3" y="3" width="18" height="7" rx="2" /><rect x="3" y="14" width="18" height="7" rx="2" /><path d="M2 2l20 20" /></>,
  user: <><circle cx="9" cy="8" r="4" /><path d="M2 21c0-4 3-6 7-6s7 2 7 6" /><path d="m17 8 5 5M22 8l-5 5" /></>,
  cloud: <><path d="m2 2 20 20" /><path d="M5.8 8.3A5.5 5.5 0 0 0 7 19h10.5a3.5 3.5 0 0 0 2.3-.9" /><path d="M21 15.4A3.5 3.5 0 0 0 17.5 11h-1A6.5 6.5 0 0 0 9.7 5.3" /></>,
  code: <><path d="m16 18 6-6-6-6" /><path d="m8 6-6 6 6 6" /></>,
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
  badge,
  action,
  icon,
  tone = 'accent',
  children,
  className = '',
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  action?: ReactNode;
  /** A small coloured icon beside the title. The tone is the colour of what the card is about (see tokens.css). */
  icon?: IconName;
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`.trim()}>
      {(title || action) && (
        <header className={cx('card-head', icon && 'has-icon')}>
          {icon && (
            <span className={`card-icon tone-${tone}`}>
              <Icon name={icon} />
            </span>
          )}
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

/** A card's action: a text action with a trailing arrow. A link when it has an `href`, otherwise a button. Header only. */
export function CardAction({ href, onClick, children, ariaLabel }: { href?: string; onClick?: () => void; children: ReactNode; ariaLabel?: string }) {
  return href !== undefined ? (
    <Button variant="text" arrow href={href} aria-label={ariaLabel}>
      {children}
    </Button>
  ) : (
    <Button variant="text" arrow onClick={onClick} aria-label={ariaLabel}>
      {children}
    </Button>
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

/**
 * A stat tile, for compact grids of figures: a 12px label, the 22px value and a meta line. On its own it is a bordered box; inside
 * a card it has no box, and the card draws the dividers between tiles.
 */
export function StatTile({ label, value, meta }: { label: ReactNode; value: ReactNode; meta?: ReactNode }) {
  return (
    <div className="stat-tile">
      <div className="section-label">{label}</div>
      <div className="amt-key num">{value}</div>
      {meta && <div className="meta">{meta}</div>}
    </div>
  );
}

/**
 * A change in spending: an arrow and a sign, in rise colour when spending goes up and saving colour when it goes down. The arrow
 * says it too, so colour is never the only cue. A flat change has no arrow and is secondary text. `direction` is for a caller that
 * has its own rule for "flat" (the Providers trend).
 */
export function ChangeArrow({ direction, children, title }: { direction: 'up' | 'down' | 'flat'; children: ReactNode; title?: string }) {
  return (
    <span className={cx('change num', `change-${direction}`)} title={title}>
      {direction !== 'flat' && <span aria-hidden="true">{direction === 'up' ? '▲' : '▼'} </span>}
      {children}
    </span>
  );
}

/** The change between two amounts, as a signed euro figure and (optionally) a percentage. */
export function Change({ before, after, showPct = true }: { before: number; after: number; showPct?: boolean }) {
  const d = after - before;
  const pct = pctChange(before, after);
  return (
    <ChangeArrow direction={d > 0 ? 'up' : d < 0 ? 'down' : 'flat'}>
      {formatSignedEUR(d)}
      {showPct && pct !== null && <span className="change-pct"> ({formatPct(pct)})</span>}
    </ChangeArrow>
  );
}

/** A square swatch in a series' colour: the key of a chart or a bar. It marks a series, not a provider; rows name providers with `ProviderAvatar`. */
export function SeriesDot({ provider }: { provider: string }) {
  const { colors } = useLedger();
  return <span className="dot" style={{ background: colors.color(provider) }} aria-hidden="true" />;
}

/**
 * A provider's avatar: a circle with its one or two initials in a dark shade of the provider's colour (the colour the charts use)
 * on a light tint of it, like the pills. "Other providers" and any provider without a colour of its own are grey. The contrast is
 * checked for every palette colour in avatar.test.ts.
 */
export function ProviderAvatar({ provider, size = 24, text }: { provider: string; size?: number; /** Replaces the initials, for a group such as "+5". */ text?: string }) {
  const { colors, scheme } = useLedger();
  // The vendor's own mark when the app ships one (bundled, never fetched); otherwise its initials.
  const mark = text === undefined ? vendorMark(provider) : null;
  if (mark) {
    return <span className="avatar avatar-mark" style={{ width: size, height: size }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: mark }} />;
  }
  return (
    <span className="avatar" style={{ ...avatarColors(colors.color(provider), scheme), width: size, height: size, fontSize: Math.round(size * 0.42) }} aria-hidden="true">
      {text ?? providerInitials(provider)}
    </span>
  );
}

/**
 * A plain round dot in the provider's colour, for stacking: where avatars overlap, their initials would be cut off. Give the
 * stack a ring colour (`--ring`) and the dots keep apart.
 */
export function StackDot({ provider, size = 16 }: { provider: string; size?: number }) {
  const { colors } = useLedger();
  const mark = vendorMark(provider);
  if (mark) return <span className="stack-dot stack-mark" style={{ width: size + 4, height: size + 4 }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: mark }} />;
  return <span className="stack-dot" style={{ background: colors.color(provider), width: size, height: size }} aria-hidden="true" />;
}

export function ProviderLink({ provider }: { provider: string }) {
  return (
    <a className="provider-cell" href={providerHref(provider)} onClick={(e) => e.stopPropagation()}>
      <ProviderAvatar provider={provider} size={20} />
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
  label,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  /** What it searches, for screen readers. */
  label: string;
  /** A real example of what to type, in muted text. */
  placeholder: string;
}) {
  return (
    <div className="search">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <Input type="search" value={value} placeholder={placeholder} aria-label={label} onChange={(e) => onChange(e.target.value)} />
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

export type ButtonVariant = 'primary' | 'secondary' | 'text' | 'danger';

type ButtonOwn = {
  /** primary: accent fill, at most one per view. secondary (default): outline. text: accent text, no box, no underline. danger: for destructive actions. */
  variant?: ButtonVariant;
  /** A trailing arrow, for a text action that goes somewhere. */
  arrow?: boolean;
  /** A square, icon-only button (give it an aria-label). */
  icon?: boolean;
  /** A taller button (44px) for the one call to action of a landing page. Everywhere else buttons are 32px. */
  large?: boolean;
  className?: string;
  children?: ReactNode;
};
type ButtonProps =
  | (ButtonOwn & { href: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof ButtonOwn>)
  | (ButtonOwn & { href?: undefined } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof ButtonOwn>);

/** The one button. 32px high, 8px radius, 13px medium. Renders a link when it has an `href`. */
export function Button(props: ButtonProps) {
  const { variant = 'secondary', arrow = false, icon = false, large = false, className, children, ...rest } = props;
  const cls = cx('btn', variant !== 'secondary' && `btn-${variant}`, icon && 'btn-icon', large && 'btn-large', className);
  const content = (
    <>
      {children}
      {arrow && <span aria-hidden="true" className="btn-arrow">→</span>}
    </>
  );
  if (props.href !== undefined) {
    const { href, ...anchor } = rest as AnchorHTMLAttributes<HTMLAnchorElement>;
    return (
      <a className={cls} href={href} {...anchor}>
        {content}
      </a>
    );
  }
  const button = rest as ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button type="button" className={cls} {...button}>
      {content}
    </button>
  );
}

/** The one text input: 32px high, 8px radius, 1px border, 14px text. The placeholder is a real example, never "e.g.". */
export function Input({ className, ...rest }: ComponentProps<'input'>) {
  return <input className={cx('input', className)} {...rest} />;
}

/** The one select, the same size as `Input`. */
export function Select({ className, children, ...rest }: ComponentProps<'select'>) {
  return (
    <select className={cx('select', className)} {...rest}>
      {children}
    </select>
  );
}

/** A label (13px, secondary) over a control. */
export function Field({ label, title, className, inline = false, children }: { label: ReactNode; title?: string; className?: string; inline?: boolean; children: ReactNode }) {
  return (
    <label className={cx('field', inline && 'field-inline', className)} title={title}>
      {label}
      {children}
    </label>
  );
}

/**
 * The one table. Header: 12px semibold secondary, no background, 1px dividers. Rows: 44px at least, 14px text. Numbers sit in cells
 * with `className="amount"` (right-aligned) and text in plain cells (left). `className` goes on the scrolling wrapper;
 * `scrollHeight` turns the wrapper into a bordered box that scrolls past that height (a long list inside a card).
 */
export function Table({ className, tableClassName, scrollHeight, children }: { className?: string; tableClassName?: string; scrollHeight?: number; children: ReactNode }) {
  return (
    <div className={cx('table-wrap', scrollHeight !== undefined && 'table-scroll', className)} style={scrollHeight !== undefined ? { maxHeight: scrollHeight } : undefined}>
      <table className={cx('table', tableClassName)}>{children}</table>
    </div>
  );
}

/** A raw statement descriptor: monospace, so it reads as the bank wrote it. Labels the user chose use the body font. */
export function Descriptor({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('descriptor', className)}>{children}</span>;
}

/** The chevron at the left of an expandable row. */
export function RowToggle({ open, onClick, panelId, label }: { open: boolean; onClick: () => void; panelId: string; label: string }) {
  return (
    <button type="button" className="row-toggle" aria-expanded={open} aria-controls={panelId} aria-label={label} onClick={onClick}>
      <Chevron open={open} />
    </button>
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
          <Field label={<>Type <strong>{requireText}</strong> to confirm</>}>
            <Input ref={inputRef} value={typed} onChange={(e) => setTyped(e.target.value)} />
          </Field>
        )}
        <div className="dialog-actions">
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="danger" disabled={!ok || busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
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
export function StreamName({ provider, merchant, className = 'meta', labelOnly = false }: { provider: string; merchant: string; className?: string; labelOnly?: boolean }) {
  const { labels } = useLedger();
  const label = labelOf(labelMap(labels), provider, merchant);
  if (!label && labelOnly) return null;
  return label ? (
    <div className={className + ' stream-label'} title={`Descriptor: ${tidyDescriptor(merchant)}`}>
      {label}
    </div>
  ) : (
    <div className={className}>
      <Descriptor>{tidyDescriptor(merchant)}</Descriptor>
    </div>
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
    <div className="meta" title={WHY[info.source]}>
      {typeLabel(info)} · {confirmed ? 'confirmed by you' : 'suggested'} ·{' '}
      <Button variant="text" href={providerHref(provider)}>
        change on the provider page
      </Button>
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

export type PillKind = 'neutral' | 'inferred' | 'attention' | 'rise' | 'saving' | 'overlap';

/**
 * The only pill. Neutral is a fact about state (Stopped, One-time); inferred is the app's read (Estimate, App's guess), amber with a
 * dashed outline; rise and saving are a price going up or down; overlap is tools paid for twice; attention is worth a look (Still
 * charging). Rise, saving and overlap carry a glyph as well as a colour.
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
