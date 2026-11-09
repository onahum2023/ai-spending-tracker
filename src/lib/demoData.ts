/*
 * Synthetic demo data pack for AI Spending Tracker.
 *
 * Every row here is invented: amounts, dates and the plan timeline are made up and
 * are not derived from anyone's real transactions. The format (Merchant, Provider,
 * Amount, Date) matches the import format so the app treats it like any import.
 *
 * Deterministic: the same --seed always produces the same charges for a given
 * month, regardless of --end. Changing --end only adds or removes months at the
 * end, so you can regenerate right before a demo and the history stays stable.
 *
 * Pure and browser-safe: the app generates the demo in memory ending today, and
 * scripts/generate-demo-data.ts writes the same data to files for presenters.
 */

export interface DemoRow {
  merchant: string;
  provider: string;
  amountCents: number;
  date: string;
}

export const DEMO_START = '2025-01';
export const DEFAULT_SEED = 2026;

// ---------- deterministic randomness ----------

function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Final avalanche (murmur3 fmix32) so near-identical keys give unrelated seeds.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Rng {
  next: () => number;
  int: (min: number, max: number) => number;
  chance: (p: number) => boolean;
}

/** A fresh generator per (seed, stream, month), so months never affect each other. */
function rngFor(seed: number, streamId: string, month: string): Rng {
  const next = mulberry32(hash(`${seed}:${streamId}:${month}`));
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
  };
}

/** Small variation, like a USD-priced plan converted to EUR each month. */
function fx(cents: number, r: Rng, pct = 0.025): number {
  return Math.round(cents * (1 + (r.next() * 2 - 1) * pct));
}

// ---------- calendar ----------

function addMonths(month: string, n: number): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1 + n;
  const yy = y + Math.floor(m / 12);
  return `${yy}-${String((((m % 12) + 12) % 12) + 1).padStart(2, '0')}`;
}

function daysInMonth(month: string): number {
  return new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
}

function monthDiff(a: string, b: string): number {
  return (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));
}

function day(month: string, d: number): string {
  return `${month}-${String(Math.min(d, daysInMonth(month))).padStart(2, '0')}`;
}

export function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------- merchant descriptors ----------

/** Card-statement style: name padded to 24 characters, then the city. */
function desc(name: string, city: string): string {
  return name.length >= 24 ? `${name}  ${city}` : name.padEnd(24) + city;
}

function code(r: Rng, len = 6): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[r.int(0, chars.length - 1)];
  return s;
}

// ---------- streams ----------

interface Stream {
  id: string;
  from: string;
  /** Inclusive last month; open-ended when omitted. */
  to?: string;
  gen: (month: string, r: Rng) => DemoRow[];
}

/** Monthly subscription on a fixed day. */
function sub(id: string, provider: string, merchant: string, dayOfMonth: number, from: string, to: string | undefined, cents: number, varies = true): Stream {
  return {
    id,
    from,
    to,
    gen: (m, r) => [{ provider, merchant, date: day(m, dayOfMonth), amountCents: varies ? fx(cents, r) : cents }],
  };
}

/** A single charge. */
function once(id: string, provider: string, merchant: string, date: string, cents: number): Stream {
  const m = date.slice(0, 7);
  return { id, from: m, to: m, gen: () => [{ provider, merchant, date, amountCents: cents }] };
}

/** Usage-based charges: `count` charges per month on random days. */
function usage(
  id: string,
  provider: string,
  merchant: (r: Rng) => string,
  from: string,
  to: string | undefined,
  count: (monthsIn: number, r: Rng) => number,
  amount: (r: Rng, monthsIn: number) => number,
): Stream {
  return {
    id,
    from,
    to,
    gen: (m, r) => {
      const k = monthDiff(from, m);
      const n = Math.max(0, count(k, r));
      const rows: DemoRow[] = [];
      for (let i = 0; i < n; i++) {
        rows.push({ provider, merchant: merchant(r), date: day(m, r.int(1, daysInMonth(m))), amountCents: amount(r, k) });
      }
      return rows;
    },
  };
}

const fixed = (s: string) => () => s;

