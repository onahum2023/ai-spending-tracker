import { streamKey } from './overrides';

/*
 * Service labels
 * --------------
 * A merchant descriptor such as "ANTHROPIC* CLAUDE SUB   SAN FRANCISCO" is hard to read. A label
 * is a short name you give a stream (provider + descriptor), such as "Claude Pro". It is shown
 * wherever the descriptor is shown, with the descriptor still available on hover, and it falls
 * back to the descriptor when there is none. A label only changes how a stream is named: never a
 * charge, a total or a type.
 */

export const MAX_LABEL_LENGTH = 40;

export interface Label {
  provider: string;
  merchant: string;
  label: string;
}

export type LabelMap = Map<string, string>;

export const labelMap = (list: Label[]): LabelMap => new Map(list.map((l) => [streamKey(l.provider, l.merchant), l.label]));

export const labelOf = (map: LabelMap, provider: string, merchant: string): string | undefined => map.get(streamKey(provider, merchant));

/** A descriptor as one readable line: the padding between its parts becomes " · ". */
export const tidyDescriptor = (merchant: string): string => merchant.trim().replace(/\s{2,}/g, ' · ');

/** What to show for a stream: its label, or the descriptor. */
export const streamName = (map: LabelMap, provider: string, merchant: string): string =>
  labelOf(map, provider, merchant) ?? tidyDescriptor(merchant);

/** One line of text with no leading or trailing blanks, cut to the maximum length. Empty means no label. */
export function cleanLabel(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL_LENGTH).trim();
}

/** Sets the label of one stream, or with an empty text or null removes it. */
export function withLabel(list: Label[], provider: string, merchant: string, text: string | null): Label[] {
  const rest = list.filter((l) => streamKey(l.provider, l.merchant) !== streamKey(provider, merchant));
  const label = text === null ? '' : cleanLabel(text);
  return label ? [...rest, { provider, merchant, label }] : rest;
}

/** Cleans anything read from storage. */
export function normalizeLabels(raw: unknown): Label[] {
  if (!Array.isArray(raw)) return [];
  const out = new Map<string, Label>();
  for (const r of raw as Record<string, unknown>[]) {
    if (typeof r?.provider !== 'string' || typeof r.merchant !== 'string' || typeof r.label !== 'string') continue;
    if (!r.provider || !r.merchant) continue;
    const label = cleanLabel(r.label);
    if (label) out.set(streamKey(r.provider, r.merchant), { provider: r.provider, merchant: r.merchant, label });
  }
  return [...out.values()].sort((a, b) => a.provider.localeCompare(b.provider) || a.merchant.localeCompare(b.merchant));
}
