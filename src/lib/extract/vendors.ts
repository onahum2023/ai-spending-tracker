import type { ServiceType } from './types';

/*
 * Vendor catalog: how to recognise AI vendors (and the infrastructure people
 * build AI projects on) in card and bank statements.
 *
 * Patterns run against the upper-cased merchant descriptor plus the bank's own
 * merchant label. Add a vendor by appending an entry; keep patterns specific
 * enough not to catch unrelated merchants (test with `npm test`).
 *
 * type:
 *   a fixed ServiceType, or
 *   'auto' — decided from the charge pattern: charges that repeat monthly at a
 *            similar amount are a subscription; everything else is usage/credits.
 */
export type TypeRule = ServiceType | 'auto';

export interface VendorRule {
  provider: string;
  /** 'ai' = AI products and APIs. 'infra' = hosting, domains and dev tools around AI projects. */
  group: 'ai' | 'infra';
  match: RegExp;
  /** More specific descriptors, checked in order before the default type. */
  services?: { match: RegExp; type: ServiceType; why: string }[];
  type: TypeRule;
  why: string;
}

export const VENDORS: VendorRule[] = [
  // ---- AI assistants and model APIs
  {
    provider: 'Anthropic', group: 'ai', match: /\bANTHROPIC\b|\bCLAUDE\.AI\b/,
    services: [
      { match: /CLAUDE\.AI SUBSCRIPTION|CLAUDE SUB\b|CLAUDE (PRO|MAX|TEAM)\b/, type: 'subscription', why: 'descriptor names a Claude plan' },
      { match: /\bCERT/, type: 'certification', why: 'descriptor says CERT (certification exam)' },
    ],
    type: 'usage', why: 'plain Anthropic descriptor: API credits / usage',
  },
  {
    provider: 'OpenAI', group: 'ai', match: /\bOPENAI\b|\bCHATGPT\b/,
    services: [
      { match: /CHATGPT SUBSCR|CHATGPT (PLUS|PRO|TEAM)/, type: 'subscription', why: 'descriptor names a ChatGPT plan' },
      { match: /CHATGPT CREDIT/, type: 'usage', why: 'descriptor says ChatGPT credit' },
    ],
    type: 'usage', why: 'plain OpenAI descriptor: API credits / usage',
  },
  { provider: 'Google', group: 'ai', match: /GOOGLE \*?GEMINI|GEMINI ADVANCED/, type: 'subscription', why: 'Gemini plan' },
  { provider: 'Google', group: 'infra', match: /GOOGLE \*?CLOUD|GOOGLE CLOUD|\bGCP\b/, type: 'hosting', why: 'Google Cloud (hosting / AI APIs)' },
  { provider: 'Microsoft', group: 'ai', match: /COPILOT PRO|MICROSOFT\*? ?COPILOT/, type: 'subscription', why: 'Microsoft Copilot plan' },
  { provider: 'Microsoft', group: 'infra', match: /\bAZURE\b/, type: 'hosting', why: 'Azure (hosting / Azure OpenAI)' },
  { provider: 'xAI', group: 'ai', match: /\bX\.AI\b|\bXAI\b|SUPERGROK|\bGROK\b/, type: 'auto', why: 'xAI / Grok' },
  { provider: 'Mistral AI', group: 'ai', match: /\bMISTRAL\b/, type: 'auto', why: 'Mistral (Le Chat plan or API)' },
  { provider: 'Perplexity', group: 'ai', match: /PERPLEXITY/, type: 'subscription', why: 'Perplexity plan' },
  { provider: 'DeepSeek', group: 'ai', match: /DEEPSEEK/, type: 'usage', why: 'DeepSeek API top-up' },
  { provider: 'OpenRouter', group: 'ai', match: /OPENROUTER/, type: 'usage', why: 'OpenRouter credits' },
  { provider: 'Together AI', group: 'ai', match: /TOGETHER ?AI|TOGETHER COMPUTER/, type: 'usage', why: 'Together AI API' },
  { provider: 'Groq', group: 'ai', match: /\bGROQ\b/, type: 'usage', why: 'Groq API' },
  { provider: 'Fireworks AI', group: 'ai', match: /FIREWORKS ?AI/, type: 'usage', why: 'Fireworks API' },
  { provider: 'Cohere', group: 'ai', match: /\bCOHERE\b/, type: 'usage', why: 'Cohere API' },
  { provider: 'Replicate', group: 'ai', match: /REPLICATE/, type: 'usage', why: 'Replicate usage' },
  { provider: 'Hugging Face', group: 'ai', match: /HUGGING ?FACE/, type: 'auto', why: 'Hugging Face (Pro plan or compute)' },
  { provider: 'Venice', group: 'ai', match: /VENICE\.AI|\bVENICE AI\b/, type: 'auto', why: 'Venice.ai' },
  { provider: 'Poe', group: 'ai', match: /\bPOE\.COM\b|QUORA.*POE/, type: 'subscription', why: 'Poe plan' },
  { provider: 'Character.AI', group: 'ai', match: /CHARACTER\.AI|CHARACTER AI/, type: 'subscription', why: 'Character.AI plan' },
  // ---- AI coding and app builders
  { provider: 'Cursor', group: 'ai', match: /\bCURSOR\b|ANYSPHERE/, services: [{ match: /USAGE/, type: 'usage', why: 'descriptor says usage' }], type: 'auto', why: 'Cursor' },
  { provider: 'Lovable', group: 'ai', match: /LOVABLE/, type: 'auto', why: 'Lovable (plan or credit top-ups)' },
  { provider: 'Bolt', group: 'ai', match: /BOLT\.NEW|STACKBLITZ/, type: 'auto', why: 'Bolt.new' },
  { provider: 'Replit', group: 'ai', match: /\bREPLIT\b/, type: 'auto', why: 'Replit' },
  { provider: 'Windsurf', group: 'ai', match: /WINDSURF|CODEIUM/, type: 'auto', why: 'Windsurf' },
  { provider: 'Devin', group: 'ai', match: /COGNITION AI|DEVIN\.AI/, type: 'auto', why: 'Devin (Cognition)' },
  // ---- AI media, writing and meeting tools
  { provider: 'Midjourney', group: 'ai', match: /MIDJOURNEY/, type: 'subscription', why: 'Midjourney plan' },
  { provider: 'ElevenLabs', group: 'ai', match: /ELEVENLABS|ELEVEN LABS/, type: 'auto', why: 'ElevenLabs' },
  { provider: 'Runway', group: 'ai', match: /RUNWAYML|RUNWAY AI|\bRUNWAY ?ML\b/, type: 'auto', why: 'Runway' },
  { provider: 'Suno', group: 'ai', match: /\bSUNO\b/, type: 'subscription', why: 'Suno plan' },
  { provider: 'Leonardo.Ai', group: 'ai', match: /LEONARDO\.?AI/, type: 'subscription', why: 'Leonardo plan' },
  { provider: 'Ideogram', group: 'ai', match: /IDEOGRAM/, type: 'subscription', why: 'Ideogram plan' },
  { provider: 'Krea', group: 'ai', match: /\bKREA\b/, type: 'subscription', why: 'Krea plan' },
  { provider: 'HeyGen', group: 'ai', match: /HEYGEN/, type: 'auto', why: 'HeyGen' },
  { provider: 'Synthesia', group: 'ai', match: /SYNTHESIA/, type: 'subscription', why: 'Synthesia plan' },
  { provider: 'Descript', group: 'ai', match: /DESCRIPT/, type: 'subscription', why: 'Descript plan' },
  { provider: 'Gamma', group: 'ai', match: /GAMMA\.APP|GAMMA TECH/, type: 'subscription', why: 'Gamma plan (monthly or annual)' },
  { provider: 'Granola', group: 'ai', match: /GRANOLA/, type: 'subscription', why: 'Granola plan' },
  { provider: 'Otter', group: 'ai', match: /OTTER\.AI/, type: 'subscription', why: 'Otter plan' },
  { provider: 'Fireflies', group: 'ai', match: /FIREFLIES/, type: 'subscription', why: 'Fireflies plan' },
  { provider: 'Jasper', group: 'ai', match: /JASPER\.AI|JASPER AI/, type: 'subscription', why: 'Jasper plan' },
  // ---- Infrastructure people build AI projects on
  { provider: 'Amazon Web Services', group: 'infra', match: /\bAWS\b|AMAZON WEB SERVICES/, type: 'hosting', why: 'AWS (not an Amazon shop purchase)' },
  { provider: 'Vercel', group: 'infra', match: /\bVERCEL\b/, type: 'hosting', why: 'Vercel hosting' },
  { provider: 'Supabase', group: 'infra', match: /SUPABASE/, type: 'hosting', why: 'Supabase database / hosting' },
  { provider: 'Netlify', group: 'infra', match: /NETLIFY/, type: 'hosting', why: 'Netlify hosting' },
  { provider: 'Cloudflare', group: 'infra', match: /CLOUDFLARE/, type: 'hosting', why: 'Cloudflare' },
  { provider: 'Railway', group: 'infra', match: /RAILWAY\.APP|\bRAILWAY CORP/, type: 'hosting', why: 'Railway hosting' },
  { provider: 'Render', group: 'infra', match: /RENDER\.COM/, type: 'hosting', why: 'Render hosting' },
  { provider: 'Fly.io', group: 'infra', match: /\bFLY\.IO\b/, type: 'hosting', why: 'Fly.io hosting' },
  { provider: 'DigitalOcean', group: 'infra', match: /DIGITALOCEAN/, type: 'hosting', why: 'DigitalOcean' },
  { provider: 'GitHub', group: 'infra', match: /\bGITHUB\b/, type: 'subscription', why: 'GitHub plan (Copilot or GitHub seats)' },
  { provider: 'Namecheap', group: 'infra', match: /NAME-?CHEAP/, type: 'domains', why: 'Namecheap domains' },
  { provider: 'GoDaddy', group: 'infra', match: /GODADDY|GO DADDY/, type: 'domains', why: 'GoDaddy domains' },
  { provider: 'Porkbun', group: 'infra', match: /PORKBUN/, type: 'domains', why: 'Porkbun domains' },
  { provider: 'Slack', group: 'infra', match: /\bSLACK\b/, type: 'subscription', why: 'Slack workspace plan' },
];

