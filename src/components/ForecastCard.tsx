import { useMemo } from 'react';
import { href } from '../router';
import { dateLabel, dateLabelShort, monthLabel, monthLabelLong } from '../lib/dates';
import { forecastCurrentMonth, STALE_AFTER_DAYS } from '../lib/forecast';
import { formatEUR } from '../lib/money';
import { useLedger } from '../store';
import { Card, Disclosure, ProviderLink, ReadChip, StreamName } from './ui';

/**
 * The month so far, and a floor for the month: what is recorded plus the recurring charges that are still due and trusted.
 * Usage is shown on its own line and never projected. It is the app's read, so it is marked and explained.
 */
export function ForecastCard() {
  const { transactions, today, span, analysis } = useLedger();
  const f = useMemo(
    () => forecastCurrentMonth(transactions, today, undefined, analysis.expected, analysis.typeOf),
    [transactions, today, analysis],
  );

  if (f.status === 'insufficient') {
    return (
      <Card title={`${monthLabelLong(f.month)} so far`} subtitle="Month-end estimate" actions={<ReadChip>Estimate</ReadChip>}>
        <div className="stack" style={{ gap: 10 }}>
          <div>
            <div className="small muted">Recorded so far</div>
            <div className="kpi-value num">{formatEUR(f.actualCents)}</div>
          </div>
          <div className="notice notice-warn">No estimate: {f.reason}</div>
        </div>
      </Card>
    );
  }

  const scale = Math.max(f.atLeastCents, 1);
  const pct = (c: number) => `${(c / scale) * 100}%`;
  const lastRecorded = span?.lastDate;

  return (
    <Card
      title={`${monthLabelLong(f.month)} so far`}
      subtitle={f.dataEnd === f.asOf ? `As of ${dateLabel(f.asOf)} · day ${f.asOfDay} of ${f.daysInMonth}` : `As of last import, ${dateLabel(f.dataEnd)}`}
      actions={<ReadChip>Estimate</ReadChip>}
    >
      <div className="small secondary">Month-end total</div>
      <div className="row" style={{ alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span className="kpi-value num" style={{ fontSize: 26 }}>At least {formatEUR(f.atLeastCents)}</span>
      </div>

      <div className="forecast-bar" role="img" aria-label={`Recorded ${formatEUR(f.actualCents)}, still to come ${formatEUR(f.stillToComeCents)}`}>
        <div className="forecast-actual" style={{ width: pct(f.actualCents) }} />
        <div className="forecast-est" style={{ left: pct(f.actualCents), width: pct(f.stillToComeCents) }} />
      </div>

      <div className="forecast-figs">
        <div>
          <div className="label"><span className="swatch-solid" />Recorded so far</div>
          <div className="value num">{formatEUR(f.actualCents)}</div>
        </div>
        <div>
          <div className="label"><span className="swatch-hatch" />Still to come</div>
          <div className="value num">+{formatEUR(f.stillToComeCents)}</div>
        </div>
        <div>
          <div className="label">At least</div>
          <div className="value num">{formatEUR(f.atLeastCents)}</div>
        </div>
      </div>

      {f.expected.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="small secondary" style={{ marginBottom: 6 }}>Recurring charges still due this month</div>
          <div className="stack" style={{ gap: 4 }}>
            {f.expected.map((e) => (
              <div key={`${e.provider}|${e.merchant}|${e.date}`} className="row-between small">
                <span>
                  <ProviderLink provider={e.provider} />
                  <StreamName provider={e.provider} merchant={e.merchant} labelOnly />
                </span>
                <span className="muted num" title={e.confirmed ? 'You confirmed this subscription' : 'Found by the pattern rule: monthly for 3+ months, last charged last month'}>
                  {formatEUR(e.cents)} around {dateLabelShort(e.date)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {f.usageSoFarCents !== null && (
        <p className="small" style={{ margin: '14px 0 0' }}>
          <span className="secondary">Usage so far this month</span> <strong className="num">{formatEUR(f.usageSoFarCents)}</strong>
          <span className="muted"> · not projected, not in the total above</span>
        </p>
      )}

      {f.dataOld && (
        <p className="small muted" style={{ margin: '10px 0 0' }}>
          Your data ends {dateLabelShort(f.dataEnd)}.{' '}
          <a href={href(['data'])} style={{ textDecoration: 'underline' }}>Import newer statements</a> for a better estimate.
        </p>
      )}

      <div className="explain" style={{ marginTop: 12 }}>
        <Disclosure label="How is this estimated?">
          <ol>
            <li>
              <strong>Recorded so far</strong> is the sum of every transaction dated in {monthLabel(f.month)} so far
              {lastRecorded ? ` (latest: ${dateLabel(lastRecorded)})` : ''}. It is the ledger, unchanged.
            </li>
            <li>
              <strong>Still to come</strong> adds only recurring charges that are still due later this month and that the app has strong
              reason to expect: a subscription you confirmed on its provider's page, or one found by the pattern rule (the same provider on
              a similar day and amount for 3+ months in a row) whose latest charge was last month. Each counts at that charge type's last
              actual charge, not an average. "Due later" is counted from the latest recorded charge, not from today: a charge that falls after
              the data ends has not been seen yet, even if its usual day has passed.
            </li>
            <li><strong>At least</strong> = recorded + still to come. The month can cost more; it should not cost less.</li>
            <li>
              <strong>Usage</strong> is pay-as-you-go, so it is not projected: the line shows what has been spent so far. <strong>One-time</strong>{' '}
              charges never feed the estimate.
            </li>
          </ol>
          <p className="muted">
            Nothing is shown when the latest recorded transaction is more than {STALE_AFTER_DAYS} days old.
            {f.asOfDay >= f.daysInMonth ? ' The month is over, so nothing is added.' : ''}
          </p>
        </Disclosure>
      </div>
    </Card>
  );
}
