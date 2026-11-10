/*
 * Charge types
 * ------------
 * A charge is always linked to a provider. Under a provider, the statement's description tells the kinds of charge
 * apart: "ANTHROPIC* CLAUDE SUB" is a subscription, plain "Anthropic" is API usage. That kind is a CHARGE TYPE, and it
 * is what you review and flag (subscription, usage, one-time). The setting then carries over to every charge, past
 * and future, that has the same charge type.
 *
 * The raw description is noisy: a reference code per charge (Namecheap), a city padded onto the end, "INC." in one
 * statement and not another, different capitals. So a charge type is the description with that noise removed:
 *   "NAME-CHEAP.COM* PTOOH4  PHOENIX"  ->  "NAME-CHEAP.COM"
 *   "VERCEL INC.             COVINA"   ->  "VERCEL"
 *   "OPENAI *CHATGPT SUBSCR  SAN FRANCISCO" -> "OPENAI* CHATGPT SUBSCR"
 * Two charges with the same provider and the same cleaned description are the same charge type.
 */

/** Company-form words that some statements add and others leave out. */
const CORPORATE_SUFFIX = /^(INC|LLC|LTD|LIMITED|CORP|CORPORATION|CO|BV|B\.V|GMBH|SA|AG|PLC|INCORPORATED)$/i;

/**
 * A token that is a reference or transaction code rather than a word: letters and digits mixed, or a long number.
 * Only tokens with a digit count. A run of letters is a word as far as we can tell ("PADDLE.NET* CURSOR" is the product
 * Cursor, not a code), so a code made only of letters stays and splits a charge type, which you can see and confirm.
 */
function looksLikeReference(token: string): boolean {
  if (/^\d{4,}$/.test(token)) return true;
  return /^[A-Za-z0-9]{5,16}$/.test(token) && /\d/.test(token) && /[A-Za-z]/.test(token);
}

/** The description cut down to its merchant part: spacing around "*" settled first, then the padded city dropped. */
function merchantPart(merchant: string): string {
  // "OPENAI *CHATGPT", "OPENAI* CHATGPT" and "OPENAI*  CHATGPT" are the same thing. This must come before looking for the
  // city, which follows a run of spaces: otherwise the padding after a star would be mistaken for the city.
  const spaced = merchant.trim().replace(/\s*\*\s*/g, '* ');
  return (spaced.split(/\s{2,}/)[0] ?? spaced).trim();
}

function tidy(head: string, dropReferences: boolean): string {
  const all = head.split(/\s+/);
  // Never drop the first word: that is the merchant itself.
  const words = dropReferences ? all.filter((w, i) => i === 0 || !looksLikeReference(w.replace(/[*,.]+$/g, ''))) : [...all];
  // Drop company-form words ("GITHUB, INC." -> "GITHUB").
  while (words.length > 1 && CORPORATE_SUFFIX.test((words[words.length - 1] ?? '').replace(/,+$/g, '').replace(/\.$/, ''))) words.pop();
  return words.join(' ').replace(/[\s*,.\-]+$/g, '').replace(/,\s*$/, '').trim();
}

/**
 * The description without its noise, keeping the original capitals (for showing to people).
 * Never returns an empty string: a description that is all noise comes back trimmed as it is.
 */
export function cleanDescriptor(merchant: string): string {
  return tidy(merchantPart(merchant), true) || merchant.trim();
}

/** The grouping key of a charge type within a provider: the cleaned description, upper case. */
export function normalizeDescriptor(merchant: string): string {
  return cleanDescriptor(merchant).toUpperCase();
}

/**
 * Like the charge type key, but the reference code is kept: charges that share it belong to one subscription, charges that
 * carry different ones are separate subscriptions that happen to share a charge type ("ACME* PLAN ABC123" and "ACME* PLAN XYZ456").
 */
export function referenceKey(merchant: string): string {
  return (tidy(merchantPart(merchant), false) || merchant.trim()).toUpperCase();
}
