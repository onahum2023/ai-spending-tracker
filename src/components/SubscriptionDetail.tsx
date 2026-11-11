import { CATEGORY_NOUNS } from '../lib/categories';
import { addMonths, dateLabel, monthLabel, monthOf, monthShort, ordinal } from '../lib/dates';
import type { StoppedSubscription, Subscription, SubscriptionReport } from '../lib/insights';
import { formatEUR } from '../lib/money';

const joinNames = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

export type Pill = { text: string; cls: string };

/** Price moves of one stream in the last 6 months (the window of the Price changes card), newest first. */
function recentChanges(s: { provider: string; merchant: string }, report: SubscriptionReport) {
  const since = addMonths(monthOf(report.latestDate), -5);
  return report.priceChanges
    .filter((c) => c.provider === s.provider && c.merchant === s.merchant && c.month >= since)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** Who else is in the same kind of tool as this subscription's provider. */
function overlapOf(s: Subscription, report: SubscriptionReport) {
  const group = report.overlaps.find((o) => o.category === s.category);
  const others = group ? group.members.filter((m) => m.provider !== s.provider).map((m) => m.provider) : [];
  return group && others.length ? { group, others } : null;
}

/** The small flags that go on a collapsed row: only what is worth noticing. */
export function subscriptionPills(s: Subscription, report: SubscriptionReport): Pill[] {
  const pills: Pill[] = [];
  const latest = recentChanges(s, report)[0];
  if (latest) {
    const up = latest.toCents > latest.fromCents;
    pills.push({ text: `Price ${up ? 'up' : 'down'} in ${monthShort(latest.month)}`, cls: up ? 'chip-over' : 'chip-accent' });
  }
  if (overlapOf(s, report)) pills.push({ text: 'Overlap', cls: '' });
  return pills;
}

export function stoppedPills(s: StoppedSubscription): Pill[] {
  return [{ text: s.chargesSince.length === 0 ? 'Stopped' : 'Stopped, still charging', cls: s.chargesSince.length === 0 ? '' : 'chip-warn' }];
}

/** What the app reads about one active subscription, as sentences. */
export function SubscriptionDetail({ s, report }: { s: Subscription; report: SubscriptionReport }) {
  const changes = recentChanges(s, report);
  const overlap = overlapOf(s, report);
  const next = report.upcoming.find((u) => u.provider === s.provider && u.merchant === s.merchant);
  const yearOf = (month: string) => (month.slice(0, 4) === report.latestDate.slice(0, 4) ? '' : ` ${month.slice(0, 4)}`);
  return (
    <>
      <p>
        {s.cadence === 'yearly'
          ? `Yearly since ${monthLabel(monthOf(s.pattern.firstDate))}. ${formatEUR(s.billedCents)} is billed once a year.`
          : `Monthly since ${monthLabel(monthOf(s.pattern.firstDate))}, around the ${ordinal(s.pattern.typicalDay)}. The latest charge was ${formatEUR(s.billedCents)}.`}
        {s.renewal &&
          (s.renewal.overdue
            ? ` The renewal has not been seen yet (expected around ${dateLabel(s.renewal.expected)}).`
            : ` The next renewal is expected around ${dateLabel(s.renewal.expected)}${s.renewal.confirmed ? '' : ' (estimated)'}.`)}
      </p>
      {s.cadence !== 'yearly' && next && <p>The next charge is expected around {dateLabel(next.date)}, about {formatEUR(next.cents)}.</p>}
      <p>
        Seen in {s.pattern.months} month{s.pattern.months === 1 ? '' : 's'}
        {s.pattern.minCents !== s.pattern.maxCents ? `, with amounts from ${formatEUR(s.pattern.minCents)} to ${formatEUR(s.pattern.maxCents)}` : ''}.
      </p>
      {changes.map((c) => (
        <p key={c.date}>
          Went from {formatEUR(c.fromCents)} to {formatEUR(c.toCents)} in {monthShort(c.month)}
          {yearOf(c.month)}
          {c.kind === 'plan' && Math.abs(c.pct) >= 25 ? ', likely a plan change.' : '.'}
        </p>
      ))}
      {overlap && (
        <p>
          Overlaps with {joinNames(overlap.others)}: {overlap.group.members.length} {CATEGORY_NOUNS[overlap.group.category].many}, {formatEUR(overlap.group.combinedMonthlyCents)}/mo combined.
        </p>
      )}
      {s.pattern.forced && <p>You marked this as a {s.cadence} subscription.</p>}
      {s.pattern.provisional && (
        <p>
          A new price has been seen {s.pattern.charges.length === 1 ? 'once' : 'twice'}. It is counted as the same subscription until three charges confirm it.
        </p>
      )}
    </>
  );
}

/** What the app reads about a recurring charge that is no longer appearing. */
export function StoppedDetail({ s }: { s: StoppedSubscription }) {
  const later = s.chargesSince;
  const lastLater = later[later.length - 1];
  return (
    <>
      <p>
        The last {s.cadence === 'yearly' ? 'yearly' : 'monthly'} charge was {formatEUR(s.lastCents)} on {dateLabel(s.lastDate)}.
        {s.cadence === 'yearly' ? ' No renewal has been seen since.' : ' The next one has not appeared since.'}
      </p>
      <p>
        {later.length === 0
          ? 'Nothing else has been charged by this merchant since, so the cancellation looks clean.'
          : `Something is still charging: ${later.length} charge${later.length === 1 ? '' : 's'} since, the latest on ${dateLabel(lastLater.date)} (${formatEUR(lastLater.amountCents)}). These may be usage top-ups rather than a subscription.`}
      </p>
    </>
  );
}
