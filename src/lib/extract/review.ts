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

/** Ids sent to the model are r1, r2, ... in list order; this maps them back to statement row ids. */
export function lineIds(items: Classified[]): Map<string, string> {
  return new Map(items.map((c, i) => [`r${i + 1}`, c.row.id]));
}

/** The whole message for pasting into a chat: instructions, the lines, and the exact reply format wanted. */
export function buildChatPrompt(items: Classified[]): string {
  const lines = items.map((c, i) => payloadFor(c, `r${i + 1}`));
  return `${SYSTEM}

Reply with ONLY one JSON object (no other text), in this exact shape:
{"results":[{"id":"r1","is_ai_spending":true,"provider":"Anthropic","type":"subscription","confidence":"high","reason":"..."}]}

Statement lines (JSON):
${JSON.stringify(lines, null, 1)}`;
}

/** claude.ai prefills the message box from ?q=. Only worth trying while the URL stays short. */
export const CHAT_URL_MAX = 7000;
export function chatUrl(prompt: string): string | null {
  const url = `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;
  return url.length <= CHAT_URL_MAX ? url : null;
}

const CONFIDENCE = new Set(['high', 'medium', 'low']);

/**
 * Reads the JSON a chat answered with. Tolerates code fences and chatter around it.
 * Entries that are malformed or name an unknown id are skipped and counted.
 */
export function parseChatAnswer(text: string, ids: Map<string, string>): { verdicts: Map<string, Verdict>; skipped: number } {
  // Whichever of { or [ comes first decides whether the answer is an object or a bare list.
  const o = text.indexOf('{');
  const l = text.indexOf('[');
  const isList = l >= 0 && (o < 0 || l < o);
  const open = isList ? l : o;
  const close = isList ? text.lastIndexOf(']') : text.lastIndexOf('}');
  let data: unknown;
  try {
    if (open < 0 || close < open) throw new Error('no json');
    data = JSON.parse(text.slice(open, close + 1));
  } catch {
    throw new Error('Could not read that as JSON. Paste the whole answer, starting at the opening { .');
  }
  const list = Array.isArray(data) ? data : (data as { results?: unknown })?.results;
  if (!Array.isArray(list)) throw new Error('The answer has no "results" list.');
  const verdicts = new Map<string, Verdict>();
  let skipped = 0;
  for (const v of list as Record<string, unknown>[]) {
    const rowId = typeof v?.id === 'string' ? ids.get(v.id) : undefined;
    const type = v?.type === null || v?.type === undefined ? null : (SERVICE_TYPES as readonly unknown[]).includes(v.type) ? (v.type as ServiceType) : undefined;
    if (
      !rowId ||
      typeof v.is_ai_spending !== 'boolean' ||
      type === undefined ||
      !CONFIDENCE.has(v.confidence as string) ||
      (v.provider !== null && v.provider !== undefined && typeof v.provider !== 'string')
    ) {
      skipped++;
      continue;
    }
    verdicts.set(rowId, {
      id: v.id as string,
      is_ai_spending: v.is_ai_spending,
      provider: typeof v.provider === 'string' && v.provider.trim() ? v.provider.trim() : null,
      type,
      confidence: v.confidence as Verdict['confidence'],
      reason: typeof v.reason === 'string' ? v.reason : '',
    });
  }
  if (verdicts.size === 0) throw new Error('None of the answers matched these lines. Make sure you pasted the reply to this prompt.');
  return { verdicts, skipped };
}

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
