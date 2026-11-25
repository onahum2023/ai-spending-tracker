import { useEffect, useMemo, useState } from 'react';
import { TypeControl } from '../components/ChargeTypes';
import { Card, Chevron, Disclosure, EmptyState, Figure, List, ListRow, Notice, PriceJump, ProviderLink, Stat, StatStrip, StreamName, TypeNote, VendorMark, VendorStack } from '../components/ui';
import { CATEGORY_LABELS, CATEGORY_NOUNS } from '../lib/categories';
import { addMonths, dateLabel, monthLabel, monthOf, monthShort, ordinal } from '../lib/dates';
import { STALE_AFTER_DAYS } from '../lib/forecast';
import { UPCOMING_DAYS, type OverlapGroup, type PriceChange, type StoppedSubscription, type Subscription, type SubscriptionReport, type UpcomingCharge } from '../lib/insights';
import { labelMap, labelOf, tidyDescriptor } from '../lib/labels';
import { formatEUR } from '../lib/money';
import { overrideMap, overrideOf } from '../lib/overrides';
import { reviewCounts } from '../lib/providerChargeTypes';
import { href, providerHref, useRoute } from '../router';
import { useLedger } from '../store';

const weekday = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });

export function Subscriptions() {
  const { analysis, transactions, overrides } = useLedger();
  const r = analysis.report;
  const toReview = [...reviewCounts(transactions, overrides).values()].reduce((a, b) => a + b, 0);
  const recentChanges = r.priceChanges.filter((c) => c.month >= addMonths(monthOf(r.latestDate), -5));
  const cleanStops = r.stopped.filter((s) => s.chargesSince.length === 0).length;

  return (
    <div className="stack">
      {toReview > 0 && (
        <Notice
          tone="warn"
          role="status"
          actions={<a className="btn btn-sm" href={href(['providers'])}>Confirm them on Providers</a>}
        >
          <strong>{toReview} charge type{toReview === 1 ? '' : 's'} to confirm.</strong> What is counted here follows the app's guesses
          until you confirm them. Guesses have a dashed outline.
        </Notice>
      )}

      <StatStrip>
        <Stat
          lead
          label="Monthly run-rate"
          value={formatEUR(r.monthlyCents)}
          sub={`${formatEUR(r.yearlyCents)} a year if nothing changes, from ${r.active.length} recurring charge${r.active.length === 1 ? '' : 's'}`}
        />
        <Stat
          label={`Next ${UPCOMING_DAYS} days`}
          value={r.dataFresh ? formatEUR(r.upcomingCents) : '—'}
          sub={r.dataFresh ? `${r.upcoming.length} expected charge${r.upcoming.length === 1 ? '' : 's'}` : 'Import recent transactions'}
        />
        <Stat label="Price changes" value={recentChanges.length} sub="in the last 6 months" />
        <Stat
          label="Stopped"
          value={r.stopped.length}
          sub={r.stopped.length ? `${cleanStops} with no charges since` : 'nothing stopped'}
        />
      </StatStrip>

      {r.active.length === 0 && r.stopped.length === 0 ? (
        <Card>
          <EmptyState>
            No recurring charges found yet. A charge is recognised once it has appeared three months in a row at a similar day and amount.
          </EmptyState>
        </Card>
      ) : (
        <>
          <ActiveSubscriptions report={r} />
          <div className="grid cols-2-even">
            <UpcomingCard upcoming={r.upcoming} fresh={r.dataFresh} latest={r.latestDate} asOf={r.asOf} total={r.upcomingCents} />
            <PriceChangesCard changes={r.priceChanges} />
          </div>
          <div className="grid cols-2-even">
            <OverlapCard groups={r.overlaps} />
            <SavingsCard subs={r.active} />
          </div>
          <StoppedCard stopped={r.stopped} />
        </>
      )}

      <Disclosure label="How are these found?">
        <p>
          Monthly subscriptions are found from charge patterns (the same provider on a similar day and amount for 3+ months in a row),
          so they are observations, not confirmed. A charge has no plan name, so plan changes are inferred. A yearly subscription can't
          be told from a one-off charge: set its charge type to "Subscription · yearly" on the provider's page. This page only shows
          what your charge types say; change them on the provider pages.
        </p>
      </Disclosure>
    </div>
  );
}

