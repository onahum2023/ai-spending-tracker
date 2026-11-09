import { detectRecurring } from '../recurring';
import type { ServiceType, StatementRow } from './types';
import { AI_HINT, LOOKALIKES, VENDORS, type TypeRule } from './vendors';

export type Decision = 'include' | 'review' | 'exclude';

export interface Classified {
  row: StatementRow;
  decision: Decision;
  provider: string | null;
  type: ServiceType | null;
  group: 'ai' | 'infra' | null;
  /** Plain-language reasons, in the order they were applied. */
  reasons: string[];
  /** Who made the current decision. */
  by: 'rules' | 'claude' | 'you';
}

export interface ClassifyOptions {
  /** Include hosting, domains and dev tools (AWS, Vercel, Namecheap, GitHub...). Default true. */
  includeInfra?: boolean;
}

function textOf(row: StatementRow): string {
  return `${row.merchant} ${row.label ?? ''}`.toUpperCase().replace(/\s+/g, ' ');
}

/**
 * Decides, row by row, whether a statement line is AI-related spending, which
 * provider it belongs to and what kind of charge it is. Deterministic: the same
 * input always gives the same output, and every decision carries its reasons.
 */
export function classifyRows(rows: StatementRow[], opts: ClassifyOptions = {}): Classified[] {
  const includeInfra = opts.includeInfra ?? true;
  const pending: { c: Classified; rule: TypeRule }[] = [];

  const out = rows.map((row): Classified => {
    const text = textOf(row);
    const base = { row, by: 'rules' as const };

    if (row.kind === 'payment' || row.kind === 'internal') {
      return { ...base, decision: 'exclude', provider: null, type: null, group: null, reasons: [row.kind === 'payment' ? 'Card repayment' : 'Internal transfer or savings movement'] };
    }

    const vendor = VENDORS.find((v) => v.match.test(text));
    if (vendor) {
      const reasons = [`Matches ${vendor.provider}: ${vendor.why}`];
      if (row.amountCents < 0) reasons.push('Negative amount: refund or credit');
      if (vendor.group === 'infra' && !includeInfra) {
        return { ...base, decision: 'exclude', provider: vendor.provider, type: null, group: vendor.group, reasons: [...reasons, 'Infrastructure is switched off in the options'] };
      }
      const service = vendor.services?.find((s) => s.match.test(text));
      if (service) {
        return { ...base, decision: 'include', provider: vendor.provider, type: service.type, group: vendor.group, reasons: [...reasons, `Type: ${service.why}`] };
      }
      const c: Classified = { ...base, decision: 'include', provider: vendor.provider, type: vendor.type === 'auto' ? null : vendor.type, group: vendor.group, reasons };
      if (vendor.type === 'auto') pending.push({ c, rule: vendor.type });
      return c;
    }

    const look = LOOKALIKES.find((l) => l.match.test(text));
    if (look) {
      return { ...base, decision: look.decision, provider: null, type: null, group: null, reasons: [look.why] };
    }
    if (AI_HINT.test(text)) {
      return { ...base, decision: 'review', provider: null, type: null, group: null, reasons: ['Not a known vendor, but the name suggests an AI product'] };
    }
    if (row.kind === 'transfer') {
      return { ...base, decision: 'exclude', provider: null, type: null, group: null, reasons: ['Bank transfer, not a card purchase'] };
    }
    return { ...base, decision: 'exclude', provider: null, type: null, group: null, reasons: ['No known AI vendor'] };
  });

  // Second pass: for vendors that sell both plans and top-ups, the charge pattern decides.
  const byProvider = new Map<string, Classified[]>();
  for (const { c } of pending) byProvider.set(c.provider!, [...(byProvider.get(c.provider!) ?? []), c]);
  for (const list of byProvider.values()) {
    const ledgerish = list.map((c) => ({ merchant: c.row.merchant, provider: c.provider!, amountCents: c.row.amountCents, date: c.row.date, c }));
    const latest = ledgerish.reduce((a, r) => (r.date > a ? r.date : a), '0000-00-00');
    const recurring = new Set(detectRecurring(ledgerish, latest).flatMap((p) => p.charges.map((ch) => ch.c)));
    for (const c of list) {
      if (recurring.has(c)) {
        c.type = 'subscription';
        c.reasons.push('Type: repeats monthly at a similar amount, so treated as a subscription');
      } else {
        c.type = 'usage';
        c.reasons.push('Type: not part of a monthly pattern, so treated as usage or a credit top-up');
      }
    }
  }

  return out;
}

export function summarize(list: Classified[]) {
  const count = (d: Decision) => list.filter((c) => c.decision === d).length;
  return { include: count('include'), review: count('review'), exclude: count('exclude') };
}
