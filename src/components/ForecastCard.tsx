import { useMemo } from 'react';
import { dateLabel, dateLabelShort, monthLabel, monthLabelLong, ordinal } from '../lib/dates';
import { forecastCurrentMonth, LOOKBACK_MONTHS } from '../lib/forecast';
import { formatEUR } from '../lib/money';
import { useLedger } from '../store';
import { Card, Disclosure, ProviderLink, ReadChip } from './ui';

export function ForecastCard() {
  const { transactions, today, span, analysis } = useLedger();
  const f = useMemo(() => forecastCurrentMonth(transactions, today, undefined, analysis.patterns), [transactions, today, analysis]);

  if (f.status === 'insufficient') {
    return (
      <Card title={`${monthLabelLong(f.month)} estimate`} subtitle="Month-end projection" actions={<ReadChip>Estimate</ReadChip>}>
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

  const scale = Math.max(f.highCents, f.projectedCents, 1);
  const pct = (c: number) => `${(c / scale) * 100}%`;
  const lastRecorded = span?.lastDate;
  const dayAfter = f.asOfDay + 1;

  return (
    <Card
      title={`${monthLabelLong(f.month)} estimate`}
      subtitle={`As of ${dateLabel(f.asOf)} · day ${f.asOfDay} of ${f.daysInMonth}`}
      actions={<ReadChip>Estimate</ReadChip>}
    >
      <div className="small secondary">Projected month-end total</div>
      <div className="row" style={{ alignItems: 'baseline', gap: 10 }}>
        <span className="kpi-value num" style={{ fontSize: 26 }}>≈ {formatEUR(f.projectedCents)}</span>
        <span className="small muted num">
          likely {formatEUR(f.lowCents)} – {formatEUR(f.highCents)}
        </span>
      </div>

      <div className="forecast-bar" role="img" aria-label={`Recorded ${formatEUR(f.actualCents)}, estimated additional ${formatEUR(f.estimatedAdditionalCents)}`}>
        <div className="forecast-actual" style={{ width: pct(f.actualCents) }} />
        <div className="forecast-est" style={{ left: pct(f.actualCents), width: pct(f.estimatedAdditionalCents) }} />
        {f.highCents > f.lowCents && (
          <div className="forecast-range" style={{ left: pct(f.lowCents), width: `calc(${pct(f.highCents - f.lowCents)})` }} title="Likely range" />
        )}
      </div>

      <div className="forecast-figs">
        <div>
          <div className="label"><span className="swatch-solid" />Recorded</div>
          <div className="value num">{formatEUR(f.actualCents)}</div>
        </div>
        <div>
          <div className="label"><span className="swatch-hatch" />Estimated additional</div>
          <div className="value num">+{formatEUR(f.estimatedAdditionalCents)}</div>
        </div>
        <div>
          <div className="label">Projected total</div>
          <div className="value num">{formatEUR(f.projectedCents)}</div>
        </div>
      </div>

      {f.upcoming.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="small secondary" style={{ marginBottom: 6 }}>Usually charged later in the month</div>
          <div className="stack" style={{ gap: 4 }}>
            {f.upcoming.map((p) => (
              <div key={p.provider + p.firstDate} className="row-between small">
                <ProviderLink provider={p.provider} />
                <span className="muted num">
                  ~{formatEUR(p.typicalCents)} around {dateLabelShort(p.nextExpected)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="explain" style={{ marginTop: 12 }}>
        <Disclosure label="How is this estimated?">
        <ol>
          <li>
            <strong>Recorded</strong> is the sum of every transaction dated in {monthLabel(f.month)} so far
            {lastRecorded ? ` (latest: ${dateLabel(lastRecorded)})` : ''}.
          </li>
          <li>
            For each of the previous {LOOKBACK_MONTHS} months, we add up what you spent from the {ordinal(dayAfter)} to the end of that month:
            <ul>
              {f.samples.map((s) => (
                <li key={s.month} className="num">
                  {monthLabel(s.month)}: {formatEUR(s.remainingCents)} <span className="muted">(of {formatEUR(s.fullMonthCents)} that month)</span>
                </li>
              ))}
            </ul>
          </li>
          <li>
            <strong>Estimated additional</strong> is the middle of those three amounts ({formatEUR(f.estimatedAdditionalCents)}).
            The likely range uses the lowest and highest.
          </li>
          <li><strong>Projected total</strong> = recorded + estimated additional.</li>
        </ol>
        <p className="muted">
          It's a simple pattern-based estimate, not a prediction of specific charges. One-off purchases,
          plan changes, or transactions not yet imported will move the real number.
          {f.asOfDay >= f.daysInMonth ? ' The month is over, so nothing is added.' : ''}
        </p>
        </Disclosure>
      </div>
    </Card>
  );
}
