/**
 * active-sync.ts — bounded aggressive polling for "I'm expecting a
 * payment" moments. The default mode of the app is the idle poller
 * (once-daily floor) + on-mount sync (one-shot) + pull-to-refresh.
 * Active sync is what the user gets when they tap Sync now, or what
 * the app auto-arms when the Receive screen mounts.
 *
 * Backoff curve (from research synthesis, 2026-05-21):
 *   0:00 – 0:30   poll every  5 s   (catch the "I just paid" case)
 *   0:30 – 1:30   poll every 10 s
 *   1:30 – 2:30   poll every 20 s
 *   2:30 – budget  poll every 30 s
 *
 * Stops on first fresh inbound tx, on explicit cancel, or on budget
 * exhaust — whichever comes first. The caller is given a cancel
 * function and a snapshot stream so it can render a live "0:42…"
 * banner with a Cancel button (Stripe Terminal pattern).
 *
 * Default budget: 5 minutes (consumer Sync). Merchant flows pass
 * { budgetMs: 10 * 60 * 1000 } when the QR is on screen — matches
 * BTCPay's invoice expiry and Galoy's POS "auto-arm on receive" UX.
 */
import { pollIncomingOnce } from './received';
import type { Receipt } from './types';

export interface ActiveSyncOptions {
  /** How long the active-sync should run before giving up.
   *  Default: 5 minutes. Business QR flows pass 10 min. */
  budgetMs?: number;
  /** Fired on every tick — caller renders "Waiting X:XX" + Cancel. */
  onTick?: (snapshot: ActiveSyncSnapshot) => void;
  /** Fired with the first batch of fresh inbound tx (records that
   *  weren't in the local store yet). Active-sync stops itself
   *  immediately after invoking this — no need to call cancel. */
  onFresh?: (fresh: Receipt[]) => void;
  /** Fired exactly once when active-sync ends, regardless of why
   *  (cancel / timeout / first-fresh). */
  onEnd?: (reason: ActiveSyncEndReason) => void;
}

export interface ActiveSyncSnapshot {
  elapsedMs: number;
  budgetMs: number;
  nextPollInMs: number;
  pollCount: number;
}

export type ActiveSyncEndReason = 'cancelled' | 'timeout' | 'fresh';

/** Compute the interval after `elapsedMs` of active-sync. Pure for
 *  testability; the curve is the single canonical place to tune. */
export function intervalAt(elapsedMs: number): number {
  if (elapsedMs < 30_000) return 5_000;
  if (elapsedMs < 90_000) return 10_000;
  if (elapsedMs < 150_000) return 20_000;
  return 30_000;
}

/**
 * Start an active-sync loop. Returns a `cancel` function the caller
 * MUST call when the screen unmounts (or the user taps Cancel). The
 * loop is internally robust to multiple cancels.
 */
export function startActiveSync(options: ActiveSyncOptions = {}): () => void {
  const budgetMs = options.budgetMs ?? 5 * 60 * 1000;
  const startedAt = Date.now();
  let pollCount = 0;
  let stopped = false;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  const end = (reason: ActiveSyncEndReason) => {
    if (stopped) return;
    stopped = true;
    if (timeoutHandle != null) {
      clearTimeout(timeoutHandle);
      timeoutHandle = null;
    }
    options.onEnd?.(reason);
  };

  const tick = async () => {
    if (stopped) return;
    const elapsed = Date.now() - startedAt;
    if (elapsed >= budgetMs) { end('timeout'); return; }

    pollCount += 1;
    let fresh: Receipt[] = [];
    try {
      fresh = await pollIncomingOnce();
    } catch {
      // pollIncomingOnce swallows its own errors; this catch covers
      // anything synchronous that slipped through.
    }
    if (stopped) return;

    if (fresh.length > 0) {
      options.onFresh?.(fresh);
      end('fresh');
      return;
    }

    const elapsedNow = Date.now() - startedAt;
    const nextInterval = Math.min(intervalAt(elapsedNow), budgetMs - elapsedNow);
    options.onTick?.({
      elapsedMs: elapsedNow,
      budgetMs,
      nextPollInMs: nextInterval,
      pollCount,
    });

    if (nextInterval <= 0) { end('timeout'); return; }
    timeoutHandle = setTimeout(tick, nextInterval);
  };

  // Fire the first poll immediately so the user gets instant feedback
  // if the payment has already landed by the time they tap Sync.
  void tick();

  return () => end('cancelled');
}

/** Format an elapsed ms as M:SS for the banner. */
export function formatElapsed(elapsedMs: number): string {
  const total = Math.floor(elapsedMs / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
