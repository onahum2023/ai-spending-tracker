/*
 * The only two things this app keeps in localStorage (everything else is in IndexedDB).
 * The privacy statement (src/content/privacy.ts) says exactly this, and a test fails if any
 * other key is used, so change them together.
 */

/** "I'm exploring the demo", remembered across reloads. */
export const DEMO_FLAG = 'ai-spending-tracker.demo';
/** The user's own Anthropic API key, only when "Remember on this device" is ticked. */
export const KEY_STORE = 'ai-spending-tracker.anthropic-key';

/** Removes a remembered API key. Never throws: storage can be blocked. */
export function forgetApiKey(): void {
  try {
    localStorage.removeItem(KEY_STORE);
  } catch {
    /* nothing stored, or storage blocked */
  }
}

/** Removes everything this app keeps in localStorage: used by "Clear local data". */
export function clearLocalPrefs(): void {
  try {
    localStorage.removeItem(KEY_STORE);
    localStorage.removeItem(DEMO_FLAG);
  } catch {
    /* nothing stored, or storage blocked */
  }
}
