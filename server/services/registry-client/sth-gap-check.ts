/**
 * sth-gap-check.ts — detect staleness of the registry's Signed Tree Head.
 *
 * The Registry Server should publish a fresh STH at least every ~60 min
 * (spec §7.4). If the newest STH we can fetch has a timestamp older than the
 * warning threshold, something is wrong: the registry server is down, our
 * connection is broken, or (worst case) the log is being withheld to hide
 * inserted operations. Any of those needs operator attention.
 *
 * Closes audit improvement #3c — the transparency-log freshness guarantee
 * was undefended. This module ships two pieces:
 *
 *   1. `computeSthGap(sth, now)` — pure check usable from tests + CLI.
 *   2. `startSthGapMonitor(client, opts)` — periodic poller that logs a
 *      warning when the gap crosses the threshold. Called once from the
 *      server bootstrap (see server/index.ts).
 */

import type { SignedTreeHead } from './types.js';

// ── Constants ──────────────────────────────────────────────────────────────

/** Warn after 90 minutes with no fresh STH. Matches spec §7.4 guidance. */
export const STH_GAP_WARNING_MS = 90 * 60 * 1000;
/** Default polling interval — checks 4-5× per warning window. */
export const STH_GAP_CHECK_INTERVAL_MS = 20 * 60 * 1000;

export type SthGapStatus = 'fresh' | 'stale' | 'unparseable';

export interface SthGapResult {
  status: SthGapStatus;
  gapMs: number;
  thresholdMs: number;
  /** Formatted reason when status != 'fresh'. */
  reason?: string;
}

/**
 * Compare an STH's timestamp against now. `thresholdMs` defaults to
 * `STH_GAP_WARNING_MS`. Pure — takes `now` for deterministic tests.
 */
export function computeSthGap(
  sth: SignedTreeHead,
  now: Date = new Date(),
  thresholdMs: number = STH_GAP_WARNING_MS,
): SthGapResult {
  const ts = Date.parse(sth.timestamp);
  if (Number.isNaN(ts)) {
    return {
      status: 'unparseable',
      gapMs: 0,
      thresholdMs,
      reason: `STH timestamp '${sth.timestamp}' could not be parsed`,
    };
  }
  const gapMs = now.getTime() - ts;
  if (gapMs > thresholdMs) {
    return {
      status: 'stale',
      gapMs,
      thresholdMs,
      reason: `STH is ${Math.round(gapMs / 60000)} min old (treeSize=${sth.treeSize}); threshold is ${Math.round(thresholdMs / 60000)} min`,
    };
  }
  return { status: 'fresh', gapMs, thresholdMs };
}

// ── Monitor ────────────────────────────────────────────────────────────────

export interface SthGapMonitorOptions {
  intervalMs?: number;
  thresholdMs?: number;
  /**
   * Emits when we detect the registry log has gone stale OR become fresh
   * again after being stale. Default implementation logs to console — wire
   * to your alerting stack (pino, PagerDuty, etc.) at call site.
   */
  onStatusChange?: (result: SthGapResult) => void;
  /** Called on transport / signature errors during polling. */
  onFetchError?: (err: unknown) => void;
}

interface StsFetcher {
  fetchLatestSth(): Promise<{ sth: SignedTreeHead; signature: string }>;
}

export interface SthGapMonitor {
  /** Stop the periodic check. Safe to call from multiple places. */
  stop(): void;
  /** Last observed result — useful for health-check endpoints. */
  lastResult(): SthGapResult | null;
}

/**
 * Start a periodic STH-freshness poller. Returns a handle that exposes the
 * last observed result and a `stop()` that clears the timer. Idempotent on
 * repeated stop calls.
 */
export function startSthGapMonitor(
  client: StsFetcher,
  opts: SthGapMonitorOptions = {},
): SthGapMonitor {
  const intervalMs = opts.intervalMs ?? STH_GAP_CHECK_INTERVAL_MS;
  const thresholdMs = opts.thresholdMs ?? STH_GAP_WARNING_MS;
  const onStatusChange = opts.onStatusChange ?? defaultOnStatusChange;
  const onFetchError = opts.onFetchError ?? defaultOnFetchError;

  let lastStatus: SthGapStatus | null = null;
  let last: SthGapResult | null = null;
  let stopped = false;

  const tick = async (): Promise<void> => {
    if (stopped) return;
    try {
      const envelope = await client.fetchLatestSth();
      const result = computeSthGap(envelope.sth, new Date(), thresholdMs);
      last = result;
      // Edge-triggered — only emit on transitions so we don't spam on every tick.
      if (result.status !== lastStatus) {
        lastStatus = result.status;
        onStatusChange(result);
      }
    } catch (err) {
      onFetchError(err);
    }
  };

  // First tick immediately (don't wait `intervalMs` for the startup read) so
  // a cold-started instance surfaces a stale registry right away.
  void tick();
  const timer = setInterval(() => { void tick(); }, intervalMs);
  // Unref so the timer doesn't keep the Node process alive by itself.
  timer.unref?.();

  return {
    stop(): void {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
    },
    lastResult(): SthGapResult | null {
      return last;
    },
  };
}

function defaultOnStatusChange(result: SthGapResult): void {
  if (result.status === 'stale' || result.status === 'unparseable') {
    console.warn(`[portals] STH check: ${result.status} — ${result.reason}`);
  } else {
    console.log(`[portals] STH check: fresh (gap=${Math.round(result.gapMs / 1000)}s)`);
  }
}

function defaultOnFetchError(err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  console.warn(`[portals] STH fetch failed: ${msg}`);
}
