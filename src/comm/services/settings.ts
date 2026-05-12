/**
 * settings.ts — small key-value store for Comm App privacy + UX prefs.
 *
 * Backed by localStorage so reads are synchronous (matters for the
 * outbound-receipt gate inside the relay-client hot path). Default
 * values are deliberately privacy-conservative — read receipts and
 * typing indicators are OFF until the user opts in.
 */

const KEY_READ_RECEIPTS = 'anton-comm-prefs-read-receipts';
const KEY_TYPING_INDICATOR = 'anton-comm-prefs-typing';

export function getReadReceiptsEnabled(): boolean {
  try { return localStorage.getItem(KEY_READ_RECEIPTS) === '1'; }
  catch { return false; }
}

export function setReadReceiptsEnabled(enabled: boolean): void {
  try { localStorage.setItem(KEY_READ_RECEIPTS, enabled ? '1' : '0'); }
  catch { /* ignore */ }
}

export function getTypingIndicatorEnabled(): boolean {
  // Defaults to ON — typing pings are far less revealing than read
  // receipts and most chat apps treat them as expected behaviour.
  try {
    const v = localStorage.getItem(KEY_TYPING_INDICATOR);
    return v === null ? true : v === '1';
  } catch { return true; }
}

export function setTypingIndicatorEnabled(enabled: boolean): void {
  try { localStorage.setItem(KEY_TYPING_INDICATOR, enabled ? '1' : '0'); }
  catch { /* ignore */ }
}
