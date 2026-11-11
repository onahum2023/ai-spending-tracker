import { useId, useState, type ReactNode } from 'react';
import { Card, Delta, EmptyState, Kpi, ProviderDot, ProviderLink, StreamName, TypeNote } from '../components/ui';
import { CATEGORY_LABELS, CATEGORY_NOUNS } from '../lib/categories';
import { addMonths, dateLabel, monthLabel, monthOf, monthShort, ordinal } from '../lib/dates';
import { STALE_AFTER_DAYS } from '../lib/forecast';
import { UPCOMING_DAYS, type OverlapGroup, type PriceChange, type StoppedSubscription, type Subscription, type SubscriptionReport, type UpcomingCharge } from '../lib/insights';
import { labelMap, labelOf, tidyDescriptor } from '../lib/labels';
import { formatEUR } from '../lib/money';
import { overrideMap, overrideOf, typeLabel, WHY } from '../lib/overrides';
import { reviewCounts } from '../lib/providerChargeTypes';
import { href, providerHref } from '../router';
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
      <div className="grid kpis">
        <Kpi label="Monthly run-rate" value={formatEUR(r.monthlyCents)} sub={`${r.active.length} recurring charge${r.active.length === 1 ? '' : 's'} still appearing`} />
        <Kpi label="Per year" value={formatEUR(r.yearlyCents)} sub="if nothing changes" />
        <Kpi
          label={`Next ${UPCOMING_DAYS} days`}
          value={r.dataFresh ? formatEUR(r.upcomingCents) : '—'}
          sub={r.dataFresh ? `${r.upcoming.length} expected charge${r.upcoming.length === 1 ? '' : 's'}` : 'Import recent transactions'}
        />
        <Kpi label="Price changes" value={recentChanges.length} sub="in the last 6 months" />
        <Kpi
          label="Stopped"
          value={r.stopped.length}
          sub={r.stopped.length ? `${cleanStops} with no charges since` : 'nothing stopped'}
        />
      </div>

      <Disclosure label="How are these found?">
        <p className="small muted" style={{ margin: 0 }}>
          Monthly subscriptions are found from charge patterns (the same provider on a similar day and amount for 3+ months in a row),
          so they are observations, not confirmed. A charge has no plan name, so plan changes are inferred. A yearly subscription can't
          be told from a one-off charge: set its charge type to "Subscription · yearly" on the provider's page. This page only shows
          what your charge types say; change them on the provider pages.
        </p>
      </Disclosure>

      {toReview > 0 && (
        <div className="notice-bar" role="status">
          <span>
            <strong>{toReview} charge type{toReview === 1 ? '' : 's'} still to review.</strong> What is counted here follows the app's
            suggestions until you confirm them.
          </span>
          <a className="btn btn-sm" href={href(['providers'])}>Review on the Providers page</a>
        </div>
      )}

      {r.active.length === 0 && r.stopped.length === 0 ? (
        <Card>
          <EmptyState>
            No recurring charges found yet. A charge is recognised once it has appeared three months in a row at a similar day and amount.
          </EmptyState>
        </Card>
      ) : (
        <>
          <div className="grid cols-2">
            <ActiveCard subs={r.active} total={r.monthlyCents} report={r} />
            <UpcomingCard upcoming={r.upcoming} fresh={r.dataFresh} latest={r.latestDate} asOf={r.asOf} total={r.upcomingCents} />
          </div>
          <div className="grid cols-2-even">
            <PriceChangesCard changes={r.priceChanges} />
            <OverlapCard groups={r.overlaps} />
          </div>
          <div className="grid cols-2-even">
            <StoppedCard stopped={r.stopped} />
            <SavingsCard subs={r.active} />
          </div>
        </>
      )}

    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg className={`chevron${open ? ' open' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

/** A text toggle that reveals its children. Closed by default. */
function Disclosure({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div>
      <button type="button" className="disclosure-btn" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <Chevron open={open} />
        {label}
      </button>
      <div id={id} hidden={!open} className="disclosure-body">
        {children}
      </div>
    </div>
  );
}

const joinNames = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

type Pill = { text: string; cls: string };

/** One recurring charge: the answer when closed, the reasoning when open. */
function SubscriptionRow({ s, report }: { s: Subscription; report: SubscriptionReport }) {
  const { analysis, overrides, labels } = useLedger();
  const [open, setOpen] = useState(false);
  const panelId = useId();

  const label = labelOf(labelMap(labels), s.provider, s.merchant);
  const info = analysis.streamInfo(s.provider, s.merchant);
  const confirmed = overrideOf(overrideMap(overrides), { provider: s.provider, merchant: s.merchant }) !== undefined;

  // Price moves of this stream in the last 6 months (the same window as the "Price changes" figure above), newest first.
  const since = addMonths(monthOf(report.latestDate), -5);
  const changes = report.priceChanges
    .filter((c) => c.provider === s.provider && c.merchant === s.merchant && c.month >= since)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const latestChange = changes[0];

  const group = report.overlaps.find((o) => o.category === s.category);
  const others = group ? group.members.filter((m) => m.provider !== s.provider).map((m) => m.provider) : [];

  const pills: Pill[] = [];
  if (latestChange) {
    const up = latestChange.toCents > latestChange.fromCents;
    pills.push({ text: `Price ${up ? 'up' : 'down'} in ${monthShort(latestChange.month)}`, cls: up ? 'chip-over' : 'chip-accent' });
  }
  if (group && others.length) pills.push({ text: 'Overlap', cls: '' });
  if (info && !confirmed) pills.push({ text: 'To review', cls: 'chip-warn' });

  const yearOf = (month: string) => (month.slice(0, 4) === report.latestDate.slice(0, 4) ? '' : ` ${month.slice(0, 4)}`);

  return (
    <li className="sub-item">
      <button type="button" className="sub-row" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)}>
        <ProviderDot provider={s.provider} />
        <span className="sub-main">
          <span className="sub-name">
            {label ?? s.provider}
            {label && <span className="muted sub-provider"> · {s.provider}</span>}
          </span>
          {pills.length > 0 && (
            <span className="sub-pills">
              {pills.slice(0, 2).map((p) => (
                <span key={p.text} className={`chip ${p.cls}`.trim()}>{p.text}</span>
              ))}
            </span>
          )}
        </span>
        <span className="sub-amount num">{formatEUR(s.monthlyCents)}/mo</span>
        <Chevron open={open} />
      </button>
      <div id={panelId} hidden={!open} className="sub-detail">
        <p>
          {s.cadence === 'yearly'
            ? `Yearly since ${monthLabel(monthOf(s.pattern.firstDate))}. ${formatEUR(s.billedCents)} is billed once a year, shown here as a twelfth.`
            : `Monthly since ${monthLabel(monthOf(s.pattern.firstDate))}, around the ${ordinal(s.pattern.typicalDay)}.`}
          {s.renewal &&
            (s.renewal.overdue
              ? ` The renewal has not been seen yet (expected around ${dateLabel(s.renewal.expected)}).`
              : ` The next renewal is expected around ${dateLabel(s.renewal.expected)}${s.renewal.confirmed ? '' : ' (estimated)'}.`)}
        </p>
        {changes.map((c) => (
          <p key={c.date}>
            Went from {formatEUR(c.fromCents)} to {formatEUR(c.toCents)} in {monthShort(c.month)}
            {yearOf(c.month)}
            {c.kind === 'plan' && Math.abs(c.pct) >= 25 ? ', likely a plan change.' : '.'}
          </p>
        ))}
        {group && others.length > 0 && (
          <p>
            Overlaps with {joinNames(others)}: {group.members.length} {CATEGORY_NOUNS[group.category].many}, {formatEUR(group.combinedMonthlyCents)}/mo combined.
          </p>
        )}
        {s.pattern.forced && <p>You marked this as a {s.cadence} subscription.</p>}
        {s.pattern.provisional && (
          <p>
            A new price has been seen {s.pattern.charges.length === 1 ? 'once' : 'twice'}. It is counted as the same subscription until three charges confirm it.
          </p>
        )}
        {info && (
          <p title={WHY[info.source]}>
            Counted as {typeLabel(info)}.{' '}
            {confirmed ? 'You confirmed this type. ' : 'This type is the app’s suggestion. '}
            <a href={providerHref(s.provider)} className="sub-link">{confirmed ? 'Change it on the provider page' : 'Confirm or change'}</a>
          </p>
        )}
        <p>Category: {CATEGORY_LABELS[s.category]}.</p>
        <p className="sub-descriptor">{tidyDescriptor(s.merchant)}</p>
      </div>
    </li>
  );
}

function ActiveCard({ subs, total, report }: { subs: Subscription[]; total: number; report: SubscriptionReport }) {
  return (
    <Card title="Active recurring charges" subtitle="Based on the latest charge, which is what you are committed to now. A yearly one counts as a twelfth per month.">
      {subs.length === 0 ? (
        <EmptyState>Nothing is currently recurring.</EmptyState>
      ) : (
        <>
          <ul className="sub-list">
            {subs.map((s) => (
              <SubscriptionRow key={`${s.provider}|${s.merchant}|${s.pattern.firstDate}`} s={s} report={report} />
            ))}
          </ul>
          <div className="sub-total">
            <span>{subs.length} recurring charges</span>
            <span className="num">{formatEUR(total)}/mo</span>
          </div>
        </>
      )}
    </Card>
  );
}

function UpcomingCard({ upcoming, fresh, latest, asOf, total }: { upcoming: UpcomingCharge[]; fresh: boolean; latest: string; asOf: string; total: number }) {
  return (
    <Card title={`Next ${UPCOMING_DAYS} days`} subtitle={`From ${dateLabel(asOf)}, on the day each recurring charge usually lands`}>
      {!fresh ? (
        <div className="notice notice-warn">
          No calendar: the latest recorded charge is from {dateLabel(latest)}, more than {STALE_AFTER_DAYS} days ago, so dates
          would be guesswork. Import recent transactions to enable it.
        </div>
      ) : upcoming.length === 0 ? (
        <EmptyState>No recurring charges are expected in this window.</EmptyState>
      ) : (
        <div className="stack" style={{ gap: 0 }}>
          {upcoming.map((u) => (
            <div key={u.date + u.provider + u.merchant} className="cal-row">
              <span className="cal-date num">
                <span className="muted">{weekday(u.date)}</span> {dateLabel(u.date).replace(/ \d{4}$/, '')}
              </span>
              <span>
                <ProviderLink provider={u.provider} />
                <StreamName provider={u.provider} merchant={u.merchant} labelOnly />
                {u.cadence === 'yearly' && (
                  <div className="small muted">
                    {u.overdue ? 'Yearly renewal, not seen yet' : u.estimated ? 'Yearly renewal, date estimated' : 'Yearly renewal'}
                  </div>
                )}
              </span>
              <span className="num">{formatEUR(u.cents)}</span>
            </div>
          ))}
          <div className="cal-row cal-total">
            <span>{upcoming.length} expected</span>
            <span />
            <span className="num">{formatEUR(total)}</span>
          </div>
          <p className="small muted" style={{ marginTop: 8 }}>
            Estimates from past months. Amounts, dates and plans can change, and unusual charges are not predicted.
          </p>
        </div>
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
        <div className="stack" style={{ gap: 0 }}>
          {changes.slice(0, 8).map((c) => (
            <div key={c.date + c.provider + c.fromCents} className="change-line">
              <div>
                <ProviderLink provider={c.provider} />
                <div className="small secondary num">
                  went from {formatEUR(c.fromCents)} to {formatEUR(c.toCents)} in {monthShort(c.month)} {c.month.slice(0, 4)}
                </div>
                {c.kind === 'plan' && Math.abs(c.pct) >= 25 && <div className="small muted">likely a plan change</div>}
              </div>
              <Delta before={c.fromCents} after={c.toCents} />
            </div>
          ))}
          {changes.length > 8 && <p className="small muted" style={{ marginTop: 8 }}>+ {changes.length - 8} older changes</p>}
        </div>
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
        <div className="stack" style={{ gap: 14 }}>
          {groups.map((g) => (
            <div key={g.category}>
              <div style={{ fontWeight: 600 }}>{g.sentence.split(' · ')[0]}</div>
              <div className="small secondary num" style={{ marginBottom: 4 }}>
                {formatEUR(g.combinedMonthlyCents)}/month combined · {formatEUR(g.combinedMonthlyCents * 12)}/year
              </div>
              {g.members.map((m) => (
                <div key={m.provider} className="row-between small">
                  <ProviderLink provider={m.provider} />
                  <span className="num">{formatEUR(m.monthlyCents)}/month</span>
                </div>
              ))}
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
        <div className="stack" style={{ gap: 10 }}>
          {top.map((s) => (
            <div key={s.provider + s.pattern.firstDate} className="row-between" style={{ alignItems: 'flex-start' }}>
              <div>
                <span>Ending <ProviderLink provider={s.provider} /> would save</span>
                {s.notes.map((n) => (
                  <div key={n} className="small muted">{n}</div>
                ))}
              </div>
              <span className="num" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>≈ {formatEUR(s.yearlyCents)} a year</span>
            </div>
          ))}
          {subs.length > top.length && (
            <p className="small muted">The other {subs.length - top.length} cost {formatEUR(subs.slice(5).reduce((a, s) => a + s.yearlyCents, 0))} a year together.</p>
          )}
        </div>
      )}
    </Card>
  );
}
