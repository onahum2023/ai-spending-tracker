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
 * Right after a website name and a "*" (the processor prefix, "NAME-CHEAP.COM* JZSPGX") a short run of capitals is one too,
 * even without digits. It has to be that structure: "OPENAI* CHATGPT" and "GOOGLE *GEMINI" are words, not codes.
 */
function looksLikeReference(token: string, previous: string | undefined): boolean {
  if (/^\d{4,}$/.test(token)) return true;
  if (/^[A-Za-z0-9]{5,16}$/.test(token) && /\d/.test(token) && /[A-Za-z]/.test(token)) return true;
  return /^[A-Z]{5,8}$/.test(token) && previous !== undefined && /\.[A-Za-z]{2,4}\*$/.test(previous);
}

/**
 * The description without its noise, keeping the original capitals (for showing to people).
 * Never returns an empty string: a description that is all noise comes back trimmed as it is.
 */
export function cleanDescriptor(merchant: string): string {
  const trimmed = merchant.trim();
  // Statements pad the merchant and its city into fixed columns: the city follows a run of two or more spaces.
  const head = trimmed.split(/\s{2,}/)[0] ?? trimmed;
  // "OPENAI *CHATGPT" and "OPENAI* CHATGPT" are the same thing.
  const spaced = head.replace(/\s*\*\s*/g, '* ').trim();
  // Drop reference codes, but never the first word (that is the merchant itself).
  const all = spaced.split(/\s+/);
  const words = all.filter((w, i) => i === 0 || !looksLikeReference(w.replace(/[*,.]+$/g, ''), all[i - 1]));
  // Drop trailing punctuation and company-form words ("GITHUB, INC." -> "GITHUB").
  for (;;) {
    const last = words[words.length - 1];
    if (words.length > 1 && last !== undefined && CORPORATE_SUFFIX.test(last.replace(/[,]+$/g, '').replace(/\.$/, ''))) {
      words.pop();
      continue;
    }
    break;
  }
  const out = words.join(' ').replace(/[\s*,.\-]+$/g, '').replace(/,\s*$/, '').trim();
  return out || trimmed;
}

/** The grouping key of a charge type within a provider: the cleaned description, upper case. */
export function normalizeDescriptor(merchant: string): string {
  return cleanDescriptor(merchant).toUpperCase();
}
