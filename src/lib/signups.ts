import { isValidDate } from './dates';
import { VENDORS } from './extract/vendors';
import { MAX_TAG_LENGTH } from './csv';
import type { LedgerRow } from './types';

/*
 * Sign-ups and trials
 * -------------------
 * A "Welcome to X" or "your trial has started" email is a clear event: you began
 * using a service on a date. It says nothing about money. The app only records
 * that event (provider, service, date, kind) and then looks in the ledger for charges
 * from the same provider afterwards, so a sign-up that turns into a payment, or never
 * does, becomes visible.
 *
 * Events come from an email-evidence file (see parseEvidence). Only high-confidence
 * sign-up and trial-start events are kept; verification codes, offers, trial-ending
 * notices and everything else in the file are ignored, and message IDs, links and
 * mailbox addresses are never stored.
 */

export type SignupKind = 'signup' | 'trial';

export interface Signup {
  provider: string;
  service: string | null;
  /** YYYY-MM-DD */
  date: string;
  kind: SignupKind;
  /** Set when the user hid this entry. It stays stored, so importing the file again does not bring it back. */
  hidden?: boolean;
}

/** Observation types in the evidence file that clearly mean "started using this service". */
export const SIGNUP_TYPES: Record<string, SignupKind> = {
  signup: 'signup',
  signup_welcome: 'signup',
  welcome: 'signup',
  trial_started: 'trial',
  free_trial_order: 'trial',
  trial_confirmation: 'trial',
};

const MAX_FILE_FIELD = 80;

const clip = (s: unknown): string | null => {
  if (typeof s !== 'string') return null;
  const t = s.replace(/\s+/g, ' ').trim().slice(0, MAX_FILE_FIELD);
  return t || null;
};

export const signupKey = (s: Signup) => `${providerKey(s.provider)}|${s.date}`;

/** Providers compare by a normalised key, using the vendor catalog so "Otter.ai" meets "Otter" and "Revolut / OpenAI" meets "OpenAI". */
export function providerKey(name: string): string {
  const up = name.toUpperCase();
  const hit = VENDORS.find((v) => v.match.test(up));
  return (hit ? hit.provider : name).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export interface EvidenceResult {
  signups: Signup[];
  observationsRead: number;
  error: string | null;
}

/**
 * Reads sign-up and trial-start events out of an email-evidence JSON file
 * ({ source_messages: [...], observations: [...] }). Several emails for the same
 * provider on the same day become one event, and a trial wins over a plain sign-up.
 */
export function parseEvidence(json: unknown): EvidenceResult {
  const empty = (error: string): EvidenceResult => ({ signups: [], observationsRead: 0, error });
  if (!json || typeof json !== 'object') return empty('This is not an email-evidence file (expected a JSON object).');
  const root = json as { observations?: unknown; source_messages?: unknown };
  if (!Array.isArray(root.observations) || !Array.isArray(root.source_messages)) {
    return empty('This is not an email-evidence file: it has no "observations" and "source_messages" lists.');
  }
  const messageDate = new Map<string, string>();
  for (const m of root.source_messages as { id?: unknown; message_date?: unknown }[]) {
    if (typeof m?.id === 'string' && typeof m.message_date === 'string') messageDate.set(m.id, m.message_date.slice(0, 10));
  }

  const byKey = new Map<string, Signup>();
  for (const o of root.observations as Record<string, unknown>[]) {
    const kind = typeof o?.type === 'string' ? SIGNUP_TYPES[o.type] : undefined;
    if (!kind || o.confidence !== 'high') continue;
    const provider = clip(o.provider);
    if (!provider) continue;
    const effective = typeof o.effective_date === 'string' ? o.effective_date.slice(0, 10) : '';
    const fallback = typeof o.source_id === 'string' ? messageDate.get(o.source_id) : undefined;
    const date = isValidDate(effective) ? effective : fallback && isValidDate(fallback) ? fallback : null;
    if (!date) continue;
    const next: Signup = { provider, service: clip(o.service), date, kind };
    const key = signupKey(next);
    const prev = byKey.get(key);
    if (!prev) byKey.set(key, next);
    else byKey.set(key, { ...prev, kind: prev.kind === 'trial' || kind === 'trial' ? 'trial' : 'signup', service: prev.service ?? next.service });
  }
  return { signups: sortSignups([...byKey.values()]), observationsRead: root.observations.length, error: null };
}

export function sortSignups(list: Signup[]): Signup[] {
  return [...list].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.provider.localeCompare(b.provider)));
}

/** Adds new events to existing ones; an event already stored (same provider and day) is kept as it is. */
export function mergeSignups(existing: Signup[], incoming: Signup[]): { merged: Signup[]; added: number } {
  const seen = new Set(existing.map(signupKey));
  const added = incoming.filter((s) => !seen.has(signupKey(s)) && seen.add(signupKey(s)));
  return { merged: sortSignups([...existing, ...added]), added: added.length };
}

