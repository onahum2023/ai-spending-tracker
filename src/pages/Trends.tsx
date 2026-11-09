import { useMemo, useState } from 'react';
import { FixedVariableChart, MonthlyTrendChart, YearCompareChart } from '../components/charts';
import { Card, Delta, EmptyState, ProviderDot, ProviderLink, Segmented } from '../components/ui';
import {
  concentration,
  filterPeriod,
  lastCompleteMonth,
  providerChanges,
  rowsInMonths,
  totalsByMonth,
} from '../lib/analytics';
import { addMonths, dateLabel, monthLabel, monthOf, monthShort, ordinal, yearOf } from '../lib/dates';
import { formatEUR, formatSignedEUR, sumCents } from '../lib/money';
import { fixedVariableChange, fixedVariableSentence } from '../lib/insights';
import { providerHref } from '../router';
import { useLedger } from '../store';

function rangeLabel(from: string, to: string) {
  if (from === to) return monthLabel(from);
  return yearOf(from) === yearOf(to)
    ? `${monthShort(from)}–${monthShort(to)} ${yearOf(to)}`
    : `${monthLabel(from)} – ${monthLabel(to)}`;
}

export function Trends() {
  const { transactions, span, today } = useLedger();
  if (!span) return null;
  const L = lastCompleteMonth(span, today);
  const byMonth = totalsByMonth(transactions);
  const sortedMonths = [...span.months].sort((a, b) => (byMonth.get(b) ?? 0) - (byMonth.get(a) ?? 0));
  const completeMonths = span.months.filter((m) => m <= L);
  const last3 = sumCents(rowsInMonths(transactions, addMonths(L, -2), L));
  const prev3 = sumCents(rowsInMonths(transactions, addMonths(L, -5), addMonths(L, -3)));

  return (
    <div className="stack">
      <div className="grid cols-2">
        <Card title="Monthly spending over time" subtitle={`${monthLabel(span.firstMonth)} – ${monthLabel(span.lastMonth)}${span.lastMonth > L ? ` (${monthShort(span.lastMonth)} in progress)` : ''}`}>
          <MonthlyTrendChart rows={transactions} months={span.months} />
        </Card>
        <Card title="At a glance" subtitle="Complete months only, unless noted">
          <div className="stack" style={{ gap: 14 }}>
            <Stat label={`Last 3 months (${rangeLabel(addMonths(L, -2), L)})`} value={formatEUR(last3)} sub={<>vs previous 3: <Delta before={prev3} after={last3} /></>} />
            <Stat label="Average complete month" value={formatEUR(completeMonths.length ? Math.round(sumCents(rowsInMonths(transactions, span.firstMonth, L)) / completeMonths.length) : 0)} sub={`over ${completeMonths.length} months`} />
            <Stat label="Highest month" value={formatEUR(byMonth.get(sortedMonths[0]) ?? 0)} sub={monthLabel(sortedMonths[0])} />
            <Stat label="Lowest complete month" value={(() => { const low = [...completeMonths].sort((a, b) => (byMonth.get(a) ?? 0) - (byMonth.get(b) ?? 0))[0]; return low ? formatEUR(byMonth.get(low) ?? 0) : '—'; })()} sub={(() => { const low = [...completeMonths].sort((a, b) => (byMonth.get(a) ?? 0) - (byMonth.get(b) ?? 0))[0]; return low ? monthLabel(low) : ''; })()} />
          </div>
        </Card>
      </div>

      <FixedVariable />

      <YearComparison />

      <div className="grid cols-2-even">
        <ChangesCard />
        <ConcentrationCard />
      </div>

      <RecurringCard />
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div>
      <div className="small secondary">{label}</div>
      <div className="num" style={{ fontSize: 19, fontWeight: 650 }}>{value}</div>
      {sub && <div className="small muted">{sub}</div>}
    </div>
  );
}

function FixedVariable() {
  const { transactions, span, today, analysis } = useLedger();
  if (!span) return null;
  const L = lastCompleteMonth(span, today);
  const c = fixedVariableChange(transactions, analysis.fixed, L);
  const sentence = fixedVariableSentence(c);
  const total = c.after.fixedCents + c.after.variableCents;
  const share = total > 0 ? Math.round((c.after.fixedCents / total) * 100) : 0;
  return (
    <div className="grid cols-2">
      <Card title="Recurring vs usage" subtitle="Charges that repeat every month, against API top-ups, overages and one-off charges">
        <FixedVariableChart rows={transactions} months={span.months} fixed={analysis.fixed} />
      </Card>
      <Card title="More tools or more usage?" subtitle={`${rangeLabel(c.afterFrom, c.afterTo)} vs ${rangeLabel(c.beforeFrom, c.beforeTo)}`}>
        <div className="stack" style={{ gap: 14 }}>
          <Stat label="Recurring charges" value={formatEUR(c.after.fixedCents)} sub={<>{share}% of the last 3 months · <Delta before={c.before.fixedCents} after={c.after.fixedCents} /></>} />
          <Stat label="Usage and one-off charges" value={formatEUR(c.after.variableCents)} sub={<>{100 - share}% · <Delta before={c.before.variableCents} after={c.after.variableCents} /></>} />
          {sentence && <p className="small secondary">{sentence}</p>}
          <p className="small muted">
            A charge counts as recurring once it has appeared three months in a row, so a tool started in the last two months shows as
            usage until then.
          </p>
        </div>
      </Card>
    </div>
  );
}

