import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { filterPeriod, monthDrillDown, monthTotalThroughDay, rowsInMonths, totalsByMonth } from '../lib/analytics';
import { OTHER_KEY } from '../lib/colors';
import { addMonths, dateLabelShort, dayOf, monthLabel, monthOf, monthShort, yearOf } from '../lib/dates';
import { STALE_AFTER_DAYS, type Forecast } from '../lib/forecast';
import { formatEUR, sumCents } from '../lib/money';
import { describeOneTime, formatSignedNoBreak, oneTimeNote } from '../lib/oneTime';
import type { Period, Transaction } from '../lib/types';
import { href, providerHref } from '../router';
import { useLedger } from '../store';
import { Button, Card, Change, Chevron, Disclosure, ProviderAvatar, ReadChip, StatTile, StreamName } from './ui';

/** The estimate for the month in progress. */
export type HeroForecast = Extract<Forecast, { status: 'ok' | 'insufficient' }>;

/**
 * The label over the hero amount. The period picker says which month or year, so the label does not: "So far · through 12 Nov" for
 * the month in progress, "So far this year · through 12 Nov" for the year in progress, and "Total" for everything else.
 */
export function heroLabel(period: Period, inProgress: boolean, yearInProgress: boolean, asOf: string): string {
  if (period.kind === 'month' && inProgress) return `So far · through ${dateLabelShort(asOf)}`;
  if (period.kind === 'year' && yearInProgress) return `So far this year · through ${dateLabelShort(asOf)}`;
  return 'Total';
}

/**
 * Row 1, left: a card as tall as the stat tile card, content at its top left: the label, the period's total and, for the month in
 * progress, "at least €X by month end" with a hatched swatch and an Estimate pill, and under it one row that opens what the
 * estimate adds (`StillDueRow`), when anything is still due.
 */
export function OverviewHero({
  label,
  totalCents,
  inProgress,
  forecast,
}: {
  label: string;
  totalCents: number;
  inProgress: boolean;
  forecast: HeroForecast;
}) {
  return (
    <Card className="hero-card">
      <div className="hero-label">{label}</div>
      <div className="amt-hero num">{formatEUR(totalCents)}</div>
      {inProgress && forecast.status === 'ok' && (
        <>
          <div className="hero-est">
            {forecast.stillToComeCents > 0 && <span className="swatch-hatch" aria-hidden="true" />}
            <span>
              at least <strong className="num">{formatEUR(forecast.atLeastCents)}</strong> by month end
            </span>
            <ReadChip>Estimate</ReadChip>
          </div>
          {forecast.expected.length > 0 && <StillDueRow forecast={forecast} />}
        </>
      )}
      {inProgress && forecast.status === 'insufficient' && <div className="hero-est">No month-end estimate: {forecast.reason}</div>}
    </Card>
  );
}

const STACK_MAX = 4;

/**
 * One clickable row in the hero card: an overlapping stack of the providers still due (four at most, then "+N"), "N charges still
 * due · €X" and a chevron. It opens a popover anchored to the row (a bottom sheet on a phone), so the card never changes height.
 * Nothing is rendered when nothing is still due (the caller checks).
 */
function StillDueRow({ forecast: f }: { forecast: Extract<Forecast, { status: 'ok' }> }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const id = useId();
  const n = f.expected.length;
  const sum = sumCents(f.expected.map((e) => ({ amountCents: e.cents })));
  const providers = [...new Set(f.expected.map((e) => e.provider))];
  const shown = providers.slice(0, STACK_MAX);
  const more = providers.length - shown.length;

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) trigger.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    sheet.current?.focus();
    const onDown = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="still-due" ref={wrap}>
      <button
        type="button"
        ref={trigger}
        className="still-due-row"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="avatar-stack" aria-hidden="true">
          {shown.map((p) => (
            <ProviderAvatar key={p} provider={p} size={24} />
          ))}
          {more > 0 && <ProviderAvatar provider={OTHER_KEY} size={24} text={`+${more}`} />}
        </span>
        <span>
          {n} charge{n === 1 ? '' : 's'} still due · <span className="num">{formatEUR(sum)}</span>
        </span>
        <Chevron open={open} />
      </button>
      {open && (
        <>
          <div className="sheet-backdrop" onClick={() => close(true)} aria-hidden="true" />
          <div className="popover" id={id} role="dialog" aria-label="Still due this month" tabIndex={-1} ref={sheet}>
            <StillDueDetails forecast={f} onClose={() => close(true)} />
          </div>
        </>
      )}
    </div>
  );
}

