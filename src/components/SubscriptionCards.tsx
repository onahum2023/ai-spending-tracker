import { dateLabel, monthShort } from '../lib/dates';
import type { OverlapGroup, PriceChange, StoppedSubscription, Subscription } from '../lib/insights';
import { formatEUR } from '../lib/money';
import { Card, CardNote, Change, Pill, EmptyState, ProviderLink, ReadChip, StreamName, TypeNote, Table } from './ui';

export function PriceChangesCard({ changes }: { changes: PriceChange[] }) {
  return (
    <Card title="Price changes" subtitle="Where the amount of a recurring charge moved by 10% or more" badge={<ReadChip />}>
      {changes.length === 0 ? (
        <EmptyState>No price changes seen.</EmptyState>
      ) : (
        <div className="stack" style={{ gap: 0 }}>
          {changes.slice(0, 8).map((c) => (
            <div key={c.date + c.provider + c.fromCents} className="change-line">
              <div>
                <ProviderLink provider={c.provider} />
                <div className="meta num">
                  went from {formatEUR(c.fromCents)} to {formatEUR(c.toCents)} in {monthShort(c.month)} {c.month.slice(0, 4)}
                </div>
                {c.kind === 'plan' && Math.abs(c.pct) >= 25 && <div className="meta">likely a plan change</div>}
              </div>
              <Change before={c.fromCents} after={c.toCents} />
            </div>
          ))}
          {changes.length > 8 && <p className="meta" style={{ marginTop: 8 }}>+ {changes.length - 8} older changes</p>}
        </div>
      )}
    </Card>
  );
}

export function OverlapCard({ groups }: { groups: OverlapGroup[] }) {
  return (
    <Card title="Overlap" subtitle="Several recurring charges in the same kind of tool" badge={<ReadChip />}>
      {groups.length === 0 ? (
        <EmptyState>No overlap: at most one recurring charge per kind of tool.</EmptyState>
      ) : (
        <div className="stack" style={{ gap: 16 }}>
          {groups.map((g) => (
            <div key={g.category}>
              <div style={{ fontWeight: 600 }}>{g.sentence.split(' · ')[0]}</div>
              <div className="meta num" style={{ marginBottom: 4 }}>
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
          <p className="meta">Overlap is not waste: you may use each one for something different.</p>
        </div>
      )}
    </Card>
  );
}

export function StoppedCard({ stopped }: { stopped: StoppedSubscription[] }) {
  return (
    <Card title="Stopped" subtitle="Recurring charges that are no longer appearing" badge={<ReadChip />}>
      <CardNote>Each is checked for anything that still charges from the same merchant.</CardNote>
      {stopped.length === 0 ? (
        <EmptyState>Nothing has stopped.</EmptyState>
      ) : (
        <Table>
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
                      {s.cadence === 'yearly' && <div className="meta">Yearly subscription, no renewal seen</div>}
                      <TypeNote provider={s.provider} merchant={s.merchant} />
                    </td>
                    <td className="num nowrap">
                      {formatEUR(s.lastCents)}
                      <div className="meta">{dateLabel(s.lastDate)}</div>
                    </td>
                    <td>
                      {later.length === 0 ? (
                        <Pill kind="neutral" title="No charge from this merchant after the last one">No charges since</Pill>
                      ) : (
                        <>
                          <Pill kind="attention">Still charging</Pill>
                          <div className="meta">
                            {later.length} charge{later.length === 1 ? '' : 's'} since, latest {dateLabel(lastLater.date)} ({formatEUR(lastLater.amountCents)}). These may be usage top-ups rather than a subscription.
                          </div>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
      )}
    </Card>
  );
}

export function SavingsCard({ subs }: { subs: Subscription[] }) {
  const top = subs.slice(0, 5);
  return (
    <Card title="What ending one would save" subtitle="Per-year cost from the latest charge" badge={<ReadChip />}>
      <CardNote>Only you know which ones you still use.</CardNote>
      {top.length === 0 ? (
        <EmptyState>No active recurring charges.</EmptyState>
      ) : (
        <div className="stack" style={{ gap: 12 }}>
          {top.map((s) => (
            <div key={s.provider + s.pattern.firstDate} className="row-between" style={{ alignItems: 'flex-start' }}>
              <div>
                <span>Ending <ProviderLink provider={s.provider} /> would save</span>
                {s.notes.map((n) => (
                  <div key={n} className="meta">{n}</div>
                ))}
              </div>
              <span className="num" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>≈ {formatEUR(s.yearlyCents)} a year</span>
            </div>
          ))}
          {subs.length > top.length && (
            <p className="meta">The other {subs.length - top.length} cost {formatEUR(subs.slice(5).reduce((a, s) => a + s.yearlyCents, 0))} a year together.</p>
          )}
        </div>
      )}
    </Card>
  );
}
