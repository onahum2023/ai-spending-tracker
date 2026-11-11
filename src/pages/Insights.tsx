import { useMemo, useState, type ReactNode } from 'react';
import { MonthlyTrendChart, TypeChart, YearCompareChart } from '../components/charts';
import { OverlapCard, PriceChangesCard, SavingsCard, StoppedCard } from '../components/SubscriptionCards';
import { Card, CardNote, Delta, Pill, Disclosure, EmptyState, ProviderDot, ProviderLink, ReadChip, Segmented, StreamName } from '../components/ui';
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
import { typeChange, typeSentence } from '../lib/insights';
import { providerHref } from '../router';
import { useLedger } from '../store';

function rangeLabel(from: string, to: string) {
  if (from === to) return monthLabel(from);
  return yearOf(from) === yearOf(to)
    ? `${monthShort(from)}–${monthShort(to)} ${yearOf(to)}`
    : `${monthLabel(from)} – ${monthLabel(to)}`;
}

export function Insights() {
  const { transactions, span, today, analysis } = useLedger();
  if (!span) return null;
  const L = lastCompleteMonth(span, today);
  const byMonth = totalsByMonth(transactions);
  const sortedMonths = [...span.months].sort((a, b) => (byMonth.get(b) ?? 0) - (byMonth.get(a) ?? 0));
  const completeMonths = span.months.filter((m) => m <= L);
  const last3 = sumCents(rowsInMonths(transactions, addMonths(L, -2), L));
  const prev3 = sumCents(rowsInMonths(transactions, addMonths(L, -5), addMonths(L, -3)));

  return (
    <div className="stack" style={{ gap: 28 }}>
      <InsightGroup
        title="Patterns"
        lead="What repeats, and how your spending is made up."
        why={
          <>
            Monthly spending and the highlights are sums of recorded charges. The rest is the app's read. Charges from the same provider on a
            similar day and amount for 3+ consecutive months are shown as recurring-looking patterns: observations, not confirmed
            subscriptions. A charge's type (subscription, usage or one-time) is the app's suggestion until you confirm it on the provider's
            page: a charge is a subscription once it has appeared monthly for three months in a row, and usage when the same descriptor is
            charged three or more times without that rhythm. A yearly subscription can't be told from a one-off charge, so you set it on the
            provider's page.
          </>
        }
      >
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
        <SpendingTypes />
        <RecurringCard />
      </InsightGroup>

      <InsightGroup
        title="Shifts"
        lead="Recurring charges that changed price or stopped."
        why={
          <>
            A price change is either one pattern ending and another starting at a different amount within a month (a plan switch, called
            "likely a plan change" at 25% or more), or the amount inside one pattern moving by 10% or more and staying there. A charge has
            no plan name, so plan changes are inferred. A stopped charge is a pattern that ran and is no longer appearing, unless a newer
            pattern at the same provider replaced it. Each is checked for later charges from the same merchant: none means the cancellation
            looks clean, some are listed as still charging, which often means the stream was usage top-ups rather than a subscription.
          </>
        }
      >
        <div className="grid cols-2-even">
          <PriceChangesCard changes={analysis.report.priceChanges} />
          <StoppedCard stopped={analysis.report.stopped} />
        </div>
      </InsightGroup>

      <InsightGroup
        title="Suggestions"
        lead="Things you may want to look at. Only you know what you still use."
        why={
          <>
            Overlap is two or more active recurring charges from different providers in the same category: chat assistants, coding tools,
            media tools, writing and meeting tools. Hosting and domains are normally plural, so they are not flagged. Overlap is not waste:
            you may use each one for something different. What ending one would save is its per-year cost from the latest charge.
          </>
        }
      >
        <div className="grid cols-2-even">
          <OverlapCard groups={analysis.report.overlaps} />
          <SavingsCard subs={analysis.report.active} />
        </div>
      </InsightGroup>

      <InsightGroup title="Comparisons" lead="This period against another, and how spending is spread.">
        <YearComparison />
        <div className="grid cols-2-even">
          <ChangesCard />
          <ConcentrationCard />
        </div>
      </InsightGroup>
    </div>
  );
}

