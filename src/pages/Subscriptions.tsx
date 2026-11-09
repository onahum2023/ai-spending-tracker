import { Card, Delta, EmptyState, Kpi, ProviderLink } from '../components/ui';
import { CATEGORY_LABELS, type Category } from '../lib/categories';
import { addMonths, dateLabel, monthLabel, monthOf, monthShort } from '../lib/dates';
import { STALE_AFTER_DAYS } from '../lib/forecast';
import { UPCOMING_DAYS, type OverlapGroup, type PriceChange, type StoppedSubscription, type Subscription, type UpcomingCharge } from '../lib/insights';
import { formatEUR } from '../lib/money';
import { useLedger } from '../store';

const weekday = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });

function CategoryChip({ category }: { category: Category }) {
  const { categoryColors } = useLedger();
  return (
    <span className="chip">
      <span className="dot" style={{ background: categoryColors(category) }} aria-hidden="true" />
      {CATEGORY_LABELS[category]}
    </span>
  );
}

export function Subscriptions() {
  const { analysis } = useLedger();
  const r = analysis.report;
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

      <p className="small muted">
        These are observations from charge patterns (the same provider on a similar day and amount for 3+ months in a row), not
        confirmed subscriptions. A charge has no plan name, so plan changes are inferred. Annual and one-off charges are not included.
      </p>

      {r.active.length === 0 && r.stopped.length === 0 ? (
        <Card>
          <EmptyState>
            No recurring charges found yet. A charge is recognised once it has appeared three months in a row at a similar day and amount.
          </EmptyState>
        </Card>
      ) : (
        <>
          <div className="grid cols-2">
            <ActiveCard subs={r.active} total={r.monthlyCents} />
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

function ActiveCard({ subs, total }: { subs: Subscription[]; total: number }) {
  return (
    <Card title="Active recurring charges" subtitle="The amount is the latest charge, which is what you are committed to now">
      {subs.length === 0 ? (
        <EmptyState>Nothing is currently recurring.</EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Provider</th>
                <th className="hide-sm">Category</th>
                <th className="amount">Monthly</th>
                <th className="amount">Per year</th>
                <th className="hide-sm">Since</th>
              </tr>
            </thead>
            <tbody>
              {subs.map((s) => (
                <tr key={s.provider + s.pattern.firstDate}>
                  <td>
                    <ProviderLink provider={s.provider} />
                    <div className="small muted merchant-line">{s.merchant.trim().replace(/\s{2,}/g, ' · ')}</div>
                    {s.notes.map((n) => (
                      <div key={n} className="small muted">{n}</div>
                    ))}
                  </td>
                  <td className="hide-sm"><CategoryChip category={s.category} /></td>
                  <td className="amount">{formatEUR(s.monthlyCents)}</td>
                  <td className="amount">{formatEUR(s.yearlyCents)}</td>
                  <td className="date hide-sm">{monthLabel(monthOf(s.pattern.firstDate))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>{subs.length} recurring charges</td>
                <td className="hide-sm" />
                <td className="amount">{formatEUR(total)}</td>
                <td className="amount">{formatEUR(total * 12)}</td>
                <td className="hide-sm" />
              </tr>
            </tfoot>
          </table>
        </div>
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
              <ProviderLink provider={u.provider} />
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
                    <td><ProviderLink provider={s.provider} /></td>
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
    <Card title="What ending one would save" subtitle="Latest monthly charge × 12. Only you know which ones you still use.">
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
