/**
 * notifications.ts — fire a local OS notification when a new inbound
 * payment arrives. Native path uses @capacitor/local-notifications;
 * web path uses the browser Notification API as a best-effort
 * fallback (works in Chrome / Edge, silent on Safari without prompt).
 *
 * Pattern lifted from src/comm/services/event-reminders.ts so the two
 * apps stay consistent. We don't import the Capacitor plugin at the
 * top level — dynamic-import keeps the web build slim and avoids the
 * bridge-callback startup crash on any build that doesn't include
 * the plugin.
 */
import { Capacitor } from '@capacitor/core';
import type { ReceivedRecord } from './types';

type LocalNotificationsPlugin = typeof import('@capacitor/local-notifications').LocalNotifications;

let permissionPromise: Promise<boolean> | null = null;

/**
 * Read the already-registered LocalNotifications plugin off the global bridge.
 * NEVER `await` the return value: it's the Capacitor plugin proxy, which is
 * thenable (any property, incl. `.then`, resolves to a proxied native method),
 * so `await proxy` fires a native `then` call that never resolves → permanent
 * hang. A dynamic import() of the plugin chunk can also stall on device. The
 * plugin is registered at boot from capacitor.plugins.json, so the global is
 * always present. See reference_capacitor_plugin_registration.
 */
function loadPlugin(): LocalNotificationsPlugin | null {
  if (Capacitor.getPlatform() === 'web') return null;
  const w = window as unknown as {
    Capacitor?: { Plugins?: { LocalNotifications?: LocalNotificationsPlugin } };
  };
  return w.Capacitor?.Plugins?.LocalNotifications ?? null;
}

/**
 * Android 8+ silently DROPS a notification whose channelId was never created;
 * the plugin does NOT auto-create channels. Create each channel (idempotent)
 * before first use, else nothing appears in the tray.
 */
const ensuredChannels = new Set<string>();
async function ensureChannel(plugin: LocalNotificationsPlugin, id: string, name: string): Promise<void> {
  if (ensuredChannels.has(id)) return;
  ensuredChannels.add(id);
  try {
    await plugin.createChannel({ id, name, importance: 5, visibility: 1, vibration: true });
  } catch { /* older Android / web — schedule() will still try */ }
}

/** Ask once. Cached. Safe to call on every app start. */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (permissionPromise) return permissionPromise;
  permissionPromise = (async () => {
    const plugin = loadPlugin();
    if (!plugin) {
      // Web fallback — Notification API.
      if (typeof Notification === 'undefined') return false;
      if (Notification.permission === 'granted') return true;
      if (Notification.permission === 'denied') return false;
      const res = await Notification.requestPermission();
      return res === 'granted';
    }
    const cur = await plugin.checkPermissions();
    if (cur.display === 'granted') return true;
    const req = await plugin.requestPermissions();
    return req.display === 'granted';
  })();
  return permissionPromise;
}

/** Stable positive 31-bit int from a tx id so the OS can dedupe a
 *  notification across re-fires for the same tx. */
function idFor(txId: string): number {
  let h = 0;
  for (let i = 0; i < txId.length; i++) {
    h = (h * 31 + txId.charCodeAt(i)) | 0;
  }
  return Math.abs(h) || 1;
}

function abbreviate(addr: string): string {
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 10)}…${addr.slice(-4)}`;
}

function formatFtc(microFtc: bigint): string {
  // Compact display: integer + up to 4 decimals.
  const whole = microFtc / 1_000_000n;
  const frac = Number(microFtc % 1_000_000n) / 1_000_000;
  const n = Number(whole) + frac;
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
}

/** Fire one notification for a single inbound record. Best-effort —
 *  errors are swallowed so a notification failure never affects the
 *  payment ingest path. */
export async function notifyIncoming(record: ReceivedRecord): Promise<void> {
  const ok = await ensureNotificationPermission();
  if (!ok) return;
  const title = `+${formatFtc(record.amountMicroFtc)} FTC received`;
  const body = record.fromName
    ? `from ${record.fromName}`
    : record.fromAddress
      ? `from ${abbreviate(record.fromAddress)}`
      : 'A payment landed on your wallet';

  const plugin = loadPlugin();
  if (plugin) {
    try {
      await ensureChannel(plugin, 'fc-pay-incoming', 'Payments received');
      await plugin.schedule({
        notifications: [{
          id: idFor(record.txId),
          title,
          body,
          schedule: { at: new Date(Date.now() + 250) }, // ~immediate, dedupes bursts
          smallIcon: 'ic_stat_notify',
          channelId: 'fc-pay-incoming',
        }],
      });
    } catch { /* permission revoked / channel missing — silent */ }
    return;
  }
  // Web fallback.
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try { new Notification(title, { body, tag: record.txId }); } catch { /* no-op */ }
  }
}
