/**
 * notifications.ts — Business App: fire a local OS notification when
 * a pending receipt flips to confirmed. Lifted from Pay/Comm — same
 * @capacitor/local-notifications plugin, same dynamic-import pattern.
 */
import { Capacitor } from '@capacitor/core';
import type { Receipt } from './types';

type LocalNotificationsPlugin = typeof import('@capacitor/local-notifications').LocalNotifications;

let permissionPromise: Promise<boolean> | null = null;

/**
 * Read the registered plugin off the global bridge — NEVER `await` the proxy
 * (it's thenable → `await proxy` hangs forever; the dynamic import() can also
 * stall on device). See reference_capacitor_plugin_registration.
 */
function loadPlugin(): LocalNotificationsPlugin | null {
  if (Capacitor.getPlatform() === 'web') return null;
  const w = window as unknown as {
    Capacitor?: { Plugins?: { LocalNotifications?: LocalNotificationsPlugin } };
  };
  return w.Capacitor?.Plugins?.LocalNotifications ?? null;
}

// Android 8+ drops a notification whose channel was never created (no auto-create).
const ensuredChannels = new Set<string>();
async function ensureChannel(plugin: LocalNotificationsPlugin, id: string, name: string): Promise<void> {
  if (ensuredChannels.has(id)) return;
  ensuredChannels.add(id);
  try {
    await plugin.createChannel({ id, name, importance: 5, visibility: 1, vibration: true });
  } catch { /* older Android / web — schedule() will still try */ }
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (permissionPromise) return permissionPromise;
  permissionPromise = (async () => {
    const plugin = loadPlugin();
    if (!plugin) {
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

function idFor(orderId: string): number {
  let h = 0;
  for (let i = 0; i < orderId.length; i++) {
    h = (h * 31 + orderId.charCodeAt(i)) | 0;
  }
  return Math.abs(h) || 1;
}

function formatSek(sek: number): string {
  return sek.toLocaleString('sv-SE', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

/** Fire one notification when a pending receipt confirms. Title shows
 *  the SEK amount (the merchant's frame of reference); body shows the
 *  kvitto number for cross-reference. Best-effort — errors swallowed. */
export async function notifyReceiptConfirmed(receipt: Receipt): Promise<void> {
  const ok = await ensureNotificationPermission();
  if (!ok) return;
  const title = `Payment received · ${formatSek(receipt.amountSek)} SEK`;
  const body = `Kvitto K-${String(receipt.kvittoNumber).padStart(6, '0')} confirmed on-chain`;
  const plugin = loadPlugin();
  if (plugin) {
    try {
      await ensureChannel(plugin, 'fc-business-incoming', 'Payments received');
      await plugin.schedule({
        notifications: [{
          id: idFor(receipt.orderId),
          title, body,
          schedule: { at: new Date(Date.now() + 250) },
          smallIcon: 'ic_stat_notify',
          channelId: 'fc-business-incoming',
        }],
      });
    } catch { /* swallow */ }
    return;
  }
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try { new Notification(title, { body, tag: receipt.orderId }); } catch { /* no-op */ }
  }
}
