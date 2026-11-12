import type { ReactNode } from 'react';
import { formatEUR, sumCents } from '../lib/money';
import { monthShort } from '../lib/dates';
import { heroLabel } from './OverviewHero';
import { useOverviewData } from './OverviewParts';
import { useLedger } from '../store';
import { EXAMPLE_LINES } from '../content/welcome';
import { Card, Change, Pill, ProviderAvatar, ReadChip, StreamName } from './ui';

/**
 * Three example insights for the Welcome page, built from the demo ledger with the app's own pieces (avatar, amount, pill), so what
 * they say is what the app says. They must be rendered inside a demo-only ledger. Each has one plain line under it.
 */
export function WelcomeExamples() {
  return (
    <div className="w-examples">
      <Example line={EXAMPLE_LINES[0]}>
        <MonthlyTotalExample />
      </Example>
      <Example line={EXAMPLE_LINES[1]}>
        <PriceChangeExample />
      </Example>
      <Example line={EXAMPLE_LINES[2]}>
        <OverlapExample />
      </Example>
    </div>
  );
}

function Example({ line, children }: { line: string; children: ReactNode }) {
  return (
    <div className="w-example">
      <Card>{children}</Card>
      <p className="w-example-line">{line}</p>
    </div>
  );
}

/** Your monthly total, and where it is heading this month. */
function MonthlyTotalExample() {
  const data = useOverviewData();
  if (!data) return null;
  const { period, inProgress, yearInProgress, asOf, periodRows, forecast } = data;
  return (
    <div className="stack">
      <div>
        <div className="section-label">{heroLabel(period, inProgress, yearInProgress, asOf)}</div>
        <div className="amt-key num">{formatEUR(sumCents(periodRows))}</div>
      </div>
      {inProgress && forecast.status === 'ok' && (
        <div className="hero-est">
          {forecast.stillToComeCents > 0 && <span className="swatch-hatch" aria-hidden="true" />}
          <span>
            at least <strong className="num">{formatEUR(forecast.atLeastCents)}</strong> by month end
          </span>
          <ReadChip>Estimate</ReadChip>
        </div>
      )}
    </div>
  );
}

/** A price change on a plan: the biggest rise the demo data has (or the biggest move, if nothing rose). */
function PriceChangeExample() {
  const { analysis } = useLedger();
  const changes = analysis.report.priceChanges;
  const rises = changes.filter((c) => c.toCents > c.fromCents);
  const pool = rises.length ? rises : changes;
  const c = [...pool].sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))[0];
  if (!c) return null;
  const up = c.toCents > c.fromCents;
  return (
    <div className="stack">
      <div className="row-between">
        <span className="row">
          <ProviderAvatar provider={c.provider} size={28} />
          <span className="due-text">
            <strong>{c.provider}</strong>
            <StreamName provider={c.provider} merchant={c.merchant} labelOnly />
          </span>
        </span>
        <Pill kind="attention">
          Price {up ? 'up' : 'down'} in {monthShort(c.month)}
        </Pill>
      </div>
      <div>
        <div className="amt-key num">
          <Change before={c.fromCents} after={c.toCents} />
        </div>
        <div className="meta num">
          {formatEUR(c.fromCents)} → {formatEUR(c.toCents)}
        </div>
      </div>
    </div>
  );
}

/** Overlapping services, and what ending one would save: the biggest overlap the demo data has. */
function OverlapExample() {
  const { analysis } = useLedger();
  const g = analysis.report.overlaps[0];
  if (!g) return null;
  return (
    <div className="stack">
      <div className="row-between">
        <strong>{g.sentence.split(' · ')[0]}</strong>
        <Pill kind="attention">Overlap</Pill>
      </div>
      <div className="meta num">{formatEUR(g.combinedMonthlyCents)}/month combined</div>
      <div className="w-overlap-list">
        {g.members.map((m) => (
          <div key={m.provider} className="row-between">
            <span className="row">
              <ProviderAvatar provider={m.provider} size={24} />
              {m.provider}
            </span>
            <span className="num amt-row">
              {formatEUR(m.monthlyCents * 12)}
              <span className="meta">/year</span>
            </span>
          </div>
        ))}
      </div>
      <p className="meta">Ending one would save its yearly cost.</p>
    </div>
  );
}
