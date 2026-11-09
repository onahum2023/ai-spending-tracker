import { periodLabel } from '../lib/analytics';
import { addMonths, monthLabel, yearOf } from '../lib/dates';
import type { Period } from '../lib/types';
import { useLedger } from '../store';
import { Segmented } from './ui';

type Scope = Period['kind'];

/** Month / Year / All-time selector with previous/next stepping. */
export function PeriodPicker() {
  const { span, period, setPeriod } = useLedger();
  if (!span) return null;

  const setScope = (scope: Scope) => {
    if (scope === period.kind) return;
    if (scope === 'all') return setPeriod({ kind: 'all' });
    if (scope === 'year') {
      const y = period.kind === 'month' ? yearOf(period.month) : span.years[span.years.length - 1];
      return setPeriod({ kind: 'year', year: y });
    }
    // to month: the latest month in the chosen year, or the latest month overall
    const m =
      period.kind === 'year'
        ? [...span.months].reverse().find((x) => yearOf(x) === period.year) ?? span.lastMonth
        : span.lastMonth;
    setPeriod({ kind: 'month', month: m });
  };

  let prev: Period | null = null;
  let next: Period | null = null;
  if (period.kind === 'month') {
    const p = addMonths(period.month, -1);
    const n = addMonths(period.month, 1);
    if (p >= span.firstMonth) prev = { kind: 'month', month: p };
    if (n <= span.lastMonth) next = { kind: 'month', month: n };
  } else if (period.kind === 'year') {
    if (span.years.includes(period.year - 1)) prev = { kind: 'year', year: period.year - 1 };
    if (span.years.includes(period.year + 1)) next = { kind: 'year', year: period.year + 1 };
  }

  return (
    <div className="period">
      <Segmented<Scope>
        label="Period type"
        value={period.kind}
        onChange={setScope}
        options={[
          { value: 'month', label: 'Month' },
          { value: 'year', label: 'Year' },
          { value: 'all', label: 'All time' },
        ]}
      />
      {period.kind !== 'all' && (
        <div className="row" style={{ gap: 4 }}>
          <button className="btn btn-icon" aria-label="Previous period" disabled={!prev} onClick={() => prev && setPeriod(prev)}>
            ‹
          </button>
          {period.kind === 'month' ? (
            <select
              className="select"
              aria-label="Month"
              value={period.month}
              onChange={(e) => setPeriod({ kind: 'month', month: e.target.value })}
            >
              {[...span.months].reverse().map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          ) : (
            <select
              className="select"
              aria-label="Year"
              value={period.year}
              onChange={(e) => setPeriod({ kind: 'year', year: Number(e.target.value) })}
            >
              {[...span.years].reverse().map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          )}
          <button className="btn btn-icon" aria-label="Next period" disabled={!next} onClick={() => next && setPeriod(next)}>
            ›
          </button>
        </div>
      )}
      <span className="sr-only" aria-live="polite" style={{ position: 'absolute', left: -9999 }}>
        {periodLabel(period)}
      </span>
    </div>
  );
}
