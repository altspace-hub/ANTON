/**
 * app-lock.ts — opt-in biometric lock on app open.
 *
 * When enabled, the app shows a full-screen LockScreen on cold start
 * and again whenever it returns from the background after being away
 * longer than the grace window. Unlock goes through the OS biometric
 * prompt (services/biometric.ts), which itself falls back to the
 * device PIN / pattern / password — so no separate app secret is
 * stored: the lock is exactly as strong as the device's own lock.
 *
 * The enabled flag lives in localStorage. The locked/unlocked runtime
 * state is NOT persisted — every cold start re-locks if the flag is
 * on. Off by default; the merchant turns it on in Settings.
 */

const KEY = 'fc.business.appLockEnabled';

/** Re-lock on resume only if the app was backgrounded longer than
 *  this. A quick app-switch (scan, copy, glance at a message) inside
 *  the window doesn't demand a fresh unlock. */
export const APP_LOCK_GRACE_MS = 60_000;

export function isAppLockEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setAppLockEnabled(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    /* localStorage unavailable — lock simply stays off */
  }
}
