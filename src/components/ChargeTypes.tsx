import { useEffect, useMemo, useState } from 'react';
import { dateLabel } from '../lib/dates';
import { labelMap, labelOf, MAX_LABEL_LENGTH } from '../lib/labels';
import { formatEUR } from '../lib/money';
import { OVERRIDE_HELP, OVERRIDE_LABELS, WHY, type OverrideKind, type TypeInfo } from '../lib/overrides';
import { listChargeTypes, suggestedSetting, type ChargeTypeSummary } from '../lib/providerChargeTypes';
import type { Transaction } from '../lib/types';
import { useLedger } from '../store';
import { Card, EmptyState } from './ui';

const OPTIONS: OverrideKind[] = ['monthly', 'yearly', 'usage', 'other'];
const SHORT: Record<OverrideKind, string> = { monthly: 'Monthly', yearly: 'Yearly', usage: 'Usage', other: 'One-time' };

/**
 * What a kind of charge is, in one click. The app's guess has a dashed outline until you confirm it:
 * clicking the guess confirms it, clicking another option corrects it. Applies to every charge of this
 * type, past and future; totals never change.
 */
export function TypeControl({
  provider,
  merchant,
  name,
  setting,
  guess,
  count,
}: {
  provider: string;
  merchant: string;
  name: string;
  setting: OverrideKind | null;
  guess: TypeInfo;
  count: number;
}) {
  const { setOverride } = useLedger();
  const suggested = suggestedSetting(guess);
  return (
    <div className="type-control">
      <div className="type-seg" role="group" aria-label={`What kind of charge is ${name}?`}>
        {OPTIONS.map((k) => {
          const picked = setting === k;
          const isGuess = setting === null && k === suggested;
          return (
            <button
              key={k}
              type="button"
              className={picked ? 'is-picked' : isGuess ? 'is-guess' : undefined}
              aria-pressed={picked}
              title={`${OVERRIDE_LABELS[k]}: ${OVERRIDE_HELP[k]}`}
              onClick={() => void setOverride(provider, merchant, k)}
            >
              {SHORT[k]}
              {isGuess && <span className="sr-only"> (the app's guess, not confirmed yet)</span>}
            </button>
          );
        })}
      </div>
      <div className="type-note">
        {setting === null ? (
          <>The app's guess is outlined: click it to confirm, or pick another. {WHY[guess.source].replace(/\.?$/, '.')} </>
        ) : (
          <>
            {OVERRIDE_HELP[setting]}{' '}
            <button type="button" className="link-btn" onClick={() => void setOverride(provider, merchant, null)}>
              Go back to the app's guess
            </button>
            .{' '}
          </>
        )}
        Applies to {count === 1 ? 'this charge' : `all ${count} charges of this type`}, and to new ones.
      </div>
    </div>
  );
}

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

function ChargeTypeRow({ t }: { t: ChargeTypeSummary }) {
  const reviewed = t.setting !== null;
  return (
    <tr>
      <td>
        <div className="strong" title={t.rawVariants > 1 ? `${t.rawVariants} slightly different descriptions on the statement` : t.merchant.trim()}>
          {t.name}
        </div>
        {t.label && <div className="small muted merchant-line">{t.descriptor}</div>}
        {!t.label && t.rawVariants > 1 && <div className="small muted">{t.rawVariants} variations of the description</div>}
        <div className="mt-2">
          <LabelInput provider={t.provider} merchant={t.merchant} />
        </div>
      </td>
      <td className="amount">{t.count}</td>
      <td className="amount">{formatEUR(t.totalCents)}</td>
      <td className="date nowrap">{dateLabel(t.lastDate)}</td>
      <td className="type-cell">
        <TypeControl provider={t.provider} merchant={t.merchant} name={t.name} setting={t.setting} guess={t.guess} count={t.count} />
      </td>
      <td>
        {reviewed ? (
          <span className="chip chip-ok"><span aria-hidden="true">✓</span> Confirmed</span>
        ) : (
          <span className="chip chip-guess"><span aria-hidden="true">?</span> To confirm</span>
        )}
      </td>
    </tr>
  );
}

/**
 * The charge types of one provider, and the one place where you say what each is: Subscription (monthly or yearly), Usage or
 * One-time / Other. A setting carries over to every charge of that charge type, past and future. The Subscriptions page and the
 * Transactions page only show the result.
 */
export function ChargeTypesCard({ rows, actions }: { provider: string; rows: Transaction[]; actions?: React.ReactNode }) {
  const { overrides, labels, analysis, setOverrides } = useLedger();
  const types = useMemo(() => listChargeTypes(rows, overrides, labels, analysis.typeOf), [rows, overrides, labels, analysis]);
  const toReview = types.filter((t) => t.setting === null);
  return (
    <Card icon="check" tone="amber"
      title="Charge types"
      subtitle={
        types.length === 1
          ? 'This provider has one kind of charge. Say what it is: it applies to every charge of this type, past and future.'
          : `${types.length} kinds of charge, told apart by the statement description. Say what each is: it applies to every charge of that type, past and future.`
      }
      actions={
        <div className="row wrap gap-3">
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
                <ChargeTypeRow key={t.key} t={t} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
