/**
 * notifications.ts — fire a local notification when a new inbound
 * payment lands on the Comm App's active wallet. Lifted from
 * src/pay/services/notifications.ts.
 *
 * Reuses the same @capacitor/local-notifications plugin that Comm
 * already wires for event-reminders.ts — no extra Android gradle
 * work required.
 */
import { Capacitor } from '@capacitor/core';
import type { WalletTx } from './transactions';

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

function idFor(txHash: string): number {
  let h = 0;
  for (let i = 0; i < txHash.length; i++) {
    h = (h * 31 + txHash.charCodeAt(i)) | 0;
  }
  return Math.abs(h) || 1;
}

function abbreviate(addr: string): string {
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 10)}…${addr.slice(-4)}`;
}

function formatFtc(microFtcStr: string): string {
  const micro = BigInt(microFtcStr);
  const whole = micro / 1_000_000n;
  const frac = Number(micro % 1_000_000n) / 1_000_000;
  return (Number(whole) + frac).toLocaleString('en-US', {
    minimumFractionDigits: 0, maximumFractionDigits: 4,
  });
}

export async function notifyIncoming(tx: WalletTx, fromName?: string): Promise<void> {
  const ok = await ensureNotificationPermission();
  if (!ok || !tx.txHash) return;
  const title = `+${formatFtc(tx.amountMicroFtc)} FTC received`;
  const body = fromName
    ? `from ${fromName}`
    : tx.counterparty
      ? `from ${abbreviate(tx.counterparty)}`
      : 'A payment landed on your wallet';
  const plugin = await loadPlugin();
  if (plugin) {
    try {
      await plugin.schedule({
        notifications: [{
          id: idFor(tx.txHash),
          title, body,
          schedule: { at: new Date(Date.now() + 250) },
          smallIcon: 'ic_stat_icon_config_sample',
          channelId: 'fc-comm-incoming',
        }],
      });
    } catch { /* swallow */ }
    return;
  }
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try { new Notification(title, { body, tag: tx.txHash }); } catch { /* no-op */ }
  }
}
