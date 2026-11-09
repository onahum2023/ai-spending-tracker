import { OVERRIDE_HELP, OVERRIDE_LABELS, streamSize } from '../lib/overrides';
import { useLedger } from '../store';
import { Card, ProviderLink } from './ui';

/** Every correction the user made, with a way back to automatic. */
export function OverridesCard() {
  const { overrides, setOverride, transactions } = useLedger();
  if (overrides.length === 0) return null;
  return (
    <Card
      title="Your corrections"
      subtitle="Charge types you set yourself. Reset puts a stream back to automatic. Charges and totals are never changed."
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
          </tbody>
        </table>
      </div>
    </Card>
  );
}
