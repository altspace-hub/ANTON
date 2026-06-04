/**
 * background-setup.ts — JS bridge to the native BackgroundPolling plugin for
 * the Comm wallet (push-notifications plan, Phase 2). Port of
 * src/pay/services/background-setup.ts. A WorkManager job polls the PUBLIC
 * get_utxos endpoint every ~15 min and fires a local notification on a new
 * incoming payment, even while the app is backgrounded/killed. No keys/tokens
 * leave the device.
 *
 * All exports no-op on web / non-native.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { getActiveWalletMeta } from './wallets';
import { getEndpoint } from './fc-rpc';

interface BackgroundPollingPlugin {
  enable(opts: { address: string; endpoint?: string }): Promise<void>;
  disable(): Promise<void>;
  syncSeen(opts: { txIds: string[] }): Promise<void>;
  runNow(): Promise<{ notified: number }>;
}

// registerPlugin returns a proxy — only call its METHODS, never `await` the
// proxy itself (it's thenable → awaiting it hangs).
const BackgroundPolling = registerPlugin<BackgroundPollingPlugin>('BackgroundPolling');

/** Schedule (idempotent) the background payment poll for the active wallet. */
export async function ensureBackgroundPollingEnabled(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const meta = await getActiveWalletMeta();
    if (!meta?.address) return;
    const endpoint = await getEndpoint();
    await BackgroundPolling.enable({ address: meta.address, endpoint });
  } catch { /* best-effort — never block app start */ }
}

/**
 * Push the foreground's known tx hashes into the worker's "seen" set so it
 * never notifies for the user's OWN change outputs nor double-notifies a
 * payment the app already surfaced.
 */
export async function bgSyncSeen(txIds: string[]): Promise<void> {
  if (!Capacitor.isNativePlatform() || txIds.length === 0) return;
  try { await BackgroundPolling.syncSeen({ txIds }); } catch { /* best-effort */ }
}

/** Run one poll now (manual refresh / device test). Returns #notified. */
export async function bgRunNow(): Promise<number> {
  if (!Capacitor.isNativePlatform()) return 0;
  try { return (await BackgroundPolling.runNow())?.notified ?? 0; } catch { return 0; }
}