/** The popover's content: every charge still due, the usage so far and how the estimate is worked out. */
function StillDueDetails({ forecast: f, onClose }: { forecast: Extract<Forecast, { status: 'ok' }>; onClose: () => void }) {
  const { span } = useLedger();
  const lastRecorded = span?.lastDate;
  return (
    <div className="popover-body">
      <div className="popover-head">
        <div className="row">
          <h3 className="popover-title">Still due this month</h3>
          <ReadChip>Estimate</ReadChip>
        </div>
        <Button variant="text" onClick={onClose}>
          Close
        </Button>
      </div>
      <div className="due-list">
        {f.expected.map((e) => (
          <div key={`${e.provider}|${e.merchant}|${e.date}`} className="due-row">
            <span className="due-name">
              <ProviderAvatar provider={e.provider} size={20} />
              <span className="due-text">
                <a className="provider-cell" href={providerHref(e.provider)}>{e.provider}</a>
                <StreamName provider={e.provider} merchant={e.merchant} labelOnly />
              </span>
            </span>
            <span className="due-amount num" title={e.confirmed ? 'You confirmed this subscription' : 'Found by the pattern rule: monthly for 3+ months, last charged last month'}>
              {formatEUR(e.cents)}
              <span className="due-date"> · {dateLabelShort(e.date)}</span>
            </span>
          </div>
        ))}
      </div>
      {f.usageSoFarCents !== null && (
        <p className="meta">
          Usage so far <strong className="num hero-strong">{formatEUR(f.usageSoFarCents)}</strong> · not projected, not in the estimate
        </p>
      )}
      {f.dataOld && (
        <p className="meta">
          Your data is more than a week old. <Button variant="text" href={href(['data'])}>Import newer statements</Button> for a better estimate.
        </p>
      )}
      <div className="explain">
        <Disclosure label="How is this estimated?">
          <ol>
            <li>
              <strong>Recorded so far</strong> is the sum of every transaction dated in {monthLabel(f.month)} up to the date the data runs through
              {lastRecorded ? ` (${dateLabelShort(lastRecorded)})` : ''}. It is the ledger, unchanged.
            </li>
            <li>
              <strong>Still due</strong> adds only recurring charges that are due later this month and that the app has strong reason to
              expect: a subscription you confirmed on its provider's page, or one found by the pattern rule (the same provider on a
              similar day and amount for 3+ months in a row) whose latest charge was last month. Each counts at that charge type's last
              actual charge, not an average. "Later" is counted from the date the data runs through, not from today: a charge that falls after the data
              ends has not been seen yet, even if its usual day has passed.
            </li>
            <li><strong>At least</strong> = recorded + still due. The month can cost more; it should not cost less.</li>
            <li>
              <strong>Usage</strong> is pay-as-you-go, so it is not projected: the line shows what has been spent so far.{' '}
              <strong>One-time</strong> charges never feed the estimate.
            </li>
          </ol>
          <p className="muted">
            Nothing is shown when the data is more than {STALE_AFTER_DAYS} days old.
            {f.asOfDay >= f.daysInMonth ? ' The month is over, so nothing is added.' : ''}
          </p>
        </Disclosure>
      </div>
    </div>
  );
}

const chargesText = (n: number) => `${n} charge${n === 1 ? '' : 's'}`;

type Tile = { key: string; label: ReactNode; value: ReactNode; meta: ReactNode };

/**
 * Row 1, right: four stat tiles in one card, 2×2. They follow the period picker.
 *
 * - Month: Previous month · vs the same point in the previous month (a past month: vs the previous month) · the year so far ·
 *   Average per month.
 * - Year: Previous year · vs the same months of the previous year · Average per month · Highest month.
 * - All time: Average per month · Highest month · Charges · Providers.
 *
 * Each tile is a label, a value and a meta line; only the comparison tile carries an arrow.
 */
