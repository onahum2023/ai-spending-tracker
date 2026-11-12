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
