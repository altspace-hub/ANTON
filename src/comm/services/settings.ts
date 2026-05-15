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

/**
 * P3-4 audit fix: defaults to OFF.
 *
 * Why: this preference is symmetrically applied — the relay-client only
 * SENDS typing pings if we've opted in, and the chat surface only
 * RENDERS inbound typing if we've opted in too. So the user's choice
 * gates both directions and a one-sided "spy on typing" is impossible.
 * Conservative-by-default matches the read-receipts behaviour and the
 * file-header promise about privacy defaults.
 */
export function getTypingIndicatorEnabled(): boolean {
  try {
    return localStorage.getItem(KEY_TYPING_INDICATOR) === '1';
  } catch { return false; }
}

export function setTypingIndicatorEnabled(enabled: boolean): void {
  try { localStorage.setItem(KEY_TYPING_INDICATOR, enabled ? '1' : '0'); }
  catch { /* ignore */ }
}

// ── Notification channels ────────────────────────────────────────────
//
// Three independent channels the user can mute. These gate whether the
// app raises an OS notification — the OS-level permission is a separate
// prerequisite (see the Settings screen's Notifications section).
// Default ON: a messaging app silent by default is broken; the user
// opted into the app, so notifications are expected. They mute
// per-channel here.

export type NotificationChannel = 'dms' | 'events' | 'portals';

const CHANNEL_KEYS: Record<NotificationChannel, string> = {
  dms: 'anton-comm-notif-dms',
  events: 'anton-comm-notif-events',
  portals: 'anton-comm-notif-portals',
};

export function getNotificationChannelEnabled(channel: NotificationChannel): boolean {
  try {
    // Default ON — only an explicit '0' mutes the channel.
    return localStorage.getItem(CHANNEL_KEYS[channel]) !== '0';
  } catch {
    return true;
  }
}

export function setNotificationChannelEnabled(channel: NotificationChannel, enabled: boolean): void {
  try { localStorage.setItem(CHANNEL_KEYS[channel], enabled ? '1' : '0'); }
  catch { /* ignore */ }
}
