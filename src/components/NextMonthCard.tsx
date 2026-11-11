import { dateLabel } from '../lib/dates';
import { UPCOMING_DAYS } from '../lib/insights';
import { formatEUR } from '../lib/money';
import { useLedger } from '../store';
import { UpcomingList } from './SubscriptionCards';
import { Card, Disclosure, ProviderLink, ReadChip, StreamName } from './ui';

/**
 * What the next month is likely to cost: the run-rate of recurring charges still appearing, and when each should land in the
 * next 30 days. All of it is the app's read of past charges, so it is marked as an estimate, with the reasoning one click away.
 */
export function NextMonthCard() {
  const { analysis } = useLedger();
  const r = analysis.report;
  const n = r.active.length;

  return (
    <Card
      title="Next month"
      subtitle={`From ${dateLabel(r.asOf)}, on the day each recurring charge usually lands`}
      actions={<ReadChip>Estimate</ReadChip>}
    >
      {n === 0 ? (
        <div className="small muted">No recurring charges are still appearing, so there is nothing to project.</div>
      ) : (
        <div className="stack" style={{ gap: 14 }}>
          <div>
            <div className="small secondary">Monthly run-rate</div>
            <div className="row" style={{ alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span className="kpi-value num" style={{ fontSize: 26 }}>≈ {formatEUR(r.monthlyCents)}</span>
              <span className="small muted num">≈ {formatEUR(r.yearlyCents)} a year if nothing changes</span>
            </div>
            <div className="small muted">from {n} recurring charge{n === 1 ? '' : 's'} still appearing</div>
          </div>
          <div>
            <div className="small secondary" style={{ marginBottom: 4 }}>
              Next {UPCOMING_DAYS} days{r.dataFresh ? ` · ${formatEUR(r.upcomingCents)} expected` : ''}
            </div>
            <UpcomingList upcoming={r.upcoming} fresh={r.dataFresh} latest={r.latestDate} total={r.upcomingCents} />
          </div>
        </div>
      )}
      <div style={{ marginTop: 12 }}>
        <Disclosure label="How is this estimated?">
          <div className="stack small muted" style={{ gap: 8 }}>
            <p style={{ margin: 0 }}>
              Monthly subscriptions are found from charge patterns (the same provider on a similar day and amount for 3+ months in a row),
              so they are observations, not confirmed. A charge has no plan name, so plan changes are inferred. A yearly subscription can't
              be told from a one-off charge: set its charge type to "Subscription · yearly" on the provider's page.
            </p>
            <p style={{ margin: 0 }}>
              The run-rate is the latest charge of each one still appearing, per month. A yearly one counts as a twelfth. The calendar
              puts each on its usual day. Amounts, dates and plans can change, and unusual charges are not predicted.
            </p>
            {n > 0 && (
              <div>
                <div className="secondary" style={{ marginBottom: 4 }}>Counted in the run-rate</div>
                {r.active.map((s) => (
                  <div key={`${s.provider}|${s.merchant}|${s.pattern.firstDate}`} className="row-between">
                    <span>
                      <ProviderLink provider={s.provider} />
                      <StreamName provider={s.provider} merchant={s.merchant} labelOnly />
                    </span>
                    <span className="num">{formatEUR(s.monthlyCents)}/mo</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Disclosure>
      </div>
    </Card>
  );
}
