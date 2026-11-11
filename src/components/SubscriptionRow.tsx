import { useId, useState } from 'react';
import { CATEGORY_LABELS, CATEGORY_NOUNS } from '../lib/categories';
import { addMonths, dateLabel, monthLabel, monthOf, monthShort, ordinal } from '../lib/dates';
import type { Subscription, SubscriptionReport } from '../lib/insights';
import { labelMap, labelOf, tidyDescriptor } from '../lib/labels';
import { formatEUR } from '../lib/money';
import { overrideMap, overrideOf, typeLabel, WHY } from '../lib/overrides';
import { providerHref } from '../router';
import { useLedger } from '../store';
import { Chevron, ProviderDot } from './ui';

const joinNames = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

type Pill = { text: string; cls: string };

/** One recurring charge: the answer when closed, the reasoning when open. */
export function SubscriptionRow({ s, report, reviewPill = false }: { s: Subscription; report: SubscriptionReport; reviewPill?: boolean }) {
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
  if (reviewPill && info && !confirmed) pills.push({ text: 'To review', cls: 'chip-warn' });

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