export function OverviewTiles({ period, inProgress, asOf }: { period: Period; inProgress: boolean; asOf: string }) {
  const { transactions, span, analysis, today, providers } = useLedger();
  if (!span) return null;
  const byMonth = totalsByMonth(transactions);
  const first = span.firstMonth;
  const total = (month: string) => byMonth.get(month) ?? 0;

  /** A second line under a change when either period holds one-time charges you confirmed. Nothing when there are none. */
  const oneTime = (current: Transaction[], earlier: Transaction[]) => {
    const n = oneTimeNote(current, earlier, analysis.typeOf, sumCents);
    return n ? (
      <span className="side-note" title={describeOneTime(n)}>
        <span className="nowrap">{formatSignedNoBreak(n.withoutCents)}</span> without one-time
      </span>
    ) : null;
  };

  let tiles: Tile[];
  if (period.kind === 'month') {
    const m = period.month;
    const prev = addMonths(m, -1);
    const cur = total(m);
    const before = total(prev);
    const hasPrev = prev >= first;
    const day = dayOf(asOf);
    const prevSame = monthTotalThroughDay(transactions, prev, day);
    const y = yearOf(m);
    const yearMonths = span.months.filter((x) => yearOf(x) === y);
    const yearTotal = sumCents(filterPeriod(transactions, { kind: 'year', year: y }));
    const yearSoFar = y === yearOf(monthOf(today > span.lastDate ? today : span.lastDate));

    let comparison: Tile;
    if (!hasPrev) comparison = { key: 'cmp', label: 'vs previous month', value: '—', meta: 'Before recorded history' };
    else if (inProgress)
      comparison = {
        key: 'cmp',
        label: `vs same point in ${monthShort(prev)}`,
        value: <Change before={prevSame} after={cur} showPct={false} />,
        meta: (
          <>
            {monthShort(prev)} 1–{day}: {formatEUR(prevSame)}
            {oneTime(monthDrillDown(transactions, m), monthDrillDown(transactions, prev, day))}
          </>
        ),
      };
    else if (before > 0)
      comparison = {
        key: 'cmp',
        label: 'vs previous month',
        value: <Change before={before} after={cur} />,
        meta: (
          <>
            {monthShort(prev)}: {formatEUR(before)}
            {oneTime(monthDrillDown(transactions, m), monthDrillDown(transactions, prev))}
          </>
        ),
      };
    else comparison = { key: 'cmp', label: 'vs previous month', value: '—', meta: 'No spending the month before' };

    tiles = [
      { key: 'prev', label: `Previous month · ${monthLabel(prev)}`, value: hasPrev ? formatEUR(before) : '—', meta: hasPrev ? chargesText(rowsInMonths(transactions, prev, prev).length) : 'Before recorded history' },
      comparison,
      {
        key: 'year',
        label: `${y} ${yearSoFar ? 'so far' : 'total'}`,
        value: formatEUR(yearTotal),
        meta: `${monthShort(yearMonths[0])}–${monthShort(yearMonths[yearMonths.length - 1])}`,
      },
      {
        key: 'avg',
        label: 'Average per month',
        value: formatEUR(Math.round(yearTotal / yearMonths.length)),
        meta: `over ${yearMonths.length} month${yearMonths.length === 1 ? '' : 's'} of ${y}`,
      },
    ];
  } else if (period.kind === 'year') {
    const y = period.year;
    const months = span.months.filter((m) => yearOf(m) === y);
    const rows = filterPeriod(transactions, period);
    const yearTotal = sumCents(rows);
    const prevYearRows = filterPeriod(transactions, { kind: 'year', year: y - 1 });
    const hasPrev = prevYearRows.length > 0;
    // Like for like: the same calendar months of last year.
    const firstMM = months[0].slice(5);
    const lastMM = months[months.length - 1].slice(5);
    const samePrevRows = rowsInMonths(transactions, `${y - 1}-${firstMM}`, `${y - 1}-${lastMM}`);
    const samePrev = sumCents(samePrevRows);
    const partial = months.length < 12;
    const best = [...months].sort((a, b) => total(b) - total(a))[0];
    tiles = [
      { key: 'prev', label: `Previous year · ${y - 1}`, value: hasPrev ? formatEUR(sumCents(prevYearRows)) : '—', meta: hasPrev ? chargesText(prevYearRows.length) : 'No recorded data' },
      hasPrev
        ? {
            key: 'cmp',
            label: partial ? `vs same months of ${y - 1}` : `vs ${y - 1}`,
            value: <Change before={samePrev} after={yearTotal} showPct={false} />,
            meta: (
              <>
                {monthShort(months[0])}–{monthShort(months[months.length - 1])} {y - 1}: {formatEUR(samePrev)}
                {oneTime(rows, samePrevRows)}
              </>
            ),
          }
        : { key: 'cmp', label: `vs ${y - 1}`, value: '—', meta: 'No recorded data' },
      { key: 'avg', label: 'Average per month', value: formatEUR(Math.round(yearTotal / months.length)), meta: `over ${months.length} month${months.length === 1 ? '' : 's'}` },
      { key: 'high', label: 'Highest month', value: formatEUR(total(best)), meta: monthLabel(best) },
    ];
  } else {
    const grand = sumCents(transactions);
    const best = [...span.months].sort((a, b) => total(b) - total(a))[0];
    tiles = [
      { key: 'avg', label: 'Average per month', value: formatEUR(Math.round(grand / span.months.length)), meta: `over ${span.months.length} months` },
      { key: 'high', label: 'Highest month', value: formatEUR(total(best)), meta: monthLabel(best) },
      { key: 'charges', label: 'Charges', value: transactions.length, meta: `since ${monthLabel(first)}` },
      { key: 'providers', label: 'Providers', value: providers.length, meta: 'with at least one charge' },
    ];
  }

  return (
    <Card className="hero-tiles">
      <div className="tile-grid">
        {tiles.map((t) => (
          <StatTile key={t.key} label={t.label} value={t.value} meta={t.meta} />
        ))}
      </div>
    </Card>
  );
}
