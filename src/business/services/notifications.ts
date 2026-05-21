/**
 * notifications.ts — Business App: fire a local OS notification when
 * a pending receipt flips to confirmed. Lifted from Pay/Comm — same
 * @capacitor/local-notifications plugin, same dynamic-import pattern.
 */
import { Capacitor } from '@capacitor/core';
import type { Receipt } from './types';

let permissionPromise: Promise<boolean> | null = null;

async function loadPlugin(): Promise<
  typeof import('@capacitor/local-notifications').LocalNotifications | null
> {
  if (Capacitor.getPlatform() === 'web') return null;
  try {
    const mod = await import('@capacitor/local-notifications');
    return mod.LocalNotifications;
  } catch {
    return null;
  }
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (permissionPromise) return permissionPromise;
  permissionPromise = (async () => {
    const plugin = await loadPlugin();
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
  const plugin = await loadPlugin();
  if (plugin) {
    try {
      await plugin.schedule({
        notifications: [{
          id: idFor(receipt.orderId),
          title, body,
          schedule: { at: new Date(Date.now() + 250) },
          smallIcon: 'ic_stat_icon_config_sample',
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
