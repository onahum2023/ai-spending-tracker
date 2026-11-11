import { formatEUR, formatSignedEUR } from './money';
import type { ChargeKind, TypeSource } from './overrides';
import type { LedgerRow } from './types';

/*
 * One-time charges in a comparison
 * --------------------------------
 * A comparison of two periods ("this month against last") moves a lot when one of them holds a one-time charge (a course,
 * an exam, a domain bought once). When either period contains one, the card says so and shows the comparison without them.
 * One-time means a charge whose type is One-time / Other AND that you confirmed. A guess (a descriptor seen once or twice, a
 * file's Type column) is never counted, so the note does not state as fact what the app only suspects. Refunds are not counted
 * either. Nothing is changed in the figures themselves: this only adds a second line.
 */

export interface OneTimeNote {
  /** One-time charges in the current period, and the providers they came from, largest first. */
  currentCents: number;
  currentProviders: string[];
  /** The same for the period it is compared with. */
  earlierCents: number;
  earlierProviders: string[];
  /** Current minus earlier, with every one-time charge left out of both. */
  withoutCents: number;
}

type TypeOf<T> = (row: T) => { kind: ChargeKind; source: TypeSource };

function oneTimeOf<T extends LedgerRow>(rows: T[], typeOf: TypeOf<T>) {
  const byProvider = new Map<string, number>();
  let total = 0;
  for (const r of rows) {
    const info = typeOf(r);
    if (r.amountCents <= 0 || info.kind !== 'other' || info.source !== 'you') continue;
    total += r.amountCents;
    byProvider.set(r.provider, (byProvider.get(r.provider) ?? 0) + r.amountCents);
  }
  const providers = [...byProvider.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([p]) => p);
  return { total, providers };
}

/** Null when neither period has a one-time charge: the comparison needs no second line. */
export function oneTimeNote<T extends LedgerRow>(
  current: T[],
  earlier: T[],
  typeOf: TypeOf<T>,
  sum: (rows: T[]) => number,
): OneTimeNote | null {
  const cur = oneTimeOf(current, typeOf);
  const prev = oneTimeOf(earlier, typeOf);
  if (cur.total === 0 && prev.total === 0) return null;
  return {
    currentCents: cur.total,
    currentProviders: cur.providers,
    earlierCents: prev.total,
    earlierProviders: prev.providers,
    withoutCents: sum(current) - cur.total - (sum(earlier) - prev.total),
  };
}

/** "Anthropic", "Anthropic and Namecheap", "Anthropic, Namecheap and 2 more". */
function namesOf(providers: string[]): string {
  if (providers.length <= 2) return providers.join(' and ');
  return `${providers.slice(0, 2).join(', ')} and ${providers.length - 2} more`;
}

/** The second line: "Includes one-time €115.05 (Anthropic). Without it: −€31.42". */
export function describeOneTime(n: OneTimeNote): string {
  const without = formatSignedEUR(n.withoutCents);
  if (n.currentCents > 0 && n.earlierCents > 0) {
    return `Includes one-time ${formatEUR(n.currentCents)} (${namesOf(n.currentProviders)}); the other period ${formatEUR(n.earlierCents)} (${namesOf(n.earlierProviders)}). Without them: ${without}`;
  }
  if (n.currentCents > 0) return `Includes one-time ${formatEUR(n.currentCents)} (${namesOf(n.currentProviders)}). Without it: ${without}`;
  return `The other period includes one-time ${formatEUR(n.earlierCents)} (${namesOf(n.earlierProviders)}). Without it: ${without}`;
}
