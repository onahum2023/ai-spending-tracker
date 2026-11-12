import { useEffect, useState } from 'react';
import type { Category } from './categories';
import type { ChargeKind } from './overrides';

/*
 * The palette: six hues in a fixed order, assigned to providers by all-time spend and never cycled, plus a grey for "Other".
 *
 *   indigo #635BFF · teal #00B3A4 · orange #FF7A59 · amber #FFB020 · pink #E5489B · blue #3A9BFF · Other #A3A19A
 *
 * Validated with the dataviz skill's palette validator (validate_palette.js), run once per mode, against the card surface (#ffffff
 * light, #1a1a19 dark). Hues are as specified; only lightness was moved where a check failed, and in the dark steps to keep the
 * pairs apart inside the dark band:
 *   - light: amber was above the lightness band (OKLCH L 0.813 against a 0.77 ceiling) and sat too close to orange (normal-vision
 *     ΔE 14.2 against a floor of 15). Amber moved to L 0.765 (#EDA102) and orange to L 0.664 (#E86545): ΔE 15.2.
 *   - dark: every slot is capped at L 0.67 (the band's ceiling); that put amber next to orange (ΔE 10.9), so orange went down to
 *     L 0.56 (#C34323): ΔE 15.5.
 * Both modes pass the lightness band, chroma floor, CVD separation (worst adjacent 11.1) and the normal-vision floor. Contrast
 * against the surface is below 3:1 for teal, amber and blue in light mode, which the validator allows when values are readable
 * another way: every chart has a legend, and every bar a tooltip and the table below it. Dark passes contrast outright.
 * "Other" is a grey by design: it is outside the categorical checks, like any neutral.
 */
const LIGHT = ['#635BFF', '#00B3A4', '#E86545', '#EDA102', '#E5489B', '#3A9BFF'];
const DARK = ['#635BFF', '#05AC9E', '#C34323', '#C78602', '#E5489B', '#3697FB'];
const OTHER_LIGHT = '#A3A19A';
const OTHER_DARK = '#6c6b66';
/**
 * A seventh colour for the category "Domains": six hues cannot cover seven categories, so it is the pink hue at a much lower
 * lightness (deep pink). It sits next to "Hosting" (blue) and "Other" (grey) in a stack, nowhere near the pink of "Writing".
 * Validated as the seventh slot in both modes.
 */
const DEEP_PINK = { light: '#990260', dark: '#BF1D7B' };

/** Every colour in the palette, in both schemes, with the grey of "Other" last. Used to check that text on a tint of each stays readable. */
export const PALETTE: Record<Scheme, string[]> = { light: [...LIGHT, DEEP_PINK.light, OTHER_LIGHT], dark: [...DARK, DEEP_PINK.dark, OTHER_DARK] };

export const OTHER_KEY = 'Other providers';
export const SERIES_SLOTS = LIGHT.length;

export type Scheme = 'light' | 'dark';

/** One fixed colour per category, so a category never changes colour between views. Seven categories, six hues: Domains is the deep pink. */
const CATEGORY_SLOT: Record<Category, number | 'deep' | null> = {
  chat: 0, coding: 1, api: 2, media: 3, writing: 4, hosting: 5, domains: 'deep', other: null,
};

/** Commitment grouping: Subscription is indigo, Usage teal and One-time amber, in every chart. */
const KIND_SLOT: Record<ChargeKind, number | null> = { subscription: 0, usage: 1, other: 3 };

export function typeColor(kind: ChargeKind, scheme: Scheme): string {
  const slot = KIND_SLOT[kind];
  if (slot === null) return scheme === 'dark' ? OTHER_DARK : OTHER_LIGHT;
  return (scheme === 'dark' ? DARK : LIGHT)[slot];
}

export function categoryColor(category: Category, scheme: Scheme): string {
  const slot = CATEGORY_SLOT[category];
  if (slot === null) return scheme === 'dark' ? OTHER_DARK : OTHER_LIGHT;
  if (slot === 'deep') return DEEP_PINK[scheme];
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
