import { useEffect, useMemo, useRef } from 'react';
import { monthDrillDown } from '../lib/analytics';
import { dateLabelShort, daysInMonth, monthLabelLong, monthShort } from '../lib/dates';
import { labelMap, labelOf, tidyDescriptor } from '../lib/labels';
import { formatEUR, sumCents } from '../lib/money';
import { typePill, WHY } from '../lib/overrides';
import { href, providerHref } from '../router';
import { useLedger } from '../store';
import { ProviderDot } from './ui';

/**
 * A side sheet with one month's transactions, largest first. Opened from a bar in the monthly chart, its tooltip, or the
 * "vs same point" card (which passes `throughDay` to show only the days that card compares).
 */
export function MonthPanel({
  month,
  throughDay,
  onClose,
  onShowFullMonth,
}: {
  month: string;
  /** Only the first days of the month, as the comparison card counts them. */
  throughDay?: number;
  onClose: () => void;
  onShowFullMonth?: () => void;
}) {
  const { transactions, analysis, labels } = useLedger();
  const names = useMemo(() => labelMap(labels), [labels]);
  const closeRef = useRef<HTMLButtonElement>(null);

  const rows = useMemo(() => monthDrillDown(transactions, month, throughDay), [transactions, month, throughDay]);

  // Esc closes; focus moves in on open and goes back to where it came from on close.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      before?.focus?.();
    };
  }, [onClose]);

  const range = throughDay === undefined ? monthLabelLong(month) : `${monthShort(month)} 1–${throughDay} ${month.slice(0, 4)}`;
  const to = throughDay === undefined ? daysInMonth(month) : throughDay;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <aside className="sheet" role="dialog" aria-modal="true" aria-label={`Transactions in ${range}`} onClick={(e) => e.stopPropagation()}>
        <header className="sheet-head">
          <div>
            <h2>{range}</h2>
            <p>
              {rows.length} transaction{rows.length === 1 ? '' : 's'} · {formatEUR(sumCents(rows))} · largest first
            </p>
          </div>
          <button ref={closeRef} className="btn btn-sm" onClick={onClose} aria-label="Close">Close</button>
        </header>
        <div className="sheet-body">
          {rows.length === 0 ? (
            <div className="empty">No transactions in this period.</div>
          ) : (
            <ul className="sheet-list">
              {rows.map((t) => {
                const info = analysis.typeOf(t);
                const pill = typePill(info);
                const label = labelOf(names, t.provider, t.merchant);
                return (
                  <li key={t.id} className="sheet-row">
                    <span className="sheet-date num muted">{dateLabelShort(t.date)}</span>
                    <span className="sheet-main">
                      <a className="provider-cell" href={providerHref(t.provider)}>
                        <ProviderDot provider={t.provider} />
                        {t.provider}
                      </a>
                      <span className="small muted sheet-desc">
                        {label && <><span className="stream-label">{label}</span> · </>}
                        {tidyDescriptor(t.merchant)}
                      </span>
                      {pill && (
                        <span className={`chip${pill.confirmed ? '' : ' chip-suggested'}`} title={WHY[info.source]}>
                          {pill.text}
                        </span>
                      )}
                    </span>
                    <span className="sheet-amount num">{formatEUR(t.amountCents)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <footer className="sheet-foot">
          <a
            className="btn btn-sm"
            href={href(['transactions'], { from: `${month}-01`, to: `${month}-${String(to).padStart(2, '0')}` })}
            onClick={onClose}
          >
            Open in Transactions →
          </a>
          {throughDay !== undefined && onShowFullMonth && (
            <button className="btn btn-sm btn-ghost" onClick={onShowFullMonth}>Show the full month</button>
          )}
        </footer>
      </aside>
    </div>
  );
}
