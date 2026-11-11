import { STALE_AFTER_DAYS } from '../lib/forecast';
import { dateLabel, monthShort } from '../lib/dates';
import { UPCOMING_DAYS, type OverlapGroup, type PriceChange, type StoppedSubscription, type Subscription, type UpcomingCharge } from '../lib/insights';
import { formatEUR } from '../lib/money';
import { Card, Delta, EmptyState, ProviderLink, StreamName, TypeNote } from './ui';

const weekday = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });

export function UpcomingCard({ upcoming, fresh, latest, asOf, total }: { upcoming: UpcomingCharge[]; fresh: boolean; latest: string; asOf: string; total: number }) {
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

export function PriceChangesCard({ changes }: { changes: PriceChange[] }) {
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

export function OverlapCard({ groups }: { groups: OverlapGroup[] }) {
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

export function StoppedCard({ stopped }: { stopped: StoppedSubscription[] }) {
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

export function SavingsCard({ subs }: { subs: Subscription[] }) {
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
