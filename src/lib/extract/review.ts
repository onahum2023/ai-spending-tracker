// Shared by both ways of asking Claude (API key, or copy-and-paste into a chat).
// Kept free of the Anthropic SDK and zod so the chat route loads nothing heavy.
import { centsToPlain } from '../money';
import type { Classified } from './classify';
import { foreignAmount } from './parse';
import { SERVICE_TYPES, type ServiceType } from './types';
import { VENDORS } from './vendors';

export interface Verdict {
  id: string;
  is_ai_spending: boolean;
  provider: string | null;
  type: ServiceType | null;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

/** Exactly what leaves the browser for one line: no file names, references, addresses or free-text details. */
export function payloadFor(c: Classified, id: string) {
  return {
    id,
    date: c.row.date,
    amount_eur: centsToPlain(c.row.amountCents),
    merchant: c.row.merchant,
    bank_label: c.row.label ?? null,
    foreign_amount: foreignAmount(c.row.details) || null,
    country: c.row.country ?? null,
    rule_note: c.reasons.join('; '),
  };
}

export const SYSTEM = `You classify lines from a person's bank and card statements for an app that tracks spending on AI products.

For each line decide:
- is_ai_spending: true if the charge is for an AI product or API, or for infrastructure clearly used to build AI apps (hosting, domains, developer tools). Shops, travel, food, storage-only plans and general software are false.
- provider: the company being paid, using one of these names when it matches: ${[...new Set(VENDORS.map((v) => v.provider))].join(', ')}. Otherwise the vendor's common name. null when is_ai_spending is false.
- type: one of ${SERVICE_TYPES.join(', ')} (subscription = recurring plan; usage = API credits, top-ups or metered usage; certification = exams or courses; domains; hosting = hosting or cloud infrastructure; other). null when is_ai_spending is false.
- confidence: high, medium or low. Use low when the line alone cannot settle it (e.g. a generic app-store charge).
- reason: one short sentence a non-technical person understands. Mention the clue you used (merchant name, amount pattern, location).

The rule_note field says why the app's built-in rules were unsure. Payment processors (e.g. "Bck*" = Buckaroo, "Paddle", "Stripe") prefix the real merchant. Do not guess beyond the evidence. Return one result per input id.`;

/** Applies verdicts. Low-confidence answers stay in review, with the note added. */
export function applyVerdicts(items: Classified[], verdicts: Map<string, Verdict>): Classified[] {
  return items.map((c) => {
    const v = verdicts.get(c.row.id);
    if (!v) return c;
    const note = `Claude (${v.confidence} confidence): ${v.reason}`;
    if (v.confidence === 'low') return { ...c, reasons: [...c.reasons, note], by: 'claude' };
    if (v.is_ai_spending) {
      return { ...c, decision: 'include', provider: v.provider ?? c.provider, type: v.type ?? c.type ?? 'other', reasons: [...c.reasons, note], by: 'claude' };
    }
    return { ...c, decision: 'exclude', reasons: [...c.reasons, note], by: 'claude' };
  });
}
