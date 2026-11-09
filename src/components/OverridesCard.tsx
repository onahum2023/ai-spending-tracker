import { dateLabel } from '../lib/dates';
import { formatEUR } from '../lib/money';
import { OVERRIDE_HELP, OVERRIDE_LABELS, streamSize } from '../lib/overrides';
import { useLedger } from '../store';
import { Card, ProviderLink } from './ui';

/** Every correction the user made, with a way back to automatic. */
export function OverridesCard() {
  const { overrides, setOverride, transactions, chargeOverrides, setChargeOverride } = useLedger();
  const byId = new Map(transactions.map((t) => [t.id, t]));
  // A correction for a charge that no longer exists has nothing to show or reset.
  const singles = chargeOverrides.flatMap((o) => {
    const tx = byId.get(o.id);
    return tx ? [{ ...o, tx }] : [];
  });
  if (overrides.length === 0 && singles.length === 0) return null;
  return (
    <Card
      title="Your corrections"
      subtitle="Charge types you set yourself, for a whole stream or for a single charge. Reset puts it back. Charges and totals are never changed."
    >
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Provider and descriptor</th>
              <th>Type</th>
              <th className="amount">Charges</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {overrides.map((o) => {
              const n = streamSize(transactions, o.provider, o.merchant);
              return (
                <tr key={o.provider + o.merchant}>
                  <td>
                    {n > 0 ? <ProviderLink provider={o.provider} /> : <span style={{ fontWeight: 500 }}>{o.provider}</span>}
                    <div className="small muted merchant-line">{o.merchant.trim().replace(/\s{2,}/g, ' · ')}</div>
                  </td>
                  <td>
                    <span className="chip">{OVERRIDE_LABELS[o.kind]}</span>
                    <div className="small muted">{OVERRIDE_HELP[o.kind]}</div>
                  </td>
                  <td className="amount">{n}</td>
                  <td className="amount">
                    <button className="btn btn-sm" onClick={() => void setOverride(o.provider, o.merchant, null)}>
                      Reset to automatic
                    </button>
                  </td>
                </tr>
              );
            })}
            {singles.map(({ id, kind, tx }) => (
              <tr key={`charge-${id}`}>
                <td>
                  <ProviderLink provider={tx.provider} />
                  <div className="small muted merchant-line">
                    One charge: {dateLabel(tx.date)} · {formatEUR(tx.amountCents)} · {tx.merchant.trim().replace(/\s{2,}/g, ' · ')}
                  </div>
                </td>
                <td>
                  <span className="chip">{OVERRIDE_LABELS[kind]}</span>
                  <div className="small muted">Just this charge. It beats the type of its stream.</div>
                </td>
                <td className="amount">1</td>
                <td className="amount">
                  <button className="btn btn-sm" onClick={() => void setChargeOverride(id, null)}>
                    Reset to its stream
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
