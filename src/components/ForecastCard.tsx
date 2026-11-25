import { useMemo } from 'react';
import { monthTotalThroughDay, totalsByMonth } from '../lib/analytics';
import { addMonths, dateLabel, dateLabelShort, dayOf, monthLabel, monthLabelLong, monthOf, monthShort, ordinal } from '../lib/dates';
import { forecastCurrentMonth, LOOKBACK_MONTHS } from '../lib/forecast';
import { formatEUR } from '../lib/money';
import { useLedger } from '../store';
import { DeltaChip, Disclosure, Figure, FigureText, List, ListRow, Notice, ProviderLink } from './ui';

type Forecast = Extract<ReturnType<typeof forecastCurrentMonth>, { status: 'ok' }>;

/**
 * The top of the Overview for one month: what was spent, against the month before, and for the
 * current month the month-end estimate on one meter with the budget.
 */
export function MonthHero({ month }: { month: string }) {
  const { transactions, today, analysis, budgets } = useLedger();
  const f = useMemo(() => forecastCurrentMonth(transactions, today, undefined, analysis.patterns), [transactions, today, analysis]);
  const byMonth = useMemo(() => totalsByMonth(transactions), [transactions]);

  const inProgress = month === monthOf(today);
  const prev = addMonths(month, -1);
  const cur = byMonth.get(month) ?? 0;
  const before = byMonth.get(prev) ?? 0;
  const day = dayOf(today);
  const prevSameDays = inProgress ? monthTotalThroughDay(transactions, prev, day) : before;
  const rows = transactions.filter((t) => monthOf(t.date) === month);
  const providers = new Set(rows.map((t) => t.provider)).size;
  const forecast = inProgress && f.status === 'ok' && f.month === month ? f : null;
  const budget = budgets.totalCents;

  return (
    <section className="card hero-card" aria-label={`Spending in ${monthLabelLong(month)}`}>
      <div className="hero-grid">
        <div>
          <div className="hero-label">{inProgress ? `Spent so far, ${day} day${day === 1 ? '' : 's'} in` : `Spent in ${monthLabelLong(month)}`}</div>
          <div className="hero-figure">
            <span className="hero-value">
              <Figure cents={cur} />
            </span>
            <DeltaChip before={prevSameDays} after={cur} />
            {prevSameDays > 0 && (
              <span className="hero-vs">{inProgress ? `vs the same day in ${monthShort(prev)}` : `vs ${monthLabel(prev)}`}</span>
            )}
          </div>
          <div className="hero-sub">
            {rows.length} charge{rows.length === 1 ? '' : 's'} from {providers} provider{providers === 1 ? '' : 's'}
            {inProgress ? `, through ${dateLabel(today)}` : ''}
          </div>
        </div>
        {forecast ? (
          <div className="hero-side">
            <div className="hero-label">Month-end estimate</div>
            <div className="hero-side-value num">
              ≈ <FigureText text={formatEUR(forecast.projectedCents)} />
            </div>
            <div className="hero-sub num">
              likely {formatEUR(forecast.lowCents)} to {formatEUR(forecast.highCents)}
              {budget ? `, budget ${formatEUR(budget)}` : ''}
            </div>
          </div>
        ) : (
          <div className="hero-side">
            <div className="hero-label">{monthLabelLong(prev)}</div>
            <div className="hero-side-value num">
              <FigureText text={formatEUR(before)} />
            </div>
            <div className="hero-sub">the month before</div>
          </div>
        )}
      </div>

      {forecast && <Meter f={forecast} budget={budget} />}
      {inProgress && f.status === 'insufficient' && <Notice tone="info">No month-end estimate yet: {f.reason}</Notice>}
    </section>
  );
}

function Meter({ f, budget }: { f: Forecast; budget: number | null }) {
  const scale = Math.max(f.highCents, f.projectedCents, budget ?? 0, 1) * 1.04;
  const pct = (c: number) => `${Math.min((c / scale) * 100, 100)}%`;
  const over = budget !== null && f.projectedCents > budget;
  return (
    <>
      <div
        className="meter"
        role="img"
        aria-label={`Recorded ${formatEUR(f.actualCents)}, about ${formatEUR(f.estimatedAdditionalCents)} still to come${budget ? `, budget ${formatEUR(budget)}` : ''}`}
      >
        <div className="meter-rec" style={{ width: pct(f.actualCents) }} />
        <div className={`meter-est${over ? ' is-over' : ''}`} style={{ left: pct(f.actualCents), width: pct(f.estimatedAdditionalCents) }} />
        {budget !== null && <div className="meter-budget" style={{ left: pct(budget) }} title={`Budget ${formatEUR(budget)}`} />}
      </div>
      <div className="meter-key num">
        <span><i className="sw sw-rec" />Recorded {formatEUR(f.actualCents)}</span>
        <span><i className="sw sw-est" />Still to come ≈ {formatEUR(f.estimatedAdditionalCents)}</span>
        {budget !== null ? (
          <span className={over ? 'meter-over' : undefined}><i className="sw sw-bud" />Budget {formatEUR(budget)}{over ? ', likely to go over' : ''}</span>
        ) : (
          <button type="button" className="link-btn" onClick={() => document.getElementById('budget')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
            Set a budget
          </button>
        )}
      </div>
      <ForecastExplain f={f} />
    </>
  );
}

/** How the estimate is worked out, and what usually lands later in the month. Closed by default. */
function ForecastExplain({ f }: { f: Forecast }) {
  const { span } = useLedger();
  const dayAfter = f.asOfDay + 1;
  return (
    <div className="mt-3">
      <Disclosure label="How is this estimated?">
        {f.upcoming.length > 0 && (
          <>
            <p>Usually charged later in the month:</p>
            <List className="mb-3">
              {f.upcoming.map((p) => (
                <ListRow
                  key={p.provider + p.firstDate}
                  lead={dateLabelShort(p.nextExpected)}
                  title={<ProviderLink provider={p.provider} />}
                  value={`~${formatEUR(p.typicalCents)}`}
                />
              ))}
            </List>
          </>
        )}
        <ol>
          <li>
            <strong>Recorded</strong> is the sum of every transaction dated in {monthLabel(f.month)} so far
            {span ? ` (latest: ${dateLabel(span.lastDate)})` : ''}.
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
            <strong>Still to come</strong> is the middle of those three amounts ({formatEUR(f.estimatedAdditionalCents)}). The likely range uses the
            lowest and highest.
          </li>
          <li><strong>Month-end estimate</strong> = recorded + still to come.</li>
        </ol>
        <p>
          It's a simple pattern-based estimate, not a prediction of specific charges. One-off purchases, plan changes, or transactions not yet
          imported will move the real number.
          {f.asOfDay >= f.daysInMonth ? ' The month is over, so nothing is added.' : ''}
        </p>
      </Disclosure>
    </div>
  );
}
