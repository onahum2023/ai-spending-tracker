/** What a charge was for. Optional on ledger rows; set by the statement extractor. */
export const SERVICE_TYPES = ['subscription', 'usage', 'certification', 'domains', 'hosting', 'other'] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  subscription: 'Subscription',
  usage: 'Usage / credits',
  certification: 'Certification',
  domains: 'Domains',
  hosting: 'Hosting / infra',
  other: 'Other',
};

export function parseServiceType(raw: string): ServiceType | null {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  const hit = SERVICE_TYPES.find((t) => t === v || SERVICE_TYPE_LABELS[t].toLowerCase() === v);
  if (hit) return hit;
  if (/^usage|credit|api/.test(v)) return 'usage';
  if (/^sub|plan/.test(v)) return 'subscription';
  if (/^cert/.test(v)) return 'certification';
  if (/^domain/.test(v)) return 'domains';
  if (/^host|infra/.test(v)) return 'hosting';
  return 'other';
}

/** One line read from a bank or card statement, before any AI-vendor decision. */
export interface StatementRow {
  /** Unique within one extraction run. */
  id: string;
  /** File it came from. */
  source: string;
  format: 'amex' | 'revolut-pdf' | 'table';
  date: string;
  /** Positive = money spent (a charge). Negative = refund or credit. */
  amountCents: number;
  /** Merchant descriptor as printed on the statement (the most specific one available). */
  merchant: string;
  /** The bank's own short merchant name, when it differs (e.g. Revolut's "Anthropic"). */
  label?: string;
  /** Extra text from the statement: foreign amount, address, reference. */
  details?: string;
  country?: string;
  bankCategory?: string;
  kind: 'card' | 'transfer' | 'payment' | 'internal' | 'other';
}

export interface ReadResult {
  fileName: string;
  format: StatementRow['format'] | 'unknown';
  rows: StatementRow[];
  /** Human-readable notes about how the file was read (detected columns, skipped sections). */
  notes: string[];
  error?: string;
}
