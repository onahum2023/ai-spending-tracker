import { OVERRIDE_LABELS, overrideMap, overrideOf, streamSize, typeLabel, WHY, type OverrideKind } from '../lib/overrides';
import type { Transaction } from '../lib/types';
import { useLedger } from '../store';

const OPTIONS: { value: '' | OverrideKind; label: string }[] = [
  { value: '', label: 'Automatic' },
  { value: 'monthly', label: OVERRIDE_LABELS.monthly },
  { value: 'yearly', label: OVERRIDE_LABELS.yearly },
  { value: 'usage', label: OVERRIDE_LABELS.usage },
  { value: 'other', label: OVERRIDE_LABELS.other },
];

/**
 * Lets the user set the type of a stream of charges (same provider and merchant descriptor):
 * Subscription (monthly or yearly), Usage, or One-time / Other. While it is on Automatic, the
 * type the app guessed is shown underneath. It never changes a charge or any total.
 */
export function TreatAs({ provider, merchant, charge }: { provider: string; merchant: string; charge?: Transaction }) {
  const { overrides, setOverride, transactions, analysis, chargeOverrides, setChargeOverride } = useLedger();
  const own = charge ? chargeOverrides.find((o) => o.id === charge.id)?.kind ?? '' : '';
  const current = overrideOf(overrideMap(overrides), { provider, merchant }) ?? '';
  const n = streamSize(transactions, provider, merchant);
  const guess = current === '' ? analysis.streamInfo(provider, merchant) : null;
  return (
    <div className="treat-as-wrap" onClick={(e) => e.stopPropagation()}>
      <select
        className="select input-sm treat-as"
        value={current}
        aria-label={`Charge type: ${provider}, ${merchant.trim()}`}
        title={`Applies to all ${n} charge${n === 1 ? '' : 's'} from ${provider} with this descriptor. Totals never change.`}
        onChange={(e) => void setOverride(provider, merchant, (e.target.value || null) as OverrideKind | null)}
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {guess && !own && (
        <div className="small muted" title={WHY[guess.source]}>
          {typeLabel(guess)}
        </div>
      )}
      {charge && (
        <select
          className={`select input-sm treat-as${own ? ' treat-as-own' : ''}`}
          value={own}
          aria-label={`Type of this charge only: ${provider}, ${charge.date}`}
          title="Applies to this one charge and beats the type of its stream. Totals never change."
          onChange={(e) => void setChargeOverride(charge.id, (e.target.value || null) as OverrideKind | null)}
        >
          <option value="">Just this charge…</option>
          {OPTIONS.filter((o) => o.value).map((o) => (
            <option key={o.value} value={o.value}>
              This charge: {o.label}
            </option>
          ))}
        </select>
      )}
      {own && (
        <div className="small" style={{ color: 'var(--accent-ink)' }} title="This charge differs from the rest of its stream">
          Differs from its stream
        </div>
      )}
    </div>
  );
}
