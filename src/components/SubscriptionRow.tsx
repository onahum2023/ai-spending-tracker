import { useId, useState, type ReactNode } from 'react';
import { CATEGORY_LABELS, CATEGORY_NOUNS } from '../lib/categories';
import { addMonths, dateLabel, monthLabel, monthOf, monthShort, ordinal } from '../lib/dates';
import type { StoppedSubscription, Subscription, SubscriptionReport } from '../lib/insights';
import { labelMap, labelOf, tidyDescriptor } from '../lib/labels';
import { formatEUR } from '../lib/money';
import { overrideMap, overrideOf, typeLabel, WHY } from '../lib/overrides';
import { providerHref } from '../router';
import { useLedger } from '../store';
import { Chevron, ProviderDot } from './ui';

const joinNames = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

type Pill = { text: string; cls: string };

/** The shared shell of an expandable row: the answer on the line, the reasoning in the panel. */
function DisclosureRow({
  provider,
  name,
  secondary,
  pills,
  amount,
  children,
}: {
  /** Shows the provider's colour dot when given. */
  provider?: string;
  name: string;
  secondary?: string;
  pills: Pill[];
  amount: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <li className="sub-item">
      <button type="button" className="sub-row" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)}>
        {provider && <ProviderDot provider={provider} />}
        <span className="sub-main">
          <span className="sub-name">
            {name}
            {secondary && <span className="muted sub-provider"> · {secondary}</span>}
          </span>
          {pills.length > 0 && (
            <span className="sub-pills">
              {pills.slice(0, 2).map((p) => (
                <span key={p.text} className={`chip ${p.cls}`.trim()}>{p.text}</span>
              ))}
            </span>
          )}
        </span>
        <span className="sub-amount num">{amount}</span>
        <Chevron open={open} />
      </button>
      <div id={panelId} hidden={!open} className="sub-detail">
        {children}
      </div>
    </li>
  );
}

/** One recurring charge: the answer when closed, the reasoning when open. */
export function SubscriptionRow({
  s,
  report,
  reviewPill = false,
  showProvider = true,
}: {
  s: Subscription;
  report: SubscriptionReport;
  reviewPill?: boolean;
  /** False on the provider's own page, where the provider is already the heading. */
  showProvider?: boolean;
}) {
  const { analysis, overrides, labels } = useLedger();

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
  if (reviewPill && info && !confirmed) pills.push({ text: 'To review', cls: 'chip-warn' });

  const next = report.upcoming.find((u) => u.provider === s.provider && u.merchant === s.merchant);
  const yearOf = (month: string) => (month.slice(0, 4) === report.latestDate.slice(0, 4) ? '' : ` ${month.slice(0, 4)}`);

  return (
    <DisclosureRow
      provider={showProvider ? s.provider : undefined}
      name={label ?? (showProvider ? s.provider : s.cadence === 'yearly' ? 'Yearly subscription' : 'Monthly subscription')}
      secondary={label && showProvider ? s.provider : undefined}
      pills={pills}
      amount={`${formatEUR(s.monthlyCents)}/mo`}
    >
      <p>
        {s.cadence === 'yearly'
          ? `Yearly since ${monthLabel(monthOf(s.pattern.firstDate))}. ${formatEUR(s.billedCents)} is billed once a year, shown here as a twelfth.`
          : `Monthly since ${monthLabel(monthOf(s.pattern.firstDate))}, around the ${ordinal(s.pattern.typicalDay)}.`}
        {s.renewal &&
          (s.renewal.overdue
            ? ` The renewal has not been seen yet (expected around ${dateLabel(s.renewal.expected)}).`
            : ` The next renewal is expected around ${dateLabel(s.renewal.expected)}${s.renewal.confirmed ? '' : ' (estimated)'}.`)}
      </p>
      {s.cadence !== 'yearly' && next && (
        <p>The next charge is expected around {dateLabel(next.date)}, about {formatEUR(next.cents)}.</p>
      )}
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
          {showProvider ? (
            <a href={providerHref(s.provider)} className="sub-link">{confirmed ? 'Change it on the provider page' : 'Confirm or change'}</a>
          ) : (
            <>{confirmed ? 'Change it' : 'Confirm or change it'} under Charge types below.</>
          )}
        </p>
      )}
      <p>Category: {CATEGORY_LABELS[s.category]}.</p>
      <p className="sub-descriptor">{tidyDescriptor(s.merchant)}</p>
    </DisclosureRow>
  );
}

/** A recurring charge that is no longer appearing, and whether anything still charges from the same merchant. */
export function StoppedRow({ s, showProvider = true }: { s: StoppedSubscription; showProvider?: boolean }) {
  const { analysis, labels } = useLedger();
  const label = labelOf(labelMap(labels), s.provider, s.merchant);
  const info = analysis.streamInfo(s.provider, s.merchant);
  const later = s.chargesSince;
  const lastLater = later[later.length - 1];
  const pills: Pill[] = [{ text: later.length === 0 ? 'Stopped' : 'Stopped, still charging', cls: later.length === 0 ? '' : 'chip-warn' }];
  return (
    <DisclosureRow
      provider={showProvider ? s.provider : undefined}
      name={label ?? (showProvider ? s.provider : s.cadence === 'yearly' ? 'Yearly subscription' : 'Monthly subscription')}
      secondary={label && showProvider ? s.provider : undefined}
      pills={pills}
      amount={`${formatEUR(s.lastCents)}${s.cadence === 'yearly' ? '/yr' : '/mo'}`}
    >
      <p>
        The last {s.cadence === 'yearly' ? 'yearly' : 'monthly'} charge was {formatEUR(s.lastCents)} on {dateLabel(s.lastDate)}.
        {s.cadence === 'yearly' ? ' No renewal has been seen since.' : ' The next one has not appeared since.'}
      </p>
      <p>
        {later.length === 0
          ? 'Nothing else has been charged by this merchant since, so the cancellation looks clean.'
          : `Something is still charging: ${later.length} charge${later.length === 1 ? '' : 's'} since, the latest on ${dateLabel(lastLater.date)} (${formatEUR(lastLater.amountCents)}). These may be usage top-ups rather than a subscription.`}
      </p>
      {info && (
        <p title={WHY[info.source]}>
          Counted as {typeLabel(info)}, {info.source === 'you' ? 'as you set it' : 'the app’s suggestion'}.
        </p>
      )}
      <p className="sub-descriptor">{tidyDescriptor(s.merchant)}</p>
    </DisclosureRow>
  );
}
