/**
 * active-chat.ts — tracks which conversation is currently on-screen so the
 * notification layer can suppress a banner for the thread the user is already
 * looking at (WhatsApp/Signal behaviour). The App shell keeps this in sync via
 * setActiveConversation(); chat.ts reads it before firing an inbound-message
 * notification.
 *
 * Module-level singleton on purpose — there is exactly one foreground view.
 */

let activeConversation: string | null = null;

/** Called by the App shell whenever the open thread changes (null when not in a chat). */
export function setActiveConversation(hash: string | null): void {
  activeConversation = hash;
}

export function getActiveConversation(): string | null {
  return activeConversation;
}

/** True when the app is visible in the foreground (jsdom/web defaults to visible). */
export function isAppForeground(): boolean {
  if (typeof document === 'undefined') return true;
  return document.visibilityState === 'visible';
}

/**
 * True when the user is actively looking at this conversation right now — i.e.
 * the app is foregrounded AND this thread is the open one. A notification for
 * such a message would be redundant, so callers skip it.
 */
export function isViewingConversation(hash: string): boolean {
  return isAppForeground() && activeConversation === hash;
}
