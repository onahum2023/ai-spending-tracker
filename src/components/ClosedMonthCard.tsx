import { useMemo } from 'react';
import { monthDrillDown } from '../lib/analytics';
import { COMMITMENT_LABELS, splitByCommitment, type Commitment } from '../lib/commitment';
import { monthLabelLong } from '../lib/dates';
import { formatEUR } from '../lib/money';
import { useLedger } from '../store';
import { Card, ReadChip } from './ui';

const HINTS: Record<Commitment, string> = {
  subscription: 'Charges read as a subscription, confirmed or suggested',
  usage: 'Charges read as pay as you go, confirmed or suggested',
  oneTime: 'Charges you confirmed as One-time / Other. A guess is never counted here',
  unclassified: 'Charges the app only guesses are one-time, or knows nothing about',
};

/**
 * A month that is over: no projection, just how its total divides by commitment type. Each line opens the month's
 * transactions of that type. The split is the app's read of each charge, so it says so.
 */
export function ClosedMonthCard({ month, onOpen }: { month: string; onOpen: (commitment: Commitment) => void }) {
  const { transactions, analysis } = useLedger();
  const rows = useMemo(() => monthDrillDown(transactions, month), [transactions, month]);
  const split = useMemo(() => splitByCommitment(rows, analysis.typeOf), [rows, analysis]);
  // One-time and Unclassified only appear when the month has some.
  const lines = split.lines.filter((l) => l.count > 0 || l.commitment === 'subscription' || l.commitment === 'usage');

  return (
    <Card
      title={`${monthLabelLong(month)}, closed`}
      subtitle={`${rows.length} transaction${rows.length === 1 ? '' : 's'} · by commitment type`}
      actions={<ReadChip />}
    >
      <div className="small secondary">Total for the month</div>
      <div className="kpi-value num" style={{ fontSize: 26 }}>{formatEUR(split.totalCents)}</div>
      <ul className="split-list">
        {lines.map((l) => (
          <li key={l.commitment}>
            <button type="button" className="split-row" onClick={() => onOpen(l.commitment)} disabled={l.count === 0} title={HINTS[l.commitment]}>
              <span className="split-name">
                {COMMITMENT_LABELS[l.commitment]}
                <span className="muted small"> · {l.count} charge{l.count === 1 ? '' : 's'}</span>
              </span>
              <span className="num split-amount">{formatEUR(l.cents)}</span>
              <span className="num muted small split-share">{l.share === null ? '—' : `${Math.round(l.share * 100)}%`}</span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
