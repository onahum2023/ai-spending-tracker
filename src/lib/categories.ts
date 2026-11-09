import type { LedgerRow } from './types';

/*
 * Spending categories
 * -------------------
 * Far fewer buckets than providers, so charts stay readable and the grey "Other"
 * area shrinks. A category comes from the provider; two things refine it:
 *   - the charge's Type, when the row has one (statement imports do), and
 *   - for providers that sell both a chat plan and an API (Anthropic, OpenAI, ...):
 *     a recurring charge is the chat plan, anything else is API usage.
 * Providers we do not know land in "Other".
 */

export const CATEGORIES = ['chat', 'coding', 'api', 'media', 'writing', 'hosting', 'domains', 'other'] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  chat: 'Chat assistants',
  coding: 'Coding & app builders',
  api: 'API & inference',
  media: 'Image, video & audio',
  writing: 'Writing & meetings',
  hosting: 'Hosting & infra',
  domains: 'Domains',
  other: 'Other',
};

/** Singular, for sentences like "2 chat assistants". */
export const CATEGORY_NOUNS: Record<Category, { one: string; many: string }> = {
  chat: { one: 'chat assistant', many: 'chat assistants' },
  coding: { one: 'coding tool', many: 'coding tools' },
  api: { one: 'API provider', many: 'API providers' },
  media: { one: 'media tool', many: 'media tools' },
  writing: { one: 'writing or meeting tool', many: 'writing and meeting tools' },
  hosting: { one: 'hosting service', many: 'hosting services' },
  domains: { one: 'domain registrar', many: 'domain registrars' },
  other: { one: 'other service', many: 'other services' },
};

/** Categories where owning several at once is worth pointing out. Hosting and domains are normally plural. */
export const OVERLAP_CATEGORIES: readonly Category[] = ['chat', 'coding', 'media', 'writing'];

const PROVIDER_CATEGORY: Record<string, Category> = {
  // chat assistants (some also sell an API: see DUAL_USE)
  Anthropic: 'chat', OpenAI: 'chat', Microsoft: 'chat', xAI: 'chat', 'Mistral AI': 'chat',
  Perplexity: 'chat', Poe: 'chat', 'Character.AI': 'chat', Venice: 'chat',
  // coding and app builders
  Cursor: 'coding', Lovable: 'coding', Bolt: 'coding', Replit: 'coding', Windsurf: 'coding', Devin: 'coding', GitHub: 'coding',
  // API and inference
  DeepSeek: 'api', OpenRouter: 'api', 'Together AI': 'api', Groq: 'api', 'Fireworks AI': 'api',
  Cohere: 'api', Replicate: 'api', 'Hugging Face': 'api',
  // image, video, audio
  Midjourney: 'media', ElevenLabs: 'media', Runway: 'media', Suno: 'media', 'Leonardo.Ai': 'media',
  Ideogram: 'media', Krea: 'media', HeyGen: 'media', Synthesia: 'media', Descript: 'media',
  // writing and meetings (Slack is team chat, not an AI tool, so it stays in Other)
  Gamma: 'writing', Granola: 'writing', Otter: 'writing', Fireflies: 'writing', Jasper: 'writing',
  // hosting and infrastructure
  'Amazon Web Services': 'hosting', Vercel: 'hosting', Supabase: 'hosting', Netlify: 'hosting',
  Cloudflare: 'hosting', Railway: 'hosting', Render: 'hosting', 'Fly.io': 'hosting', DigitalOcean: 'hosting',
  // domains
  Namecheap: 'domains', GoDaddy: 'domains', Porkbun: 'domains',
};

/** Providers whose plain charges are API credits but whose plan is a chat product. */
const DUAL_USE = new Set(['Anthropic', 'OpenAI', 'Mistral AI', 'xAI', 'Google', 'Microsoft']);

/** "Google" is Gemini (chat) or Google Cloud (hosting); the descriptor tells which. */
const CLOUD_DESCRIPTOR = /\b(CLOUD|GCP|AZURE)\b/i;

/** Catalog vendors that deliberately have no category of their own. */
const UNCATEGORIZED = new Set(['Slack']);

export function knownProvider(provider: string): boolean {
  return provider in PROVIDER_CATEGORY || provider === 'Google' || UNCATEGORIZED.has(provider);
}

/**
 * @param recurring  whether this charge belongs to a detected recurring pattern
 *                   (or is marked as a subscription). Decides chat plan vs API for dual-use providers.
 */
export function categoryOf(row: Pick<LedgerRow, 'provider' | 'merchant' | 'type'>, recurring = false): Category {
  if (row.type === 'certification') return 'other';
  if (row.type === 'domains') return 'domains';
  if (row.type === 'hosting') return 'hosting';

  if (row.provider === 'Google' || row.provider === 'Microsoft') {
    if (CLOUD_DESCRIPTOR.test(row.merchant)) return 'hosting';
  }

  const base: Category | undefined = row.provider === 'Google' ? 'chat' : PROVIDER_CATEGORY[row.provider];
  if (!base) return 'other';

  if (base === 'chat' && DUAL_USE.has(row.provider)) {
    if (row.type === 'usage') return 'api';
    if (row.type === 'subscription') return 'chat';
    return recurring ? 'chat' : 'api';
  }
  return base;
}