/*
 * The story the data tells, for demos:
 * - 2025: a handful of consumer AI subscriptions (ChatGPT, Copilot, Midjourney, Perplexity, Cursor).
 * - Mid 2025: Claude Pro joins; Perplexity is cancelled at the end of the year.
 * - 2026: building with AI. API usage (Anthropic, OpenAI, Mistral, Groq, Replicate) grows,
 *   hosting and tools arrive (Vercel, Supabase, Lovable), plans get upgraded and downgraded.
 * - Includes plan changes, a cancelled subscription, annual domain renewals,
 *   sporadic usage, and one pair of identical same-day charges.
 */
const STREAMS: Stream[] = [
  // Consumer subscriptions
  sub('chatgpt-plus', 'OpenAI', desc('OPENAI *CHATGPT SUBSCR', 'SAN FRANCISCO'), 14, '2025-01', '2026-05', 2299),
  sub('chatgpt-pro', 'OpenAI', desc('OPENAI *CHATGPT SUBSCR', 'SAN FRANCISCO'), 15, '2026-06', undefined, 10990),
  sub('copilot', 'GitHub', desc('GITHUB, INC.', 'SAN FRANCISCO'), 5, '2025-01', undefined, 940),
  sub('midjourney-basic', 'Midjourney', desc('MIDJOURNEY INC.', 'SAN FRANCISCO'), 14, '2025-03', '2025-07', 950),
  sub('midjourney-std', 'Midjourney', desc('MIDJOURNEY INC.', 'SAN FRANCISCO'), 14, '2025-08', '2026-02', 2790),
  sub('perplexity-pro', 'Perplexity', desc('PERPLEXITY.AI', 'SAN FRANCISCO'), 7, '2025-05', '2025-12', 1890),
  sub('cursor-pro', 'Cursor', desc('CURSOR AI', 'NEW YORK'), 9, '2025-06', undefined, 1849),
  sub('claude-pro', 'Anthropic', desc('CLAUDE.AI SUBSCRIPTION', 'SAN FRANCISCO'), 6, '2025-07', '2026-01', 2178, false),
  sub('claude-max', 'Anthropic', desc('ANTHROPIC* CLAUDE SUB', 'SAN FRANCISCO'), 19, '2026-02', '2026-05', 10890, false),
  sub('claude-pro-2', 'Anthropic', desc('ANTHROPIC* CLAUDE SUB', 'SAN FRANCISCO'), 19, '2026-06', undefined, 2178, false),
  sub('huggingface-pro', 'Hugging Face', desc('HUGGINGFACE', 'NEW YORK'), 1, '2026-01', undefined, 849),
  sub('elevenlabs', 'ElevenLabs', desc('ELEVENLABS.IO', 'NEW YORK'), 16, '2026-02', undefined, 2049),
  sub('runway', 'Runway', desc('RUNWAYML', 'NEW YORK'), 12, '2026-06', '2026-09', 1390),
  sub('gamma-plus', 'Gamma', desc('GAMMA.APP', 'SAN FRANCISCO'), 2, '2026-01', '2026-02', 900),
  once('gamma-annual', 'Gamma', 'Gamma', '2026-03-02', 9600),
  sub('granola', 'Granola', desc('GRANOLA INC', 'DOVER'), 23, '2026-05', undefined, 1400),
  sub('slack-pro', 'Slack', desc('SLACK T00DEMO0000', 'DUBLIN 1'), 9, '2026-03', undefined, 799),

  // Building tools and hosting
  sub('lovable', 'Lovable', desc('LOVABLE', 'DOVER'), 24, '2026-01', undefined, 2500, false),
  sub('vercel-pro', 'Vercel', desc('VERCEL INC.', 'COVINA'), 26, '2026-03', undefined, 1840),
  usage('vercel-usage', 'Vercel', fixed(desc('VERCEL', 'COVINA')), '2026-06', undefined,
    (_k, r) => (r.chance(0.6) ? 1 : 0), (r) => r.int(300, 1200)),
  sub('supabase-pro', 'Supabase', desc('SUPABASE', 'SINGAPORE'), 12, '2026-04', undefined, 2280),
  usage('aws', 'Amazon Web Services', fixed(desc('AWS EMEA', 'AWS.AMAZON.CO')), '2026-07', undefined,
    () => 1, (r) => r.int(1200, 4000)),
  once('aws-first', 'Amazon Web Services', desc('AWS EMEA', 'AWS.AMAZON.CO'), '2026-03-04', 4820),
  usage('google-cloud', 'Google', fixed('Google Cloud'), '2026-04', undefined, () => 1, (r) => r.int(800, 3000)),

  // Domains: annual renewals in Jun/Jul plus occasional small extras
  {
    id: 'namecheap-annual',
    from: DEMO_START,
    gen: (m, r) => {
      const mm = m.slice(5);
      const renewals: [number, number][] = mm === '06' ? [[2, 5490], [8, 1299], [22, 2850]] : mm === '07' ? [[5, 3690]] : [];
      return renewals.map(([d, c]) => ({
        provider: 'Namecheap',
        merchant: desc(`NAME-CHEAP.COM* ${code(r)}`, 'PHOENIX'),
        date: day(m, d),
        amountCents: fx(c, r, 0.04),
      }));
    },
  },
  usage('namecheap-misc', 'Namecheap', (r) => desc(`NAME-CHEAP.COM* ${code(r)}`, 'PHOENIX'), DEMO_START, undefined,
    (_k, r) => (r.chance(0.35) ? 1 : 0), (r) => r.int(300, 1700)),

  // API usage
  usage('anthropic-api', 'Anthropic', fixed('Anthropic'), '2026-03', undefined,
    (k, r) => Math.min(9, 2 + Math.floor(k * 0.8)) + r.int(-1, 1),
    (r) => (r.chance(0.15) ? r.int(1700, 4400) : r.int(1003, 1120))),
  // Two identical auto-reloads on the same day: shows the duplicate policy keeps both.
  once('anthropic-dup-a', 'Anthropic', 'Anthropic', '2026-04-14', 1000),
  once('anthropic-dup-b', 'Anthropic', 'Anthropic', '2026-04-14', 1000),
  usage('openai-api', 'OpenAI', fixed(desc('OPENAI', 'SAN FRANCISCO')), '2025-04', undefined,
    (k, r) => (k < 10 ? (r.chance(0.5) ? 1 : 0) : r.int(1, 2)), (r) => r.int(1000, 3000)),
  once('openai-credit', 'OpenAI', desc('OPENAI* CHATGPT CREDIT', 'DUBLIN'), '2026-02-17', 2500),
  usage('cursor-usage', 'Cursor', fixed(desc('CURSOR USAGE', 'NEW YORK')), '2026-03', undefined,
    (_k, r) => r.int(0, 2), (r) => r.int(500, 3500)),
  usage('openrouter', 'OpenRouter', fixed('Openrouter'), '2025-08', undefined,
    (_k, r) => (r.chance(0.5) ? 1 : 0), (r) => r.int(1000, 1200)),
  usage('mistral', 'Mistral AI', fixed(desc('MISTRAL AI', 'PARIS')), '2026-05', undefined,
    () => 1, (r, k) => r.int(200, 900) + k * 60),
  usage('replicate', 'Replicate', fixed(desc('REPLICATE', 'SAN FRANCISCO')), '2026-02', undefined,
    (_k, r) => (r.chance(0.45) ? 1 : 0), (r) => r.int(300, 2500)),
  usage('groq', 'Groq', fixed(desc('GROQ INC', 'MOUNTAIN VIEW')), '2026-07', undefined,
    () => 1, (r) => r.int(100, 600)),
  once('deepseek-1', 'DeepSeek', 'Deepseek', '2026-02-10', 500),
  once('deepseek-2', 'DeepSeek', 'Deepseek', '2026-07-04', 1000),
  once('venice', 'Venice', 'Venice.ai', '2026-03-15', 1200),
];

