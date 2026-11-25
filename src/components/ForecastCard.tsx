import { useMemo } from 'react';
import { dateLabel, dateLabelShort, monthLabel, monthLabelLong, ordinal } from '../lib/dates';
import { forecastCurrentMonth, LOOKBACK_MONTHS } from '../lib/forecast';
import { formatEUR } from '../lib/money';
import { useLedger } from '../store';
import { Card, Disclosure, List, ListRow, Notice, ProviderLink, Stat, StatGrid } from './ui';

export function ForecastCard() {
  const { transactions, today, span, analysis } = useLedger();
  const f = useMemo(() => forecastCurrentMonth(transactions, today, undefined, analysis.patterns), [transactions, today, analysis]);

  if (f.status === 'insufficient') {
    return (
      <Card title={`${monthLabelLong(f.month)} estimate`} subtitle="Month-end projection">
        <div className="stack gap-3">
          <Stat label="Recorded so far" value={formatEUR(f.actualCents)} />
          <Notice tone="warn">No estimate: {f.reason}</Notice>
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
    >
      <Stat lead label="Projected month-end total" value={`≈ ${formatEUR(f.projectedCents)}`} sub={`likely ${formatEUR(f.lowCents)} to ${formatEUR(f.highCents)}`} />

      <div className="forecast-bar" role="img" aria-label={`Recorded ${formatEUR(f.actualCents)}, estimated additional ${formatEUR(f.estimatedAdditionalCents)}`}>
        <div className="forecast-actual" style={{ width: pct(f.actualCents) }} />
        <div className="forecast-est" style={{ left: pct(f.actualCents), width: pct(f.estimatedAdditionalCents) }} />
        {f.highCents > f.lowCents && (
          <div className="forecast-range" style={{ left: pct(f.lowCents), width: `calc(${pct(f.highCents - f.lowCents)})` }} title="Likely range" />
        )}
      </div>

      <StatGrid columns={2}>
        <Stat label={<><span className="swatch-solid" />Recorded</>} value={formatEUR(f.actualCents)} />
        <Stat label={<><span className="swatch-hatch" />Estimated additional</>} value={`+${formatEUR(f.estimatedAdditionalCents)}`} />
      </StatGrid>

      {f.upcoming.length > 0 && (
        <div className="mt-4">
          <div className="small secondary">Usually charged later in the month</div>
          <List>
            {f.upcoming.map((p) => (
              <ListRow key={p.provider + p.firstDate} lead={dateLabelShort(p.nextExpected)} title={<ProviderLink provider={p.provider} />} value={`~${formatEUR(p.typicalCents)}`} />
            ))}
          </List>
        </div>
      )}

      <div className="mt-3">
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
        <p>
          It's a simple pattern-based estimate, not a prediction of specific charges. One-off purchases,
          plan changes, or transactions not yet imported will move the real number.
          {f.asOfDay >= f.daysInMonth ? ' The month is over, so nothing is added.' : ''}
        </p>
      </Disclosure>
      </div>
    </Card>
  );
}
