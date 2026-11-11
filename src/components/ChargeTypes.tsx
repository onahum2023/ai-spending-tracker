import { Fragment, useEffect, useId, useMemo, useState } from 'react';
import { dateLabel } from '../lib/dates';
import { labelMap, labelOf, MAX_LABEL_LENGTH } from '../lib/labels';
import { formatEUR } from '../lib/money';
import type { SubscriptionReport } from '../lib/insights';
import { OVERRIDE_HELP, OVERRIDE_LABELS, typeLabel, WHY, type OverrideKind } from '../lib/overrides';
import { groupChargeTypes, listChargeTypes, patternsByChargeType, suggestedSetting, type ChargeTypeGroup, type ChargeTypeSummary, type TypePatterns } from '../lib/providerChargeTypes';
import type { Transaction } from '../lib/types';
import { useLedger } from '../store';
import { stoppedPills, StoppedDetail, SubscriptionDetail, subscriptionPills, type RowPill } from './SubscriptionDetail';
import { Card, Chevron, Disclosure, EmptyState, Pill, ReadChip } from './ui';

const mergePatterns = (list: (TypePatterns<Transaction> | undefined)[]): TypePatterns<Transaction> | undefined => {
  const present = list.filter((x): x is TypePatterns<Transaction> => Boolean(x));
  return present.length ? { active: present.flatMap((x) => x.active), stopped: present.flatMap((x) => x.stopped) } : undefined;
};

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
      placeholder="Claude Pro"
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

/** What the app reads about the recurring charges of a charge type (or plan): the patterns found, with how they were found. */
function PatternBlock({ patterns, report }: { patterns: TypePatterns<Transaction>; report: SubscriptionReport<Transaction> }) {
  return (
    <div className="type-patterns">
      <div className="type-detail-head">
        <ReadChip />
        <span className="meta">What the app reads about this charge type</span>
      </div>
      {patterns.active.map((s) => (
        <SubscriptionDetail key={`${s.merchant}|${s.pattern.firstDate}`} s={s} report={report} />
      ))}
      {patterns.stopped.map((s) => (
        <StoppedDetail key={`${s.merchant}|${s.pattern.firstDate}`} s={s} />
      ))}
      <Disclosure label="How are these found?">
        <p className="meta" style={{ margin: 0 }}>
          Monthly subscriptions are found from charge patterns (the same provider on a similar day and amount for 3+ months in a row),
          so they are observations, not confirmed. A charge has no plan name, so plan changes are inferred. A yearly subscription can't
          be told from a one-off charge: set this charge type to "Subscription · yearly" in its settings above.
        </p>
      </Disclosure>
    </div>
  );
}

const hasPatterns = (p?: TypePatterns<Transaction>) => Boolean(p && (p.active.length || p.stopped.length));

const rowPills = (patterns: TypePatterns<Transaction> | undefined, report: SubscriptionReport<Transaction>): RowPill[] =>
  patterns ? [...patterns.active.flatMap((s) => subscriptionPills(s, report)), ...patterns.stopped.flatMap((s) => stoppedPills(s))] : [];

function Pills({ pills }: { pills: RowPill[] }) {
  return (
    <span className="type-pills">
      {pills.map((p) => (
        <Pill key={p.text} kind={p.kind}>
          {p.text}
        </Pill>
      ))}
    </span>
  );
}

/** The chevron that opens a row. */
function Toggle({ open, onClick, panelId, label }: { open: boolean; onClick: () => void; panelId: string; label: string }) {
  return (
    <button type="button" className="row-toggle" aria-expanded={open} aria-controls={panelId} aria-label={label} onClick={onClick}>
      <Chevron open={open} />
    </button>
  );
}

/**
 * Two or more charge types of one provider that carry the same label are one plan ("Claude Pro" on CLAUDE.AI SUBSCRIPTION and
 * on ANTHROPIC* CLAUDE SUB). They sit together under the plan's name, with the totals of the whole plan; each keeps its own row
 * and its own setting, and the ledger keeps every descriptor.
 */