// ---------- generation ----------

export function generateDemo({ seed = DEFAULT_SEED, end = todayLocal() }: { seed?: number; end?: string } = {}): DemoRow[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) throw new Error(`--end must be YYYY-MM-DD, got "${end}"`);
  const endMonth = end.slice(0, 7);
  const rows: DemoRow[] = [];
  for (const s of STREAMS) {
    const last = s.to && s.to < endMonth ? s.to : endMonth;
    for (let m = s.from; m <= last; m = addMonths(m, 1)) {
      if (m < DEMO_START) continue;
      rows.push(...s.gen(m, rngFor(seed, s.id, m)));
    }
  }
  return rows
    .filter((r) => r.date <= end)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.provider.localeCompare(b.provider) ||
        a.merchant.localeCompare(b.merchant) ||
        a.amountCents - b.amountCents,
    );
}

// ---------- CSV ----------

function centsToPlain(c: number): string {
  return `${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`;
}

function csvField(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: DemoRow[]): string {
  const lines = ['Merchant,Provider,Amount,Date'];
  for (const r of rows) lines.push([csvField(r.merchant), csvField(r.provider), centsToPlain(r.amountCents), r.date].join(','));
  return lines.join('\r\n') + '\r\n';
}

export const PACK_FILES = {
  full: 'ai-spending-demo.csv',
  part1: 'ai-spending-demo-part1.csv',
  part2: 'ai-spending-demo-part2.csv',
  errors: 'ai-spending-demo-errors.csv',
} as const;