/** A named section of the page. `why` is the reasoning behind whatever in it is the app's read, one click away. */
function InsightGroup({ title, lead, why, children }: { title: string; lead: string; why?: ReactNode; children: ReactNode }) {
  return (
    <section className="insight-group" aria-label={title}>
      <header className="insight-head">
        <h2>{title}</h2>
        <p>{lead}</p>
      </header>
      <div className="stack">
        {children}
        {why && (
          <Disclosure label="How are these found?">
            <p className="small secondary" style={{ margin: 0 }}>{why}</p>
          </Disclosure>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div>
      <div className="section-label">{label}</div>
      <div className="num amt-key">{value}</div>
      {sub && <div className="meta">{sub}</div>}
    </div>
  );
}

function SpendingTypes() {
  const { transactions, span, today, analysis } = useLedger();
  if (!span) return null;
  const L = lastCompleteMonth(span, today);
  const c = typeChange(transactions, analysis.typeOf, L);
  const sentence = typeSentence(c);
  const total = c.after.subscriptionCents + c.after.usageCents + c.after.otherCents;
  const share = (x: number) => (total > 0 ? Math.round((x / total) * 100) : 0);
  const Row = ({ label, now, before }: { label: string; now: number; before: number }) => (
    <Stat label={label} value={formatEUR(now)} sub={<>{share(now)}% of the last 3 months · <Delta before={before} after={now} /></>} />
  );
  return (
    <div className="grid cols-2">
      <Card title="Subscriptions, usage and one-time" subtitle="How each charge is billed" badge={<ReadChip />}>
        <CardNote>On a schedule, pay as you go, or neither.</CardNote>
        <TypeChart rows={transactions} months={span.months} typeOf={analysis.typeOf} />
      </Card>
      <Card title="More tools or more usage?" subtitle={`${rangeLabel(c.afterFrom, c.afterTo)} vs ${rangeLabel(c.beforeFrom, c.beforeTo)}`} badge={<ReadChip />}>
        <div className="stack" style={{ gap: 14 }}>
          <Row label="Subscriptions" now={c.after.subscriptionCents} before={c.before.subscriptionCents} />
          <Row label="Usage" now={c.after.usageCents} before={c.before.usageCents} />
          <Row label="One-time / Other" now={c.after.otherCents} before={c.before.otherCents} />
          {sentence && <p className="small secondary">{sentence}</p>}
          <p className="small secondary">
            The app guesses each charge's type. A charge is a subscription once it has appeared monthly for three months in a row, and usage
            when the same descriptor is charged three or more times without that rhythm. Correct any of them on the provider's page.
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
                      {y === latestYear && span.lastMonth.slice(5) !== '12' && <span className="small secondary"> · to date</span>}
                      {y === years[0] && span.firstMonth.slice(5) !== '01' && <span className="small secondary"> · from {monthShort(span.firstMonth)}</span>}
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
      action={
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
            <div className="section-label" style={{ marginBottom: 4 }}>Increases (more spending)</div>
            {ups.length ? ups.map((c) => <Row key={c.provider} c={c} />) : <div className="meta">None</div>}
          </div>
          <div>
            <div className="section-label" style={{ marginBottom: 4 }}>Decreases (less spending)</div>
            {downs.length ? downs.map((c) => <Row key={c.provider} c={c} />) : <div className="meta">None</div>}
          </div>
          <div className="small secondary">
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
      action={
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
          <div className="row-between small secondary">
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
      subtitle="Same provider, similar day and amount, 3+ months in a row"
      badge={<ReadChip />}
    >
      <CardNote>These are observations from the data, not confirmed subscriptions.</CardNote>
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
                  <td className="merchant hide-sm"><StreamName provider={p.provider} merchant={p.merchant} className="merchant" /></td>
                  <td className="nowrap">{p.cadence === 'yearly' ? 'Yearly (set by you)' : `Monthly, ~${ordinal(p.typicalDay)}`}</td>
                  <td className="amount">
                    {formatEUR(p.typicalCents)}
                    {p.minCents !== p.maxCents && <div className="small secondary">{formatEUR(p.minCents)}–{formatEUR(p.maxCents)}</div>}
                  </td>
                  <td className="amount">{p.months}</td>
                  <td className="date">{rangeLabel(monthOf(p.firstDate), monthOf(p.lastDate))}</td>
                  <td>
                    <Pill kind="neutral" title={p.active ? `Next expected around ${dateLabel(p.nextExpected)}` : `Last seen ${dateLabel(p.lastDate)}`}>
                      {p.active ? 'Still appearing' : 'Stopped'}
                    </Pill>
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
