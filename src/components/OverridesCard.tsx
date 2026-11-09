import { OVERRIDE_LABELS, streamSize } from '../lib/overrides';
import { useLedger } from '../store';
import { Card, ProviderLink } from './ui';

const HELP = {
  subscription: 'Counted as a monthly subscription, even if the charges do not form a clean pattern.',
  usage: 'Never a subscription: counted as usage.',
  ignore: 'Left out of the subscription views.',
} as const;

/** Every correction the user made, with a way back to automatic. */
export function OverridesCard() {
  const { overrides, setOverride, transactions } = useLedger();
  if (overrides.length === 0) return null;
  return (
    <Card
      title="Your corrections"
      subtitle="How you told the app to read these charges. Reset puts a stream back to automatic. Charges and totals are never changed."
    >
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Provider and descriptor</th>
              <th>Treated as</th>
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
                    <div className="small muted">{HELP[o.kind]}</div>
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