/** Things that look related but usually are not AI spending. Shown in review or excluded, with the reason. */
export const LOOKALIKES: { match: RegExp; decision: 'review' | 'exclude'; why: string }[] = [
  { match: /AMZN|AMAZON\.|AMAZON MKTP|AMAZON MARKETPLACE|\bAMAZON\b(?!.*WEB SERVICES)/, decision: 'exclude', why: 'Amazon shop purchase, not AWS' },
  { match: /GOOGLE ONE|GOOGLE \*GOOGLE ONE/, decision: 'review', why: 'Google One is usually storage, but its AI plan includes Gemini' },
  { match: /GOOGLE \*?WORKSPACE|GSUITE|G SUITE/, decision: 'review', why: 'Google Workspace can include Gemini, but is mostly email and docs' },
  { match: /APPLE\.COM|ITUNES|APP STORE/, decision: 'exclude', why: 'App Store charge; add it manually if it is an AI app subscription' },
  { match: /^GAMMA\b|\bGAMMA$/, decision: 'review', why: 'Gamma could be the AI presentation app or the Gamma DIY store' },
  { match: /\bNOTION\b/, decision: 'review', why: 'Notion plan may include Notion AI' },
  { match: /GRAMMARLY/, decision: 'review', why: 'Grammarly is an AI writing tool for some, a spell checker for others' },
  { match: /\bCANVA\b/, decision: 'review', why: 'Canva includes AI features, but is mainly a design tool' },
  { match: /\bADOBE\b/, decision: 'review', why: 'Adobe plans include Firefly AI, but are mainly creative software' },
];

/** Names that hint at an AI product we do not know yet. */
export const AI_HINT = /\.AI\b|\bAI\b|\bGPT\b|\bLLM\b|NEURAL/;
