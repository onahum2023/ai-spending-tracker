import { CATEGORY_LABELS } from '../lib/categories';
import { tidyDescriptor } from '../lib/labels';
import { OVERRIDE_HELP, OVERRIDE_LABELS, streamSize } from '../lib/overrides';
import { useLedger } from '../store';
import { Card, ProviderLink } from './ui';

/** Every correction the user made, with a way back to automatic. */
export function OverridesCard() {
  const { overrides, setOverride, transactions, labels, setLabel, providerCategories, setProviderCategory, tagRules, setTagRule } = useLedger();
  if (overrides.length === 0 && labels.length === 0 && providerCategories.length === 0 && tagRules.length === 0) return null;
  return (
    <Card
      title="Your corrections"
      subtitle="Charge types you set yourself, for a whole stream or for a single charge, the names you gave streams, categories you chose for providers, and tag rules. Reset puts it back. Charges and totals are never changed."
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
            {providerCategories.map((c) => (
              <tr key={`category-${c.provider}`}>
                <td>
                  <ProviderLink provider={c.provider} />
                  <div className="small muted merchant-line">Whole provider</div>
                </td>
                <td>
                  <span className="chip">Category: {CATEGORY_LABELS[c.category]}</span>
                  <div className="small muted">Used by charts, budgets and overlap instead of the built-in mapping.</div>
                </td>
                <td className="amount">{transactions.filter((t) => t.provider === c.provider).length}</td>
                <td className="amount">
                  <button className="btn btn-sm" onClick={() => void setProviderCategory(c.provider, null)}>
                    Reset to automatic
                  </button>
                </td>
              </tr>
            ))}
            {tagRules.map((r) => (
              <tr key={`tag-${r.provider}`}>
                <td>
                  <ProviderLink provider={r.provider} />
                  <div className="small muted merchant-line">Whole provider</div>
                </td>
                <td>
                  <span className="chip">Tag new charges: {r.tag}</span>
                  <div className="small muted">Applied on import to charges without a tag. Charges already stored are not changed.</div>
                </td>
                <td className="amount">{transactions.filter((t) => t.provider === r.provider).length}</td>
                <td className="amount">
                  <button className="btn btn-sm" onClick={() => void setTagRule(r.provider, null)}>
                    Remove rule
                  </button>
                </td>
              </tr>
            ))}
            {labels.map((l) => (
              <tr key={`label-${l.provider}${l.merchant}`}>
                <td>
                  <ProviderLink provider={l.provider} />
                  <div className="small muted merchant-line">{tidyDescriptor(l.merchant)}</div>
                </td>
                <td>
                  <span className="chip">Label: {l.label}</span>
                  <div className="small muted">Shown instead of the descriptor. The descriptor stays on hover.</div>
                </td>
                <td className="amount">{streamSize(transactions, l.provider, l.merchant)}</td>
                <td className="amount">
                  <button className="btn btn-sm" onClick={() => void setLabel(l.provider, l.merchant, null)}>
                    Remove label
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
