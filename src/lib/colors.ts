import { useEffect, useState } from 'react';

// Validated categorical palette (fixed order). Slot 8 is held back for "Other".
const LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6'];
const DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9'];
const OTHER_LIGHT = '#a3a19a';
const OTHER_DARK = '#6c6b66';

export const OTHER_KEY = 'Other providers';
export const SERIES_SLOTS = LIGHT.length;

export type Scheme = 'light' | 'dark';

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
