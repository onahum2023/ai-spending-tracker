import { PriceChangesCard, OverlapCard, SavingsCard, StoppedCard, UpcomingCard } from '../components/SubscriptionCards';
import { SubscriptionRow } from '../components/SubscriptionRow';
import { Card, Disclosure, EmptyState, Kpi } from '../components/ui';
import { addMonths, monthOf } from '../lib/dates';
import { UPCOMING_DAYS, type Subscription, type SubscriptionReport } from '../lib/insights';
import { formatEUR } from '../lib/money';
import { reviewCounts } from '../lib/providerChargeTypes';
import { href } from '../router';
import { useLedger } from '../store';

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

function ActiveCard({ subs, total, report }: { subs: Subscription[]; total: number; report: SubscriptionReport }) {
  return (
    <Card title="Active recurring charges" subtitle="Based on the latest charge, which is what you are committed to now. A yearly one counts as a twelfth per month.">
      {subs.length === 0 ? (
        <EmptyState>Nothing is currently recurring.</EmptyState>
      ) : (
        <>
          <ul className="sub-list">
            {subs.map((s) => (
              <SubscriptionRow key={`${s.provider}|${s.merchant}|${s.pattern.firstDate}`} s={s} report={report} reviewPill />
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

