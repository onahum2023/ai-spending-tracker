// Opt-in only, loaded on demand: asks Claude about statement lines the rules could not decide.
// Uses the user's own API key, straight from the browser to api.anthropic.com.
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import type { Classified } from './classify';
import { applyVerdicts, payloadFor, SYSTEM, type Verdict } from './review';
import { SERVICE_TYPES } from './types';

export { applyVerdicts, payloadFor, type Verdict };

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
export class ClaudeError extends Error {
  /** Answers from batches that finished before this one failed. Already paid for, so the caller can still show them. */
  partial?: Map<string, Verdict>;
}

export async function askClaude(
  apiKey: string,
  items: Classified[],
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, Verdict>> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 });
  const out = new Map<string, Verdict>();
  try {
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
  } catch (e) {
    if (e instanceof ClaudeError && out.size > 0) e.partial = new Map(out);
    throw e;
  }
  return out;
}