const joinNames = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

const subKey = (s: Subscription) => `${s.provider}|${s.merchant}|${s.pattern.firstDate}`;

/** The recurring charges as statement lines, with the selected one explained in a panel beside them. */
function ActiveSubscriptions({ report }: { report: SubscriptionReport }) {
  const route = useRoute();
  const open = route.query.get('open');
  const subs = report.active;
  const pick = (provider: string | null) => (provider && subs.find((s) => s.provider === provider)) || subs[0];
  const [selected, setSelected] = useState<string | null>(() => (pick(open) ? subKey(pick(open)!) : null));
  useEffect(() => {
    const s = pick(open);
    if (open && s) {
      setSelected(subKey(s));
      document.getElementById('sub-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const current = subs.find((s) => subKey(s) === selected) ?? subs[0];

  if (subs.length === 0) {
    return (
      <Card title="Active recurring charges">
        <EmptyState>Nothing is currently recurring.</EmptyState>
      </Card>
    );
  }
  return (
    <div className="subs-layout">
      <Card title="Active recurring charges" subtitle="Select one to see why the app counts it, what it costs a year and what kind of charge it is.">
        <ul className="sub-list">
          {subs.map((s) => (
            <SubscriptionLine key={subKey(s)} s={s} report={report} selected={current === s} onSelect={() => setSelected(subKey(s))} />
          ))}
        </ul>
        <div className="sub-total num">
          <span>{subs.length} recurring charges</span>
          <span>{formatEUR(report.monthlyCents)}/mo</span>
        </div>
      </Card>
      {current && <SubscriptionPanel s={current} report={report} />}
    </div>
  );
}

function recentChange(s: Subscription, report: SubscriptionReport): PriceChange | undefined {
  const since = addMonths(monthOf(report.latestDate), -5);
  return report.priceChanges
    .filter((c) => c.provider === s.provider && c.merchant === s.merchant && c.month >= since)
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
}

/** One recurring charge as a statement line: name, its signals, and what it costs a month. */
function SubscriptionLine({ s, report, selected, onSelect }: { s: Subscription; report: SubscriptionReport; selected: boolean; onSelect: () => void }) {
  const { analysis, overrides, labels } = useLedger();
  const label = labelOf(labelMap(labels), s.provider, s.merchant);
  const info = analysis.streamInfo(s.provider, s.merchant);
  const confirmed = overrideOf(overrideMap(overrides), { provider: s.provider, merchant: s.merchant }) !== undefined;
  const change = recentChange(s, report);
  const group = report.overlaps.find((o) => o.category === s.category && o.members.some((m) => m.provider === s.provider));
  return (
    <li>
      <button type="button" className={`sub-row${selected ? ' is-selected' : ''}`} aria-pressed={selected} aria-controls="sub-panel" onClick={onSelect}>
        <VendorMark provider={s.provider} />
        <span className="sub-main">
          <span className="sub-name">
            {label ?? s.provider}
            {label && <span className="muted sub-provider"> {s.provider}</span>}
          </span>
          <span className="sub-pills">
            {change && <PriceJump from={change.fromCents} to={change.toCents} showAmounts={false} />}
            {group && (
              <span className="chip chip-overlap" title={`Overlaps with ${joinNames(group.members.filter((m) => m.provider !== s.provider).map((m) => m.provider))}`}>
                <span aria-hidden="true">◐</span> Overlap
              </span>
            )}
            {info && !confirmed && <span className="chip chip-guess" title="The app's guess: confirm it in the panel">? Guess</span>}
          </span>
        </span>
        <span className="sub-amount num">{formatEUR(s.monthlyCents)}/mo</span>
        <Chevron open={selected} />
      </button>
    </li>
  );
}

/** Why a charge counts as a subscription, what it costs, and what kind of charge it is. */
function SubscriptionPanel({ s, report }: { s: Subscription; report: SubscriptionReport }) {
  const { analysis, overrides, labels, transactions } = useLedger();
  const label = labelOf(labelMap(labels), s.provider, s.merchant);
  const info = analysis.streamInfo(s.provider, s.merchant);
  const setting = overrideOf(overrideMap(overrides), { provider: s.provider, merchant: s.merchant }) ?? null;
  const stream = useMemo(() => transactions.filter((t) => t.provider === s.provider && t.merchant === s.merchant), [transactions, s]);
  const changes = report.priceChanges
    .filter((c) => c.provider === s.provider && c.merchant === s.merchant)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const group = report.overlaps.find((o) => o.category === s.category && o.members.some((m) => m.provider === s.provider));
  const others = group ? group.members.filter((m) => m.provider !== s.provider).map((m) => m.provider) : [];

  return (
    <aside className="card sub-panel" id="sub-panel" aria-label={`About ${label ?? s.provider}`}>
      <div className="sub-panel-head">
        <VendorMark provider={s.provider} size="lg" />
        <div className="min-0">
          <h2>{label ?? s.provider}</h2>
          <div className="sub-descriptor">{tidyDescriptor(s.merchant)}</div>
        </div>
      </div>
      <div className="sub-panel-figure">
        <span className="sub-panel-value"><Figure cents={s.cadence === 'yearly' ? s.billedCents : s.monthlyCents} /></span>
        <span className="muted">
          {s.cadence === 'yearly' ? 'a year' : `a month, around the ${ordinal(s.pattern.typicalDay)}`}
        </span>
      </div>

      <h3 className="panel-h">Why it counts as a subscription</h3>
      <MonthStrip s={s} report={report} stream={stream} />
      <p className="panel-text">
        {s.pattern.forced
          ? `You marked this as a ${s.cadence} subscription.`
          : s.cadence === 'yearly'
            ? `Charged once a year since ${monthLabel(monthOf(s.pattern.firstDate))}.`
            : `Charged ${s.pattern.months} months in a row since ${monthLabel(monthOf(s.pattern.firstDate))}, around the ${ordinal(s.pattern.typicalDay)}, at a similar amount.`}
        {s.pattern.provisional &&
          ` A new price has been seen ${s.pattern.charges.length === 1 ? 'once' : 'twice'}; it is counted as the same subscription until three charges confirm it.`}
        {s.renewal &&
          (s.renewal.overdue
            ? ` The renewal has not been seen yet (expected around ${dateLabel(s.renewal.expected)}).`
            : ` The next renewal is expected around ${dateLabel(s.renewal.expected)}${s.renewal.confirmed ? '' : ' (estimated)'}.`)}
      </p>

      {changes.length > 0 && (
        <>
          <h3 className="panel-h">Price</h3>
          <div className="stack gap-2">
            {changes.slice(0, 3).map((c) => (
              <div key={c.date} className="row wrap">
                <PriceJump from={c.fromCents} to={c.toCents} />
                <span className="muted small">
                  in {monthShort(c.month)} {c.month.slice(0, 4)}
                  {c.kind === 'plan' && Math.abs(c.pct) >= 25 ? ', likely a plan change' : ''}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {group && others.length > 0 && (
        <>
          <h3 className="panel-h">Overlap</h3>
          <div className="row wrap">
            <VendorStack providers={group.members.map((m) => m.provider)} />
            <span className="small">
              One of {group.members.length} {CATEGORY_NOUNS[group.category].many} with {joinNames(others)}:{' '}
              <strong className="num">{formatEUR(group.combinedMonthlyCents)}</strong> a month together.
            </span>
          </div>
        </>
      )}

      <h3 className="panel-h">If you end it</h3>
      <div className="save-box">
        <span>You would save</span>
        <span className="save-value num">
          ≈ <Figure cents={s.yearlyCents} /> <span className="small">a year</span>
        </span>
      </div>

      {info && (
        <>
          <h3 className="panel-h">What kind of charge is this?</h3>
          <TypeControl provider={s.provider} merchant={s.merchant} name={label ?? s.provider} setting={setting} guess={info} count={stream.length} />
        </>
      )}
      <p className="panel-foot small muted">
        Category: {CATEGORY_LABELS[s.category]}. <a className="link" href={providerHref(s.provider)}>All {s.provider} charges</a>
      </p>
    </aside>
  );
}

/** Twelve months, one dot per month with a charge, sized by the amount. Months after the latest price change take its colour. */
function MonthStrip({ s, report, stream }: { s: Subscription; report: SubscriptionReport; stream: { date: string; amountCents: number }[] }) {
  const end = monthOf(report.latestDate);
  const months = Array.from({ length: 12 }, (_, i) => addMonths(end, i - 11));
  const byMonth = new Map<string, number>();
  for (const t of stream) byMonth.set(monthOf(t.date), (byMonth.get(monthOf(t.date)) ?? 0) + t.amountCents);
  const max = Math.max(1, ...months.map((m) => byMonth.get(m) ?? 0));
  const change = report.priceChanges
    .filter((c) => c.provider === s.provider && c.merchant === s.merchant)
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const tone = change ? (change.toCents > change.fromCents ? 'rise' : 'saving') : null;
  return (
    <div className="month-strip" role="img" aria-label={`Charged in ${months.filter((m) => byMonth.has(m)).length} of the last 12 months`}>
      {months.map((m) => {
        const cents = byMonth.get(m);
        const size = cents ? 7 + Math.round((cents / max) * 11) : 0;
        const toned = tone && change && m >= change.month;
        return (
          <div key={m} className="ms-month" title={cents ? `${monthLabel(m)}: ${formatEUR(cents)}` : `${monthLabel(m)}: no charge`}>
            <span className="ms-slot">
              {cents ? <span className={`ms-dot${toned ? ` ms-${tone}` : ''}`} style={{ width: size, height: size }} /> : <span className="ms-empty" />}
            </span>
            <span className="ms-label">{monthShort(m).slice(0, 1)}</span>
          </div>
        );
      })}
    </div>
  );
}

function UpcomingCard({ upcoming, fresh, latest, asOf, total }: { upcoming: UpcomingCharge[]; fresh: boolean; latest: string; asOf: string; total: number }) {
  return (
    <Card title={`Next ${UPCOMING_DAYS} days`} subtitle={`From ${dateLabel(asOf)}, on the day each recurring charge usually lands`}>
      {!fresh ? (
        <Notice tone="warn">
          No calendar: the latest recorded charge is from {dateLabel(latest)}, more than {STALE_AFTER_DAYS} days ago, so dates
          would be guesswork. Import recent transactions to enable it.
        </Notice>
      ) : upcoming.length === 0 ? (
        <EmptyState>No recurring charges are expected in this window.</EmptyState>
      ) : (
        <>
          <List>
            {upcoming.map((u) => (
              <ListRow
                key={u.date + u.provider + u.merchant}
                lead={<><span className="muted">{weekday(u.date)}</span> {dateLabel(u.date).replace(/ \d{4}$/, '')}</>}
                title={
                  <>
                    <ProviderLink provider={u.provider} />
                    <StreamName provider={u.provider} merchant={u.merchant} labelOnly />
                  </>
                }
                meta={u.cadence === 'yearly' ? (u.overdue ? 'Yearly renewal, not seen yet' : u.estimated ? 'Yearly renewal, date estimated' : 'Yearly renewal') : undefined}
                value={formatEUR(u.cents)}
              />
            ))}
            <ListRow total lead="" title={`${upcoming.length} expected`} value={formatEUR(total)} />
          </List>
          <p className="small muted mt-2">
            Estimates from past months. Amounts, dates and plans can change, and unusual charges are not predicted.
          </p>
        </>
      )}
    </Card>
  );
}

function PriceChangesCard({ changes }: { changes: PriceChange[] }) {
  return (
    <Card title="Price changes" subtitle="Where the amount of a recurring charge moved by 10% or more">
      {changes.length === 0 ? (
        <EmptyState>No price changes seen.</EmptyState>
      ) : (
        <>
          <List>
            {changes.slice(0, 8).map((c) => (
              <ListRow
                key={c.date + c.provider + c.fromCents}
                title={<ProviderLink provider={c.provider} />}
                meta={
                  <>
                    in {monthShort(c.month)} {c.month.slice(0, 4)}
                    {c.kind === 'plan' && Math.abs(c.pct) >= 25 && ', likely a plan change'}
                  </>
                }
                value={<PriceJump from={c.fromCents} to={c.toCents} />}
              />
            ))}
          </List>
          {changes.length > 8 && <p className="small muted mt-2">+ {changes.length - 8} older changes</p>}
        </>
      )}
    </Card>
  );
}

function OverlapCard({ groups }: { groups: OverlapGroup[] }) {
  return (
    <Card title="Overlap" subtitle="Several recurring charges in the same kind of tool">
      {groups.length === 0 ? (
        <EmptyState>No overlap: at most one recurring charge per kind of tool.</EmptyState>
      ) : (
        <div className="stack gap-4">
          {groups.map((g) => (
            <div key={g.category}>
              <div className="row">
                <VendorStack providers={g.members.map((m) => m.provider)} />
                <span className="strong">{g.sentence.split(' · ')[0]}</span>
              </div>
              <div className="small secondary num">
                {formatEUR(g.combinedMonthlyCents)}/month combined, {formatEUR(g.combinedMonthlyCents * 12)}/year
              </div>
              <List>
                {g.members.map((m) => (
                  <ListRow key={m.provider} title={<ProviderLink provider={m.provider} />} value={`${formatEUR(m.monthlyCents)}/month`} />
                ))}
              </List>
            </div>
          ))}
          <p className="small muted">Overlap is not waste: you may use each one for something different.</p>
        </div>
      )}
    </Card>
  );
}

function StoppedCard({ stopped }: { stopped: StoppedSubscription[] }) {
  return (
    <Card title="Stopped" subtitle="Recurring charges that are no longer appearing, and whether anything still charges from the same merchant">
      {stopped.length === 0 ? (
        <EmptyState>Nothing has stopped.</EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Last charge</th>
                <th>Since then</th>
              </tr>
            </thead>
            <tbody>
              {stopped.map((s) => {
                const later = s.chargesSince;
                const lastLater = later[later.length - 1];
                return (
                  <tr key={s.provider + s.pattern.firstDate}>
                    <td>
                      <ProviderLink provider={s.provider} />
                      <StreamName provider={s.provider} merchant={s.merchant} labelOnly />
                      {s.cadence === 'yearly' && <div className="small muted">Yearly subscription, no renewal seen</div>}
                      <TypeNote provider={s.provider} merchant={s.merchant} />
                    </td>
                    <td className="num nowrap">
                      {formatEUR(s.lastCents)}
                      <div className="small muted">{dateLabel(s.lastDate)}</div>
                    </td>
                    <td>
                      {later.length === 0 ? (
                        <span className="chip chip-ended" title="No charge from this merchant after the last one">
                          No charges since
                        </span>
                      ) : (
                        <>
                          <span className="chip chip-warn">Still charging</span>
                          <div className="small muted">
                            {later.length} charge{later.length === 1 ? '' : 's'} since, latest {dateLabel(lastLater.date)} ({formatEUR(lastLater.amountCents)}). These may be usage top-ups rather than a subscription.
                          </div>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function SavingsCard({ subs }: { subs: Subscription[] }) {
  const top = subs.slice(0, 5);
  return (
    <Card title="What ending one would save" subtitle="Per-year cost from the latest charge. Only you know which ones you still use.">
      {top.length === 0 ? (
        <EmptyState>No active recurring charges.</EmptyState>
      ) : (
        <>
          <List>
            {top.map((s) => (
              <ListRow
                key={s.provider + s.pattern.firstDate}
                title={<>Ending <ProviderLink provider={s.provider} /> would save</>}
                meta={s.notes.length ? s.notes.map((n) => <div key={n}>{n}</div>) : undefined}
                value={`≈ ${formatEUR(s.yearlyCents)} a year`}
              />
            ))}
          </List>
          {subs.length > top.length && (
            <p className="small muted mt-2">The other {subs.length - top.length} cost {formatEUR(subs.slice(5).reduce((a, s) => a + s.yearlyCents, 0))} a year together.</p>
          )}
        </>
      )}
    </Card>
  );
}
