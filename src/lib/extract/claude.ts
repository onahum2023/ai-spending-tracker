// Opt-in only, loaded on demand: asks Claude about statement lines the rules could not decide.
// Uses the user's own API key, straight from the browser to api.anthropic.com.
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { centsToPlain } from '../money';
import type { Classified } from './classify';
import { summarizeDetails } from './parse';
import { SERVICE_TYPES, type ServiceType } from './types';
import { VENDORS } from './vendors';

export const CLAUDE_MODEL = 'claude-opus-5-5';
const BATCH = 60;

const Verdicts = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      is_ai_spending: z.boolean(),
      provider: z.string().nullable(),
      type: z.enum(SERVICE_TYPES).nullable(),
      confidence: z.enum(['high', 'medium', 'low']),
      reason: z.string(),
    }),
  ),
});
export type Verdict = z.infer<typeof Verdicts>['results'][number];

/** Exactly what leaves the browser for one line: no file names, references or addresses. */
export function payloadFor(c: Classified, id: string) {
  return {
    id,
    date: c.row.date,
    amount_eur: centsToPlain(c.row.amountCents),
    merchant: c.row.merchant,
    bank_label: c.row.label ?? null,
    foreign_amount: summarizeDetails(c.row.details) || null,
    country: c.row.country ?? null,
    rule_note: c.reasons.join('; '),
  };
}

const SYSTEM = `You classify lines from a person's bank and card statements for an app that tracks spending on AI products.

For each line decide:
- is_ai_spending: true if the charge is for an AI product or API, or for infrastructure clearly used to build AI apps (hosting, domains, developer tools). Shops, travel, food, storage-only plans and general software are false.
- provider: the company being paid, using one of these names when it matches: ${[...new Set(VENDORS.map((v) => v.provider))].join(', ')}. Otherwise the vendor's common name. null when is_ai_spending is false.
- type: one of ${SERVICE_TYPES.join(', ')} (subscription = recurring plan; usage = API credits, top-ups or metered usage; certification = exams or courses; domains; hosting = hosting or cloud infrastructure; other). null when is_ai_spending is false.
- confidence: high, medium or low. Use low when the line alone cannot settle it (e.g. a generic app-store charge).
- reason: one short sentence a non-technical person understands. Mention the clue you used (merchant name, amount pattern, location).

The rule_note field says why the app's built-in rules were unsure. Payment processors (e.g. "Bck*" = Buckaroo, "Paddle", "Stripe") prefix the real merchant. Do not guess beyond the evidence. Return one result per input id.`;

export class ClaudeError extends Error {}

export async function askClaude(
  apiKey: string,
  items: Classified[],
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, Verdict>> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 });
  const out = new Map<string, Verdict>();
  for (let start = 0; start < items.length; start += BATCH) {
    const batch = items.slice(start, start + BATCH);
    const ids = new Map(batch.map((c, i) => [`r${start + i + 1}`, c.row.id]));
    const lines = batch.map((c, i) => payloadFor(c, `r${start + i + 1}`));
    let response;
    try {
      response = await client.beta.messages.parse({
        model: CLAUDE_MODEL,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium', format: betaZodOutputFormat(Verdicts) },
        system: SYSTEM,
        messages: [{ role: 'user', content: `Statement lines (JSON):\n${JSON.stringify(lines, null, 1)}` }],
      });
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) throw new ClaudeError('The API key was rejected. Check it in the Anthropic Console.');
      if (e instanceof Anthropic.PermissionDeniedError) throw new ClaudeError('This API key is not allowed to use the model.');
      if (e instanceof Anthropic.RateLimitError) throw new ClaudeError('Rate limited by the Anthropic API. Wait a minute and try again.');
      if (e instanceof Anthropic.APIConnectionError) throw new ClaudeError('Could not reach the Anthropic API. Check your connection.');
      if (e instanceof Anthropic.APIError) throw new ClaudeError(`Anthropic API error ${e.status ?? ''}: ${e.message}`);
      throw e;
    }
    if (response.stop_reason === 'refusal') throw new ClaudeError('Claude declined to classify these lines.');
    if (response.stop_reason === 'max_tokens' || !response.parsed_output) throw new ClaudeError('Claude’s answer was incomplete. Try again with fewer lines.');
    for (const v of response.parsed_output.results) {
      const rowId = ids.get(v.id);
      if (rowId) out.set(rowId, v);
    }
    onProgress?.(Math.min(start + BATCH, items.length), items.length);
  }
  return out;
}

/** Applies Claude's verdicts. Low-confidence answers stay in review, with Claude's note added. */
export function applyVerdicts(items: Classified[], verdicts: Map<string, Verdict>): Classified[] {
  return items.map((c) => {
    const v = verdicts.get(c.row.id);
    if (!v) return c;
    const note = `Claude (${v.confidence} confidence): ${v.reason}`;
    if (v.confidence === 'low') return { ...c, reasons: [...c.reasons, note], by: 'claude' };
    if (v.is_ai_spending) {
      return { ...c, decision: 'include', provider: v.provider ?? c.provider, type: (v.type as ServiceType | null) ?? c.type ?? 'other', reasons: [...c.reasons, note], by: 'claude' };
    }
    return { ...c, decision: 'exclude', reasons: [...c.reasons, note], by: 'claude' };
  });
}