/** Hides (or with false, restores) one sign-up. */
export function setSignupHidden(list: Signup[], target: Signup, hidden: boolean): Signup[] {
  return list.map((s) => {
    if (signupKey(s) !== signupKey(target)) return s;
    const { hidden: _old, ...rest } = s;
    return hidden ? { ...rest, hidden: true } : rest;
  });
}

/** Cleans anything read from storage. */
export function normalizeSignups(raw: unknown): Signup[] {
  if (!Array.isArray(raw)) return [];
  const out: Signup[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    const provider = clip(r?.provider);
    const date = typeof r?.date === 'string' && isValidDate(r.date) ? r.date : null;
    if (!provider || !date || (r.kind !== 'signup' && r.kind !== 'trial')) continue;
    out.push({ provider, service: clip(r.service)?.slice(0, MAX_TAG_LENGTH * 2) ?? null, date, kind: r.kind, ...(r.hidden === true ? { hidden: true } : {}) });
  }
  return mergeSignups([], out).merged;
}

// ---------- what happened afterwards ----------

export type SignupStatus =
  /** No charge from this provider since the sign-up. */
  | 'no-charge'
  /** The first charge from this provider came after the sign-up. */
  | 'charged'
  /** The provider was already charging before the sign-up, so charges since cannot be attributed to it. */
  | 'existing'
  /** The ledger ends before the sign-up, so there is nothing to compare with yet. */
  | 'unknown';

export interface SignupOutcome {
  signup: Signup;
  status: SignupStatus;
  /** The provider's name as it appears in the ledger, when it has charges. */
  ledgerProvider: string | null;
  firstCharge: { date: string; cents: number; daysAfter: number } | null;
  chargesSince: number;
  centsSince: number;
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

export function correlateSignups<T extends LedgerRow>(signups: Signup[], rows: T[]): SignupOutcome[] {
  const byProvider = new Map<string, T[]>();
  let latest = '';
  for (const r of rows) {
    if (r.date > latest) latest = r.date;
    if (r.amountCents <= 0) continue;
    const k = providerKey(r.provider);
    const list = byProvider.get(k) ?? [];
    list.push(r);
    byProvider.set(k, list);
  }
  for (const list of byProvider.values()) list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return signups.map((signup) => {
    const list = byProvider.get(providerKey(signup.provider)) ?? [];
    const since = list.filter((r) => r.date >= signup.date);
    const before = list.some((r) => r.date < signup.date);
    const first = since[0];
    let status: SignupStatus;
    if (before) status = 'existing';
    else if (first) status = 'charged';
    else if (latest && latest < signup.date) status = 'unknown';
    else status = 'no-charge';
    return {
      signup,
      status,
      ledgerProvider: list[0]?.provider ?? null,
      firstCharge: first ? { date: first.date, cents: first.amountCents, daysAfter: daysBetween(signup.date, first.date) } : null,
      chargesSince: since.length,
      centsSince: since.reduce((a, r) => a + r.amountCents, 0),
    };
  });
}

export function summarizeOutcomes(outcomes: SignupOutcome[]) {
  const count = (s: SignupStatus) => outcomes.filter((o) => o.status === s).length;
  return {
    total: outcomes.length,
    charged: count('charged'),
    existing: count('existing'),
    noCharge: count('no-charge'),
    unknown: count('unknown'),
    trials: outcomes.filter((o) => o.signup.kind === 'trial').length,
    trialsCharged: outcomes.filter((o) => o.signup.kind === 'trial' && o.status === 'charged').length,
  };
}

/**
 * Invented sign-ups for demo mode, lined up with the invented demo ledger:
 * some turn into charges, some never do, some are for providers already charging.
 */
export const DEMO_SIGNUPS: Signup[] = [
  { provider: 'Perplexity', service: 'Perplexity Pro', date: '2025-04-28', kind: 'trial' },
  { provider: 'Cursor', service: 'Cursor Pro', date: '2025-05-26', kind: 'trial' },
  { provider: 'Granola', service: 'Granola Business', date: '2026-04-30', kind: 'trial' },
  { provider: 'Runway', service: 'Runway Standard', date: '2026-05-28', kind: 'trial' },
  { provider: 'Windsurf', service: 'Windsurf Pro', date: '2026-03-02', kind: 'trial' },
  { provider: 'Suno', service: 'Suno', date: '2026-08-10', kind: 'signup' },
  { provider: 'Bolt', service: 'Bolt.new', date: '2026-02-14', kind: 'signup' },
  { provider: 'Anthropic', service: 'Claude Console', date: '2026-02-20', kind: 'signup' },
  { provider: 'Neon', service: 'Neon', date: '2026-09-25', kind: 'signup' },
];