export interface DemoPack {
  files: Record<string, string>;
  manifest: Record<string, unknown>;
}

/** Builds every file in the pack as text. */
export function buildPack({ seed = DEFAULT_SEED, end = todayLocal() }: { seed?: number; end?: string } = {}): DemoPack {
  const rows = generateDemo({ seed, end });
  // Part 1 ends with the month two months before `end`; part 2 starts with that same month,
  // so the two files overlap by one month (useful for showing duplicate detection).
  const overlapMonth = addMonths(end.slice(0, 7), -2);
  const part1 = rows.filter((r) => r.date.slice(0, 7) <= overlapMonth);
  const part2 = rows.filter((r) => r.date.slice(0, 7) >= overlapMonth);

  // Two rows already in the ledger plus six that fail validation; importing it adds nothing.
  const errorsCsv =
    toCsv([rows[10], rows[20]]) +
    [
      `${desc('CURSOR AI', 'NEW YORK')},Cursor,€18.49,2026-03-09`,
      `${desc('MISTRAL AI', 'PARIS')},Mistral AI,"1,234.50",2026-06-02`,
      `${desc('REPLICATE', 'SAN FRANCISCO')},Replicate,7.25,2026-02-30`,
      `${desc('GROQ INC', 'MOUNTAIN VIEW')},Groq,3.10,11/08/2026`,
      `${desc('HUGGINGFACE', 'NEW YORK')},,8.49,2026-04-01`,
      `${desc('RUNWAYML', 'NEW YORK')},Runway,13.90,2026-07-12,extra`,
    ].join('\r\n') +
    '\r\n';

  const totalCents = rows.reduce((a, r) => a + r.amountCents, 0);
  const providers = [...new Set(rows.map((r) => r.provider))].sort();
  return {
    files: {
      [PACK_FILES.full]: toCsv(rows),
      [PACK_FILES.part1]: toCsv(part1),
      [PACK_FILES.part2]: toCsv(part2),
      [PACK_FILES.errors]: errorsCsv,
    },
    manifest: {
      note: 'SYNTHETIC DEMO DATA. Every transaction is invented. Regenerate with: npm run demo:data',
      seed,
      end,
      rows: rows.length,
      providers: providers.length,
      providerNames: providers,
      total: `€${centsToPlain(totalCents)}`,
      totalCents,
      firstDate: rows[0]?.date,
      lastDate: rows[rows.length - 1]?.date,
      files: {
        [PACK_FILES.full]: `Full history, ${rows.length} rows`,
        [PACK_FILES.part1]: `History through ${overlapMonth}, ${part1.length} rows`,
        [PACK_FILES.part2]: `From ${overlapMonth} on, ${part2.length} rows (overlaps part 1 by one month)`,
        [PACK_FILES.errors]: '2 already-stored rows + 6 invalid rows, to show validation',
      },
    },
  };
}