function PlanHeader({ g, patterns, report }: { g: ChargeTypeGroup; patterns?: TypePatterns<Transaction>; report: SubscriptionReport<Transaction> }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const detail = hasPatterns(patterns);
  return (
    <>
      <tr className="plan-head">
        <td>
          <div className="type-name">
            {detail ? <Toggle open={open} onClick={() => setOpen((o) => !o)} panelId={panelId} label={`What the app reads about ${g.plan}`} /> : <span className="row-toggle-spacer" />}
            <div>
              <div className="type-label" style={{ fontWeight: 600 }}>{g.plan}</div>
              <div className="meta">{g.types.length} descriptors, read as one plan</div>
            </div>
          </div>
        </td>
        <td className="meta">Each descriptor has its own type</td>
        <td className="amount">{g.count}</td>
        <td className="amount">{formatEUR(g.totalCents)}</td>
        <td className="date nowrap">{dateLabel(g.lastDate)}</td>
        <td>
          <Pills pills={rowPills(patterns, report).slice(0, 3)} />
        </td>
      </tr>
      {detail && (
        <tr id={panelId} hidden={!open} className="type-detail">
          <td colSpan={6}>
            <PatternBlock patterns={patterns!} report={report} />
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * A charge type, read by default: its label (or its description on the statement), what it is read as, how many charges, the
 * total, the last charge and what is worth a look. Everything you can change, and what the app reads about it, is in the row
 * that opens under it.
 */
function ChargeTypeRow({ t, patterns, report, member = false }: { t: ChargeTypeSummary; patterns?: TypePatterns<Transaction>; report: SubscriptionReport<Transaction>; member?: boolean }) {
  const { setOverride } = useLedger();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const suggested = suggestedSetting(t.guess);
  const reviewed = t.setting !== null;
  const guessText = typeLabel(t.guess);
  const pills: RowPill[] = [...(reviewed ? [] : [{ text: 'App’s guess', kind: 'inferred' as const }]), ...rowPills(patterns, report)];
  return (
    <>
      <tr className={member ? 'plan-member' : undefined}>
        <td>
          <div className="type-name">
            <Toggle open={open} onClick={() => setOpen((o) => !o)} panelId={panelId} label={`Settings and details of ${t.name}`} />
            <div title={t.rawVariants > 1 ? `${t.rawVariants} slightly different descriptions on the statement` : t.merchant.trim()}>
              {t.label ? <span className="type-label">{t.label}</span> : <span className="mono">{t.name}</span>}
            </div>
          </div>
        </td>
        <td>{reviewed ? OVERRIDE_LABELS[t.setting!] : guessText}</td>
        <td className="amount">{t.count}</td>
        <td className="amount">{formatEUR(t.totalCents)}</td>
        <td className="date nowrap">{dateLabel(t.lastDate)}</td>
        <td>
          <Pills pills={pills} />
        </td>
      </tr>
      <tr id={panelId} hidden={!open} className="type-detail">
        <td colSpan={6}>
          <div className="detail-edit">
            <label className="field">
              Label
              <LabelInput provider={t.provider} merchant={t.merchant} />
            </label>
            <label className="field">
              Type
              <select
                className="select"
                value={t.setting ?? ''}
                aria-label={`Charge type of ${t.name}`}
                title={`Applies to all ${t.count} charge${t.count === 1 ? '' : 's'} of this type, and to new ones you import. Totals never change.`}
                onChange={(e) => void setOverride(t.provider, t.merchant, (e.target.value || null) as OverrideKind | null)}
              >
                <option value="">{reviewed ? `Reset: let the app guess (${guessText})` : `App’s guess: ${guessText}`}</option>
                {OPTIONS.map((k) => (
                  <option key={k} value={k}>
                    {OVERRIDE_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
            {!reviewed && (
              <button className="btn" onClick={() => void setOverride(t.provider, t.merchant, suggested)} aria-label={`Confirm ${t.name} as ${OVERRIDE_LABELS[suggested]}`}>
                Confirm {OVERRIDE_LABELS[suggested]}
              </button>
            )}
          </div>
          <p className="meta" title={reviewed ? undefined : WHY[t.guess.source]}>
            {reviewed ? OVERRIDE_HELP[t.setting!] : WHY[t.guess.source]}
          </p>
          <p className="meta">
            Statement description: <span className="mono">{t.descriptor}</span>
            {t.rawVariants > 1 ? ` · ${t.rawVariants} variations of it` : ''}
          </p>
          {hasPatterns(patterns) && <PatternBlock patterns={patterns!} report={report} />}
        </td>
      </tr>
    </>
  );
}

/**
 * The charge types of one provider, and the one place where you say what each is: Subscription (monthly or yearly), Usage or
 * One-time / Other. A setting carries over to every charge of that charge type, past and future. Overview, Insights and the
 * Transactions page only show the result.
 */
export function ChargeTypesCard({ rows }: { provider: string; rows: Transaction[] }) {
  const { overrides, labels, analysis, setOverrides } = useLedger();
  const types = useMemo(() => listChargeTypes(rows, overrides, labels, analysis.typeOf), [rows, overrides, labels, analysis]);
  // The recurring charges the app found, each attached to the charge type of its latest charge.
  const report = analysis.report;
  const byType = useMemo(() => patternsByChargeType(report), [report]);
  const groups = useMemo(() => groupChargeTypes(types), [types]);
  const toReview = types.filter((t) => t.setting === null);
  return (
    <Card
      title="Charge types"
      subtitle="Each charge type is a distinct line on your statement"
    >
      {toReview.length > 0 && (
        <div className="card-toolbar">
          <button
            className="btn btn-primary"
            onClick={() => void setOverrides(toReview.map((t) => ({ provider: t.provider, merchant: t.merchant, kind: suggestedSetting(t.guess) })))}
          >
            Confirm all {toReview.length} guess{toReview.length === 1 ? '' : 'es'}
          </button>
          <span className="meta">Open a row to change its label or type.</span>
        </div>
      )}
      {types.length === 0 ? (
        <EmptyState>No charges.</EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Charge type</th>
                <th>Type</th>
                <th className="amount">Charges</th>
                <th className="amount">Total</th>
                <th>Last charge</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) =>
                g.plan ? (
                  <Fragment key={g.types.map((t) => t.key).join('|')}>
                    <PlanHeader g={g} patterns={mergePatterns(g.types.map((t) => byType.get(t.key)))} report={report} />
                    {g.types.map((t) => (
                      <ChargeTypeRow key={t.key} t={t} report={report} member />
                    ))}
                  </Fragment>
                ) : (
                  <ChargeTypeRow key={g.types[0].key} t={g.types[0]} patterns={byType.get(g.types[0].key)} report={report} />
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
