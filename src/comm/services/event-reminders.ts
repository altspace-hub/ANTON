/**
 * event-reminders.ts — schedule local notifications for upcoming events
 * the user wants to be reminded about (R11).
 *
 * Native path uses @capacitor/local-notifications. Web fallback uses
 * setTimeout (only fires while the page is open — acceptable since the
 * Comm App is primarily mobile-installed).
 *
 * IDs: LocalNotifications wants a numeric id. We hash the event id to a
 * stable positive int so reconcile can find + cancel matching pending
 * notifications without keeping a separate mapping table.
 */
import { Capacitor } from '@capacitor/core';
import type { CommEvent } from './events';
import { listEvents } from './events';

const CHANNEL_ID = 'event-reminders';
let permissionPromise: Promise<boolean> | null = null;
const webTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Lazy-load the plugin so the web build doesn't pull a useless dep. */
async function loadPlugin(): Promise<typeof import('@capacitor/local-notifications').LocalNotifications | null> {
  if (Capacitor.getPlatform() === 'web') return null;
  try {
    const mod = await import('@capacitor/local-notifications');
    return mod.LocalNotifications;
  } catch {
    return null;
  }
}

/** Stable positive 31-bit int derived from an event id. */
function notificationIdFor(eventId: string): number {
  let h = 0;
  for (let i = 0; i < eventId.length; i++) {
    h = (h * 31 + eventId.charCodeAt(i)) | 0;
  }
  return Math.abs(h) || 1;
}

/** Request POST_NOTIFICATIONS permission (Android 13+, iOS). Cached. */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (permissionPromise) return permissionPromise;
  permissionPromise = (async () => {
    const plugin = await loadPlugin();
    if (!plugin) return true; // web fallback — no perm needed
    try {
      const cur = await plugin.checkPermissions();
      if (cur.display === 'granted') return true;
      const req = await plugin.requestPermissions();
      return req.display === 'granted';
    } catch {
      return false;
    }
  })();
  return permissionPromise;
}

/** Compute the trigger Date for an event reminder; returns null if it would be in the past. */
export function reminderTriggerAt(event: CommEvent): Date | null {
  if (!event.reminderMinutesBefore || event.canceled) return null;
  const start = new Date(event.startAt).getTime();
  const fireAt = start - event.reminderMinutesBefore * 60 * 1000;
  return fireAt > Date.now() ? new Date(fireAt) : null;
}

/** Schedule (or reschedule) a single event's reminder. Safe to call repeatedly. */
export async function scheduleEventReminder(event: CommEvent): Promise<void> {
  const id = event.id;
  await cancelEventReminder(id); // dedupe — wipe any prior schedule first

  const trigger = reminderTriggerAt(event);
  if (!trigger) return;

  const title = event.title || 'Upcoming event';
  const minutesBefore = event.reminderMinutesBefore!;
  const body = formatReminderBody(event, minutesBefore);

  const plugin = await loadPlugin();
  if (plugin) {
    const ok = await ensureNotificationPermission();
    if (!ok) return;
    try {
      await plugin.schedule({
        notifications: [{
          id: notificationIdFor(id),
          title,
          body,
          schedule: { at: trigger, allowWhileIdle: true },
          channelId: CHANNEL_ID,
          // The eventId travels back to JS via the listener so the user can
          // tap-deep-link straight into the event detail screen.
          extra: { eventId: id },
        }],
      });
    } catch (err) {
      console.warn('[reminders] schedule failed', err);
    }
    return;
  }

  // Web fallback — only fires while the page lives, but that's fine for dev.
  const prev = webTimers.get(id);
  if (prev) clearTimeout(prev);
  const t = setTimeout(() => {
    if (typeof Notification !== 'undefined') {
      try { new Notification(title, { body }); } catch { /* ignore */ }
    } else {
      console.info('[reminder]', title, body);
    }
  }, trigger.getTime() - Date.now());
  webTimers.set(id, t);
}

export async function cancelEventReminder(eventId: string): Promise<void> {
  const plugin = await loadPlugin();
  if (plugin) {
    try { await plugin.cancel({ notifications: [{ id: notificationIdFor(eventId) }] }); }
    catch { /* ignore */ }
  }
  const t = webTimers.get(eventId);
  if (t) { clearTimeout(t); webTimers.delete(eventId); }
}

/**
 * Walk all stored events and (re)schedule any that have a reminder set
 * and fire in the future. Called once on app boot — keeps reminders
 * alive across process restarts.
 */
export async function reconcileAllReminders(): Promise<void> {
  let events: CommEvent[] = [];
  try { events = await listEvents(); } catch { return; }
  await Promise.all(events.map(async (e) => {
    if (e.canceled || !e.reminderMinutesBefore) {
      await cancelEventReminder(e.id);
      return;
    }
    await scheduleEventReminder(e);
  }));
}

function formatReminderBody(event: CommEvent, minutesBefore: number): string {
  const when = minutesBefore >= 60
    ? `in ${Math.round(minutesBefore / 60)} hour${minutesBefore >= 120 ? 's' : ''}`
    : `in ${minutesBefore} minute${minutesBefore === 1 ? '' : 's'}`;
  const loc = event.location ? ` · ${event.location}` : '';
  return `Starting ${when}${loc}`;
}
