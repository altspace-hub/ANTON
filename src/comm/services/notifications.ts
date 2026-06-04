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

type LocalNotificationsPlugin = typeof import('@capacitor/local-notifications').LocalNotifications;

let permissionPromise: Promise<boolean> | null = null;

/**
 * Read the already-registered LocalNotifications plugin off the global bridge.
 *
 * A dynamic `import('@capacitor/local-notifications')` can HANG FOREVER on
 * device when its lazy Vite chunk load stalls (notably while the app is
 * backgrounded) — the same trap that bit geo.ts. Because the awaited call never
 * settled, an inbound-message notification silently never fired. The plugin is
 * registered at boot from capacitor.plugins.json, so the global is always
 * present in the native app; reading it is synchronous and never hangs.
 */
function loadPlugin(): LocalNotificationsPlugin | null {
  if (Capacitor.getPlatform() === 'web') return null;
  const w = window as unknown as {
    Capacitor?: { Plugins?: { LocalNotifications?: LocalNotificationsPlugin } };
  };
  return w.Capacitor?.Plugins?.LocalNotifications ?? null;
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

/**
 * Android 8+ silently DROPS a notification whose channelId was never created —
 * the @capacitor/local-notifications plugin does NOT auto-create channels. So
 * we explicitly create each channel before first use (idempotent; no-op on
 * Android <8 and on web). Without this, nothing ever appears in the tray.
 */
type LocalNotif = NonNullable<Awaited<ReturnType<typeof loadPlugin>>>;
const ensuredChannels = new Set<string>();
async function ensureChannel(
  plugin: LocalNotif,
  id: string,
  name: string,
  importance: 1 | 2 | 3 | 4 | 5 = 5,
): Promise<void> {
  if (ensuredChannels.has(id)) return;
  ensuredChannels.add(id);
  try {
    await plugin.createChannel({ id, name, importance, visibility: 1, vibration: true });
  } catch { /* older Android / web — schedule() will still try */ }
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
  const plugin = loadPlugin();
  if (plugin) {
    try {
      await ensureChannel(plugin, 'fc-comm-incoming', 'Payments received');
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

export interface IncomingMessageNotice {
  /** Sender's contact hash — also routed as `extra.commThread` so a tap opens the thread. */
  fromHash: string;
  /** Sender's display name; falls back to a generic title when absent. */
  fromName?: string;
  /** One-line body (already built by message-preview.ts). */
  preview: string;
  /** Stable id for OS-level dedup across re-deliveries of the same message. */
  messageId: string;
}

/**
 * Fire a heads-up notification for a new inbound chat message. Mirrors
 * notifyIncoming() but on its own channel (`fc-comm-messages`) and carrying
 * `extra.commThread` so the App's tap handler can open that conversation.
 * Best-effort: silently no-ops without permission / plugin.
 */
export async function notifyIncomingMessage(n: IncomingMessageNotice): Promise<void> {
  const ok = await ensureNotificationPermission();
  if (!ok) return;
  const title = n.fromName?.trim() || 'New message';
  const body = n.preview;
  const plugin = loadPlugin();
  if (plugin) {
    try {
      await ensureChannel(plugin, 'fc-comm-messages', 'Messages');
      await plugin.schedule({
        notifications: [{
          id: idFor(`msg:${n.messageId}`),
          title, body,
          schedule: { at: new Date(Date.now() + 250) },
          smallIcon: 'ic_stat_icon_config_sample',
          channelId: 'fc-comm-messages',
          extra: { commThread: n.fromHash },
        }],
      });
    } catch { /* swallow */ }
    return;
  }
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try { new Notification(title, { body, tag: `msg:${n.messageId}` }); } catch { /* no-op */ }
  }
}
