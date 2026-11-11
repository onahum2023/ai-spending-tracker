import type { ReactNode } from 'react';
import { monthDrillDown, monthTotalThroughDay, rowsInMonths, filterPeriod, totalsByMonth } from '../lib/analytics';
import { addMonths, dateLabelShort, dayOf, monthLabel, monthOf, monthShort, yearOf } from '../lib/dates';
import { STALE_AFTER_DAYS, type ExpectedCharge, type Forecast } from '../lib/forecast';
import { formatEUR, sumCents } from '../lib/money';
import { describeOneTime, formatSignedNoBreak, oneTimeNote } from '../lib/oneTime';
import type { Period, Transaction } from '../lib/types';
import { href, providerHref } from '../router';
import { useLedger } from '../store';
import { BudgetSection } from './BudgetSection';
import { Change, Disclosure, ReadChip, StreamName } from './ui';

/** The estimate for the month in progress, or null when the period is not that month. */
export type SideForecast = Extract<Forecast, { status: 'ok' | 'insufficient' }>;

function Row({ label, value, sub }: { label: ReactNode; value: ReactNode; sub?: ReactNode }) {
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

/** "Compared with": plain rows that follow the period picker. Changes are an arrow in the accent colour. */
function Compared({ period, inProgress, asOf }: { period: Period; inProgress: boolean; asOf: string }) {
  const { transactions, span, analysis, today } = useLedger();
  if (!span) return null;
  const byMonth = totalsByMonth(transactions);

  /** A second line under a change when either period holds one-time charges you confirmed. Nothing when there are none. */
  const oneTime = (current: Transaction[], earlier: Transaction[]) => {
    const n = oneTimeNote(current, earlier, analysis.typeOf, sumCents);
    return n ? (
      <span className="side-note" title={describeOneTime(n)}>
        <span className="nowrap">{formatSignedNoBreak(n.withoutCents)}</span> without one-time
      </span>
    ) : null;
  };

  if (period.kind === 'month') {
    const m = period.month;
    const prev = addMonths(m, -1);
    const cur = byMonth.get(m) ?? 0;
    const before = byMonth.get(prev) ?? 0;
    const hasPrev = prev >= span.firstMonth;
    const day = dayOf(asOf);
    const prevSame = monthTotalThroughDay(transactions, prev, day);
    const y = yearOf(m);
    const yearRows = filterPeriod(transactions, { kind: 'year', year: y });
    const yearMonths = span.months.filter((x) => yearOf(x) === y);
    const yearSoFar = y === yearOf(monthOf(today > span.lastDate ? today : span.lastDate));
    return (
      <section className="side-section">
        <h3>Compared with</h3>
        <Row
          label={`Previous month · ${monthLabel(prev)}`}
          value={hasPrev ? formatEUR(before) : '—'}
          sub={
            !hasPrev ? (
              'Before recorded history'
            ) : inProgress ? undefined : before > 0 ? (
              <>
                <Change before={before} after={cur} /> this month
                {oneTime(monthDrillDown(transactions, m), monthDrillDown(transactions, prev))}
              </>
            ) : (
              <>
                No spending the month before
                {oneTime(monthDrillDown(transactions, m), [])}
              </>
            )
          }
        />
        {inProgress && hasPrev && (
          <Row
            label={`vs same point in ${monthShort(prev)}`}
            value={<Change before={prevSame} after={cur} showPct={false} />}
            sub={
              <>
                {monthShort(prev)} 1–{day}: {formatEUR(prevSame)}
                {oneTime(monthDrillDown(transactions, m), monthDrillDown(transactions, prev, day))}
              </>
            }
          />
        )}
        <Row
          label={`${y} ${yearSoFar ? 'so far' : 'total'}`}
          value={formatEUR(sumCents(yearRows))}
          sub={`avg ${formatEUR(Math.round(sumCents(yearRows) / yearMonths.length))}/mo · ${monthShort(yearMonths[0])}–${monthShort(yearMonths[yearMonths.length - 1])}`}
        />
      </section>
    );
  }

  if (period.kind === 'year') {
    const y = period.year;
    const months = span.months.filter((m) => yearOf(m) === y);
    const rows = filterPeriod(transactions, period);
    const total = sumCents(rows);
    const prevYearRows = filterPeriod(transactions, { kind: 'year', year: y - 1 });
    const hasPrev = prevYearRows.length > 0;
    // Like-for-like: the same calendar months of last year
    const firstMM = months[0].slice(5);
    const lastMM = months[months.length - 1].slice(5);
    const samePrevRows = rowsInMonths(transactions, `${y - 1}-${firstMM}`, `${y - 1}-${lastMM}`);
    const samePrev = sumCents(samePrevRows);
    const partial = months.length < 12;
    const best = [...months].sort((a, b) => (byMonth.get(b) ?? 0) - (byMonth.get(a) ?? 0))[0];
    return (
      <section className="side-section">
        <h3>Compared with</h3>
        <Row label={`${y - 1} total`} value={hasPrev ? formatEUR(sumCents(prevYearRows)) : '—'} sub={hasPrev ? undefined : 'No recorded data'} />
        {hasPrev && (
          <Row
            label={partial ? `vs same months of ${y - 1}` : `vs ${y - 1}`}
            value={<Change before={samePrev} after={total} showPct={false} />}
            sub={
              <>
                {monthShort(months[0])}–{monthShort(months[months.length - 1])} {y - 1}: {formatEUR(samePrev)}
                {oneTime(rows, samePrevRows)}
              </>
            }
          />
        )}
        <Row
          label="Average per month"
          value={formatEUR(Math.round(total / months.length))}
          sub={`Highest: ${monthLabel(best)} (${formatEUR(byMonth.get(best) ?? 0)})`}
        />
      </section>
    );
  }

  const total = sumCents(transactions);
  const best = [...span.months].sort((a, b) => (byMonth.get(b) ?? 0) - (byMonth.get(a) ?? 0))[0];
  return (
    <section className="side-section">
      <h3>Overall</h3>
      <Row label="Average per month" value={formatEUR(Math.round(total / span.months.length))} sub={`over ${span.months.length} months`} />
      <Row label="Highest month" value={formatEUR(byMonth.get(best) ?? 0)} sub={monthLabel(best)} />
      <Row label="Charges" value={transactions.length} sub={`since ${monthLabel(span.firstMonth)}`} />
    </section>
  );
}

/** What the estimate adds, one row per recurring charge, with the same hatch the chart stacks on the month's bar. */
function StillDue({ forecast, colorOf }: { forecast: SideForecast; colorOf: (e: ExpectedCharge) => string }) {
  const { span } = useLedger();
  const lastRecorded = span?.lastDate;

  if (forecast.status === 'insufficient') {
    return (
      <section className="side-section">
        <h3>Still due this month</h3>
        <div className="notice notice-warn" style={{ marginTop: 6 }}>No estimate: {forecast.reason}</div>
      </section>
    );
  }
  const f = forecast;
  return (
    <section className="side-section">
      <div className="row-between">
        <h3>Still due this month</h3>
        <ReadChip>Estimate</ReadChip>
      </div>
      {f.expected.length === 0 ? (
        <p className="small muted" style={{ marginTop: 6 }}>No recurring charges are still due this month.</p>
      ) : (
        <div className="due-list">
          {f.expected.map((e) => (
            <div key={`${e.provider}|${e.merchant}|${e.date}`} className="due-row">
              <span className="due-name">
                <span className="dot dot-hatch" style={{ ['--hatch' as string]: colorOf(e) }} aria-hidden="true" />
                <span className="due-text">
                  <a className="provider-cell" href={providerHref(e.provider)}>{e.provider}</a>
                  <StreamName provider={e.provider} merchant={e.merchant} labelOnly />
                </span>
              </span>
              <span className="due-amount num" title={e.confirmed ? 'You confirmed this subscription' : 'Found by the pattern rule: monthly for 3+ months, last charged last month'}>
                {formatEUR(e.cents)}
                <span className="muted small"> · {dateLabelShort(e.date)}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {f.usageSoFarCents !== null && (
        <p className="small" style={{ margin: '10px 0 0' }}>
          <span className="secondary">Usage so far</span> <strong className="num">{formatEUR(f.usageSoFarCents)}</strong>
          <span className="muted"> · not projected, not in the estimate</span>
        </p>
      )}

      {f.dataOld && (
        <p className="small muted" style={{ margin: '8px 0 0' }}>
          Your last import is more than a week old.{' '}
          <a href={href(['data'])} style={{ textDecoration: 'underline' }}>Import newer statements</a> for a better estimate.
        </p>
      )}

      <div className="explain" style={{ marginTop: 10 }}>
        <Disclosure label="How is this estimated?">
          <ol>
            <li>
              <strong>Recorded so far</strong> is the sum of every transaction dated in {monthLabel(f.month)} up to the last import
              {lastRecorded ? ` (${dateLabelShort(lastRecorded)})` : ''}. It is the ledger, unchanged.
            </li>
            <li>
              <strong>Still due</strong> adds only recurring charges that are due later this month and that the app has strong reason to
              expect: a subscription you confirmed on its provider's page, or one found by the pattern rule (the same provider on a
              similar day and amount for 3+ months in a row) whose latest charge was last month. Each counts at that charge type's last
              actual charge, not an average. "Later" is counted from the last import, not from today: a charge that falls after the data
              ends has not been seen yet, even if its usual day has passed.
            </li>
            <li><strong>At least</strong> = recorded + still due. The month can cost more; it should not cost less.</li>
            <li>
              <strong>Usage</strong> is pay-as-you-go, so it is not projected: the line shows what has been spent so far.{' '}
              <strong>One-time</strong> charges never feed the estimate.
            </li>
          </ol>
          <p className="muted">
            Nothing is shown when the last import is more than {STALE_AFTER_DAYS} days old.
            {f.asOfDay >= f.daysInMonth ? ' The month is over, so nothing is added.' : ''}
          </p>
        </Disclosure>
      </div>
    </section>
  );
}

/**
 * The column beside the chart: how the period compares, what is still due this month (for the month in progress) and the
 * budget. Plain rows, not cards.
 */
export function OverviewSide({
  period,
  inProgress,
  forecast,
  asOf,
  dueColor,
}: {
  period: Period;
  inProgress: boolean;
  forecast: SideForecast;
  asOf: string;
  dueColor: (e: ExpectedCharge) => string;
}) {
  return (
    <aside className="card overview-side" aria-label="Comparisons, what is still due and budget">
      <Compared period={period} inProgress={inProgress} asOf={asOf} />
      {inProgress && <StillDue forecast={forecast} colorOf={dueColor} />}
      <BudgetSection />
    </aside>
  );
}
