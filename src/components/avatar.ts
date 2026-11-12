/**
 * The one or two letters on a provider's avatar.
 *
 * Two or more words give the first letter of the first two ("Amazon Web Services" is AW). One word gives its first two capitals
 * when it has them ("OpenAI" is OA, "ElevenLabs" is EL), otherwise its first two letters ("Cursor" is CU). A name without letters
 * or digits gives a single "?".
 */
export function providerInitials(name: string): string {
  const words = name.split(/[\s\-_./&+]+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
  if (words.length === 0) return '?';
  const first = (w: string) => (w.match(/[\p{L}\p{N}]/u) ?? [''])[0].toUpperCase();
  if (words.length >= 2) return first(words[0]) + first(words[1]);
  const w = words[0];
  const capitals = w.match(/\p{Lu}/gu) ?? [];
  if (capitals.length >= 2) return capitals[0] + capitals[1];
  const letters = [...w.matchAll(/[\p{L}\p{N}]/gu)].map((m) => m[0]);
  return letters.slice(0, 2).join('').toUpperCase();
}

/** How much of the provider colour is in the avatar's background (the rest is the surface) and in its initials (the rest is black, or white in dark mode). */
export const AVATAR_TINT = 0.18;
export const AVATAR_INK = 0.5;
/** The card surface the avatar sits on, per scheme, and the colour its initials are darkened (or lightened) towards. */
const SURFACE = { light: '#ffffff', dark: '#1a1a19' } as const;
const TOWARDS = { light: '#000000', dark: '#ffffff' } as const;

const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

/** `share` of `a` mixed with the rest of `b`, as a hex colour (the same maths as CSS color-mix in sRGB). */
export function mixHex(a: string, b: string, share: number): string {
  const [ar, ag, ab] = rgb(a);
  const [br, bg, bb] = rgb(b);
  const ch = (x: number, y: number) => Math.round(x * share + y * (1 - share)).toString(16).padStart(2, '0');
  return `#${ch(ar, br)}${ch(ag, bg)}${ch(ab, bb)}`;
}

/** WCAG contrast ratio of two hex colours. */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = rgb(hex).map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The avatar's colours for a provider colour: a light tint of it for the background and a dark shade of the same hue for the
 * initials (the same approach as the pills). In dark mode the tint is dark and the initials are light.
 */
export function avatarColors(color: string, scheme: 'light' | 'dark'): { background: string; color: string } {
  return { background: mixHex(color, SURFACE[scheme], AVATAR_TINT), color: mixHex(color, TOWARDS[scheme], AVATAR_INK) };
}
