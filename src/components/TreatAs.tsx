import { OVERRIDE_LABELS, overrideMap, overrideOf, streamSize, type OverrideKind } from '../lib/overrides';
import { useLedger } from '../store';

const OPTIONS: { value: '' | OverrideKind; label: string }[] = [
  { value: '', label: 'Automatic' },
  { value: 'subscription', label: OVERRIDE_LABELS.subscription },
  { value: 'usage', label: OVERRIDE_LABELS.usage },
  { value: 'ignore', label: OVERRIDE_LABELS.ignore },
];

/**
 * Lets the user correct how a stream of charges (same provider and merchant descriptor) is
 * treated. It never changes a charge or any total, only how detection reads the stream.
 */
export function TreatAs({ provider, merchant, label = 'Treat as' }: { provider: string; merchant: string; label?: string }) {
  const { overrides, setOverride, transactions } = useLedger();
  const current = overrideOf(overrideMap(overrides), { provider, merchant }) ?? '';
  const n = streamSize(transactions, provider, merchant);
  return (
    <select
      className="select input-sm treat-as"
      value={current}
      aria-label={`${label}: ${provider}, ${merchant.trim()}`}
      title={`Applies to all ${n} charge${n === 1 ? '' : 's'} from ${provider} with this descriptor. Totals never change.`}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => void setOverride(provider, merchant, (e.target.value || null) as OverrideKind | null)}
    >
      {OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
