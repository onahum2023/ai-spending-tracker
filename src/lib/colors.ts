import { useEffect, useState } from 'react';
import type { Category } from './categories';
import type { ChargeKind } from './overrides';

// Validated categorical palette (fixed order). Slot 8 is held back for "Other".
const LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6'];
const DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9'];
const OTHER_LIGHT = '#a3a19a';
const OTHER_DARK = '#6c6b66';

export const OTHER_KEY = 'Other providers';
export const SERIES_SLOTS = LIGHT.length;

export type Scheme = 'light' | 'dark';

/** One fixed palette slot per category, so a category never changes colour between views. */
const CATEGORY_SLOT: Record<Category, number | null> = {
  chat: 0, coding: 1, api: 2, media: 3, writing: 4, domains: 5, hosting: 6, other: null,
};

/** Subscription, usage and one-time keep a colour of their own across charts. */
export function typeColor(kind: ChargeKind, scheme: Scheme): string {
  if (kind === 'other') return scheme === 'dark' ? OTHER_DARK : OTHER_LIGHT;
  return (scheme === 'dark' ? DARK : LIGHT)[kind === 'subscription' ? 0 : 3];
}

export function categoryColor(category: Category, scheme: Scheme): string {
  const slot = CATEGORY_SLOT[category];
  if (slot === null) return scheme === 'dark' ? OTHER_DARK : OTHER_LIGHT;
  return (scheme === 'dark' ? DARK : LIGHT)[slot];
}

export function useColorScheme(): Scheme {
  const query = '(prefers-color-scheme: dark)';
  const [scheme, setScheme] = useState<Scheme>(() =>
    typeof window !== 'undefined' && window.matchMedia(query).matches ? 'dark' : 'light',
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setScheme(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return scheme;
}

export interface ProviderColors {
  /** Providers that get their own colour, in slot order (largest all-time spend first). */
  series: string[];
  seriesSet: Set<string>;
  color: (provider: string) => string;
  otherColor: string;
}

/**
 * Colour follows the provider, not its rank in the current view: slots are assigned
 * once from all-time spend, so changing a filter never repaints a provider.
 */
export function buildProviderColors(providersBySpend: string[], scheme: Scheme): ProviderColors {
  const palette = scheme === 'dark' ? DARK : LIGHT;
  const otherColor = scheme === 'dark' ? OTHER_DARK : OTHER_LIGHT;
  const series = providersBySpend.slice(0, SERIES_SLOTS);
  const map = new Map(series.map((p, i) => [p, palette[i]]));
  return {
    series,
    seriesSet: new Set(series),
    color: (p) => map.get(p) ?? otherColor,
    otherColor,
  };
}
