import { useEffect, useId, useMemo, useState } from 'react';
import { dateLabel } from '../lib/dates';
import { labelMap, labelOf, MAX_LABEL_LENGTH } from '../lib/labels';
import { formatEUR } from '../lib/money';
import type { SubscriptionReport } from '../lib/insights';
import { OVERRIDE_HELP, OVERRIDE_LABELS, typeLabel, WHY, type OverrideKind } from '../lib/overrides';
import { listChargeTypes, patternsByChargeType, suggestedSetting, type ChargeTypeSummary, type TypePatterns } from '../lib/providerChargeTypes';
import type { Transaction } from '../lib/types';
import { useLedger } from '../store';
import { stoppedPills, StoppedDetail, SubscriptionDetail, subscriptionPills, type Pill } from './SubscriptionDetail';
import { Card, Chevron, Disclosure, EmptyState, ReadChip } from './ui';

const OPTIONS: OverrideKind[] = ['monthly', 'yearly', 'usage', 'other'];

/** A small text box for the label of a charge type. Saves when you leave it or press Enter; empty removes the label. */
function LabelInput({ provider, merchant }: { provider: string; merchant: string }) {
  const { labels, setLabel } = useLedger();
  const saved = labelOf(labelMap(labels), provider, merchant) ?? '';
  const [text, setText] = useState(saved);
  useEffect(() => setText(saved), [saved]);
  const commit = () => {
    if (text.trim() !== saved) void setLabel(provider, merchant, text);
  };
  return (
    <input
      className="input input-sm label-input"
      value={text}
      maxLength={MAX_LABEL_LENGTH}
      placeholder="Add a label, e.g. Claude Pro"
      aria-label={`Label for ${provider} charge type ${merchant.trim()}`}
      title="A name for this charge type, shown instead of the description. Charges and totals never change."
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setText(saved);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

function ChargeTypeRow({ t, patterns, report }: { t: ChargeTypeSummary; patterns?: TypePatterns<Transaction>; report: SubscriptionReport<Transaction> }) {
  const { setOverride } = useLedger();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const suggested = suggestedSetting(t.guess);
  const reviewed = t.setting !== null;
  const guessText = typeLabel(t.guess);
  const hasDetail = Boolean(patterns && (patterns.active.length || patterns.stopped.length));
  const pills: Pill[] = patterns
    ? [...patterns.active.flatMap((s) => subscriptionPills(s, report)), ...patterns.stopped.flatMap((s) => stoppedPills(s))]
    : [];
  return (
    <>
    <tr>
      <td>
        <div className="type-name">
          {hasDetail ? (
            <button
              type="button"
              className="row-toggle"
              aria-expanded={open}
              aria-controls={panelId}
              aria-label={`What the app reads about ${t.name}`}
              title="What the app reads about this charge type"
              onClick={() => setOpen((o) => !o)}
            >
              <Chevron open={open} />
            </button>
          ) : (
            <span className="row-toggle-spacer" />
          )}
          <div>
            <div style={{ fontWeight: 500 }} title={t.rawVariants > 1 ? `${t.rawVariants} slightly different descriptions on the statement` : t.merchant.trim()}>
              {t.name}
            </div>
            {pills.length > 0 && (
              <span className="type-pills">
                {pills.slice(0, 2).map((p) => (
                  <span key={p.text} className={`chip ${p.cls}`.trim()}>{p.text}</span>
                ))}
              </span>
            )}
            {t.label && <div className="small muted merchant-line">{t.descriptor}</div>}
            {!t.label && t.rawVariants > 1 && <div className="small muted">{t.rawVariants} variations of the description</div>}
            <div style={{ marginTop: 4 }}>
              <LabelInput provider={t.provider} merchant={t.merchant} />
            </div>
          </div>
        </div>
      </td>
      <td className="amount">{t.count}</td>
      <td className="amount">{formatEUR(t.totalCents)}</td>
      <td className="date nowrap">{dateLabel(t.lastDate)}</td>
      <td>
        <select
          className="select input-sm"
          value={t.setting ?? ''}
          aria-label={`Charge type of ${t.name}`}
          title={`Applies to all ${t.count} charge${t.count === 1 ? '' : 's'} of this type, and to new ones you import. Totals never change.`}
          onChange={(e) => void setOverride(t.provider, t.merchant, (e.target.value || null) as OverrideKind | null)}
        >
          <option value="">{reviewed ? `Reset: let the app guess (${guessText})` : `Suggested: ${guessText}`}</option>
          {OPTIONS.map((k) => (
            <option key={k} value={k}>
              {OVERRIDE_LABELS[k]}
            </option>
          ))}
        </select>
        {reviewed && <div className="small muted">{OVERRIDE_HELP[t.setting!]}</div>}
        {!reviewed && (
          <div className="small muted" title={WHY[t.guess.source]}>
            {WHY[t.guess.source]}
          </div>
        )}
      </td>
      <td>
        {reviewed ? (
          <span className="chip chip-active">Confirmed</span>
        ) : (
          <div className="stack" style={{ gap: 6, alignItems: 'flex-start' }}>
            <span className="chip chip-warn">To review</span>
            <button
              className="btn btn-sm"
              onClick={() => void setOverride(t.provider, t.merchant, suggested)}
              aria-label={`Confirm ${t.name} as ${OVERRIDE_LABELS[suggested]}`}
            >
              Confirm
            </button>
          </div>
        )}
      </td>
    </tr>
    {hasDetail && (
      <tr id={panelId} hidden={!open} className="type-detail">
        <td colSpan={6}>
          <div className="type-detail-head">
            <ReadChip />
            <span className="small muted">What the app reads about this charge type</span>
          </div>
          {patterns!.active.map((s) => (
            <SubscriptionDetail key={`${s.merchant}|${s.pattern.firstDate}`} s={s} report={report} />
          ))}
          {patterns!.stopped.map((s) => (
            <StoppedDetail key={`${s.merchant}|${s.pattern.firstDate}`} s={s} />
          ))}
          <Disclosure label="How are these found?">
            <p className="small muted" style={{ margin: 0 }}>
              Monthly subscriptions are found from charge patterns (the same provider on a similar day and amount for 3+ months in a row),
              so they are observations, not confirmed. A charge has no plan name, so plan changes are inferred. A yearly subscription can't
              be told from a one-off charge: set this charge type to "Subscription · yearly" in this table.
            </p>
          </Disclosure>
        </td>
      </tr>
    )}
    </>
  );
}

/**
 * The charge types of one provider, and the one place where you say what each is: Subscription (monthly or yearly), Usage or
 * One-time / Other. A setting carries over to every charge of that charge type, past and future. Overview, Insights and the
 * Transactions page only show the result.
 */
export function ChargeTypesCard({ rows, actions }: { provider: string; rows: Transaction[]; actions?: React.ReactNode }) {
  const { overrides, labels, analysis, setOverrides } = useLedger();
  const types = useMemo(() => listChargeTypes(rows, overrides, labels, analysis.typeOf), [rows, overrides, labels, analysis]);
  // The recurring charges the app found, each attached to the charge type of its latest charge.
  const report = analysis.report;
  const byType = useMemo(() => patternsByChargeType(report), [report]);
  const toReview = types.filter((t) => t.setting === null);
  return (
    <Card
      title="Charge types"
      subtitle={
        types.length === 1
          ? 'This provider has one kind of charge. Say what it is: it applies to every charge of this type, past and future.'
          : `${types.length} kinds of charge, told apart by the statement description. Say what each is: it applies to every charge of that type, past and future.`
      }
      actions={
        <div className="row wrap" style={{ gap: 12 }}>
          {actions}
          {toReview.length > 0 && (
            <button
              className="btn btn-sm btn-primary"
              onClick={() => void setOverrides(toReview.map((t) => ({ provider: t.provider, merchant: t.merchant, kind: suggestedSetting(t.guess) })))}
            >
              Confirm all {toReview.length} suggestion{toReview.length === 1 ? '' : 's'}
            </button>
          )}
        </div>
      }
    >
      {types.length === 0 ? (
        <EmptyState>No charges.</EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Charge type</th>
                <th className="amount">Charges</th>
                <th className="amount">Total</th>
                <th>Last charge</th>
                <th>Type</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {types.map((t) => (
                <ChargeTypeRow key={t.key} t={t} patterns={byType.get(t.key)} report={report} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