function YearComparison() {
  const { transactions, span } = useLedger();
  if (!span) return null;
  const years = span.years;
  const lastMM = span.lastMonth.slice(5);
  const latestYear = years[years.length - 1];
  return (
    <div className="grid cols-2">
      <Card title="Year over year" subtitle="Spending per calendar month, one line per year">
        <YearCompareChart rows={transactions} years={years} />
      </Card>
      <Card title="Yearly totals" subtitle={`Like-for-like compares Jan–${monthShort(span.lastMonth)} of each year`}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Year</th>
                <th className="amount">Total</th>
                <th className="amount">Jan–{monthShort(span.lastMonth)}</th>
                <th className="amount">Change</th>
              </tr>
            </thead>
            <tbody>
              {[...years].reverse().map((y) => {
                const total = sumCents(filterPeriod(transactions, { kind: 'year', year: y }));
                const ytd = sumCents(rowsInMonths(transactions, `${y}-01`, `${y}-${lastMM}`));
                const prevYtd = sumCents(rowsInMonths(transactions, `${y - 1}-01`, `${y - 1}-${lastMM}`));
                const hasPrev = years.includes(y - 1);
                return (
                  <tr key={y}>
                    <td>
                      <strong>{y}</strong>
                      {y === latestYear && span.lastMonth.slice(5) !== '12' && <span className="small muted"> · to date</span>}
                      {y === years[0] && span.firstMonth.slice(5) !== '01' && <span className="small muted"> · from {monthShort(span.firstMonth)}</span>}
                    </td>
                    <td className="amount">{formatEUR(total)}</td>
                    <td className="amount">{formatEUR(ytd)}</td>
                    <td className="amount">{hasPrev ? <Delta before={prevYtd} after={ytd} /> : <span className="muted">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

type ChangeWindow = 'q' | 'ytd';

function ChangesCard() {
  const { transactions, span, today } = useLedger();
  const [win, setWin] = useState<ChangeWindow>('q');
  const result = useMemo(() => {
    if (!span) return null;
    const L = lastCompleteMonth(span, today);
    if (win === 'q') {
      const a = [addMonths(L, -5), addMonths(L, -3)] as const;
      const b = [addMonths(L, -2), L] as const;
      return {
        before: rangeLabel(a[0], a[1]),
        after: rangeLabel(b[0], b[1]),
        changes: providerChanges(rowsInMonths(transactions, a[0], a[1]), rowsInMonths(transactions, b[0], b[1])),
      };
    }
    const y = yearOf(L);
    const mm = L.slice(5);
    return {
      before: rangeLabel(`${y - 1}-01`, `${y - 1}-${mm}`),
      after: rangeLabel(`${y}-01`, L),
      changes: providerChanges(rowsInMonths(transactions, `${y - 1}-01`, `${y - 1}-${mm}`), rowsInMonths(transactions, `${y}-01`, L)),
    };
  }, [transactions, span, today, win]);
  if (!result) return null;

  const ups = result.changes.filter((c) => c.deltaCents > 0).slice(0, 6);
  const downs = result.changes.filter((c) => c.deltaCents < 0).reverse().slice(0, 6);
  const max = Math.max(1, ...result.changes.map((c) => Math.abs(c.deltaCents)));

  const Row = ({ c }: { c: (typeof result.changes)[number] }) => (
    <div className="change-row">
      <ProviderLink provider={c.provider} />
      <div className="change-track" title={`${formatEUR(c.beforeCents)} → ${formatEUR(c.afterCents)}`}>
        <div className={`change-bar ${c.deltaCents > 0 ? 'up' : 'down'}`} style={{ width: `${(Math.abs(c.deltaCents) / max) * 50}%` }} />
      </div>
      <span className={`num right ${c.deltaCents > 0 ? 'delta-up' : 'delta-down'}`}>
        {c.deltaCents > 0 ? '▲' : '▼'} {formatSignedEUR(c.deltaCents)}
      </span>
    </div>
  );

  return (
    <Card
      title="Biggest increases and decreases"
      subtitle={`${result.after} vs ${result.before}, by provider`}
      actions={
        <Segmented<ChangeWindow>
          label="Comparison window"
          value={win}
          onChange={setWin}
          options={[
            { value: 'q', label: '3 months' },
            { value: 'ytd', label: 'Year to date' },
          ]}
        />
      }
    >
      {result.changes.length === 0 ? (
        <EmptyState>No changes between these periods.</EmptyState>
      ) : (
        <div className="stack" style={{ gap: 12 }}>
          <div>
            <div className="small secondary" style={{ marginBottom: 4 }}>Increases (more spending)</div>
            {ups.length ? ups.map((c) => <Row key={c.provider} c={c} />) : <div className="small muted">None</div>}
          </div>
          <div>
            <div className="small secondary" style={{ marginBottom: 4 }}>Decreases (less spending)</div>
            {downs.length ? downs.map((c) => <Row key={c.provider} c={c} />) : <div className="small muted">None</div>}
          </div>
          <div className="small muted">
            Net change: <Delta before={sumCents(result.changes.map((c) => ({ amountCents: c.beforeCents })))} after={sumCents(result.changes.map((c) => ({ amountCents: c.afterCents })))} />
          </div>
        </div>
      )}
    </Card>
  );
}

type ConcWindow = 'all' | '12m';

function ConcentrationCard() {
  const { transactions, span, colors } = useLedger();
  const [win, setWin] = useState<ConcWindow>('12m');
  const c = useMemo(() => {
    if (!span) return null;
    const rows = win === 'all' ? transactions : rowsInMonths(transactions, addMonths(span.lastMonth, -11), span.lastMonth);
    return concentration(rows);
  }, [transactions, span, win]);
  if (!c || !span) return null;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const top = c.shares.slice(0, 6);
  const rest = c.shares.slice(6);
  const restShare = rest.reduce((a, s) => a + s.share, 0);

  return (
    <Card
      title="Provider concentration"
      subtitle={win === 'all' ? 'Share of all-time spending' : `Share of spending, ${monthLabel(addMonths(span.lastMonth, -11))} – ${monthLabel(span.lastMonth)}`}
      actions={
        <Segmented<ConcWindow>
          label="Concentration window"
          value={win}
          onChange={setWin}
          options={[
            { value: '12m', label: 'Last 12 months' },
            { value: 'all', label: 'All time' },
          ]}
        />
      }
    >
      <div className="grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', marginBottom: 14 }}>
        <Stat label="Top provider" value={pct(c.top1Share)} sub={c.shares[0]?.provider} />
        <Stat label="Top 3 providers" value={pct(c.top3Share)} sub="of spending" />
        <Stat label="80% of spending" value={`${c.providersFor80} of ${c.shares.length}`} sub="providers" />
      </div>
      <div className="segbar" role="img" aria-label="Share of spending by provider">
        {top.map((s) => (
          <div key={s.provider} style={{ flex: s.share, background: colors.color(s.provider) }} title={`${s.provider}: ${pct(s.share)}`} />
        ))}
        {rest.length > 0 && <div style={{ flex: restShare, background: colors.otherColor }} title={`${rest.length} others: ${pct(restShare)}`} />}
      </div>
      <div className="bar-list" style={{ marginTop: 14, gap: 6 }}>
        {top.map((s) => (
          <a key={s.provider} className="row-between small" href={providerHref(s.provider)}>
            <span className="bar-name"><ProviderDot provider={s.provider} /><span>{s.provider}</span></span>
            <span className="num">{formatEUR(s.cents)} <span className="muted">· {pct(s.share)}</span></span>
          </a>
        ))}
        {rest.length > 0 && (
          <div className="row-between small muted">
            <span className="bar-name"><span className="dot" style={{ background: colors.otherColor }} /><span>{rest.length} other providers</span></span>
            <span className="num">{formatEUR(rest.reduce((a, s) => a + s.cents, 0))} · {pct(restShare)}</span>
          </div>
        )}
      </div>
    </Card>
  );
}

function RecurringCard() {
  const { analysis } = useLedger();
  const patterns = analysis.patterns;
  return (
    <Card
      title="Recurring-looking patterns"
      subtitle="Charges from the same provider on a similar day and amount for 3+ consecutive months. These are observations from the data, not confirmed subscriptions."
    >
      {patterns.length === 0 ? (
        <EmptyState>No recurring-looking patterns found.</EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Provider</th>
                <th className="hide-sm">Typical descriptor</th>
                <th>Timing</th>
                <th className="amount">Typical amount</th>
                <th className="amount">Months</th>
                <th>Seen</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {patterns.map((p) => (
                <tr key={p.provider + p.firstDate}>
                  <td><ProviderLink provider={p.provider} /></td>
                  <td className="merchant hide-sm">{p.merchant}</td>
                  <td className="nowrap">Monthly, ~{ordinal(p.typicalDay)}</td>
                  <td className="amount">
                    {formatEUR(p.typicalCents)}
                    {p.minCents !== p.maxCents && <div className="small muted">{formatEUR(p.minCents)}–{formatEUR(p.maxCents)}</div>}
                  </td>
                  <td className="amount">{p.months}</td>
                  <td className="date">{rangeLabel(monthOf(p.firstDate), monthOf(p.lastDate))}</td>
                  <td>
                    <span className={`chip ${p.active ? 'chip-active' : 'chip-ended'}`} title={p.active ? `Next expected around ${dateLabel(p.nextExpected)}` : `Last seen ${dateLabel(p.lastDate)}`}>
                      {p.active ? 'Still appearing' : 'Stopped'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
