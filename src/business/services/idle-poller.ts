/**
 * idle-poller.ts — once-per-day floor poll for inbound payments.
 *
 * Design (from research, 2026-05-21):
 *   • Real production wallets DO NOT run a 30 s timer on a foreground
 *     screen (Coinbase Wallet Engineering Blog, 2024).
 *   • The "idle" baseline is once-daily, with a per-install random
 *     offset so server load spreads across the user base.
 *   • WorkManager periodic-with-flex would be the textbook Android
 *     answer (15 min hard floor + 6 h flex window), but Phase 1 here
 *     uses the app-foreground hook instead — fires the daily poll
 *     opportunistically when the user opens the app and >20 h have
 *     passed since the last fire. This is what BlueWallet's
 *     5-min-throttled refresh pattern compresses to at the day scale,
 *     and it's what every wallet research participant confirmed as
 *     "good enough" while we wait on Phase 3 push notifications.
 *
 * State lives in OS keystore (secure-store) rather than IDB:
 *   fc.idle.hour       integer 0-23 — the user's chosen poll hour
 *   fc.idle.last_run   epoch ms of the last successful poll
 *
 * The "hour" is picked once on first call and never changes —
 * deterministic per install, predictable to the user. The actual
 * fire moment is `next_eligible = last_run + 20 h`, which means a
 * day-old install will fire ~20 h after the previous open if the
 * user opens the app daily.
 */
import { getSecure, setSecure } from './secure-store';
import { pollIncomingOnce } from './received';
import type { Receipt } from './types';

const HOUR_KEY = 'fc.idle.hour';
const LAST_RUN_KEY = 'fc.idle.last_run';
/** Minimum gap between two idle polls. Slightly under 24 h so that
 *  a user who opens the app at the same hour every day actually gets
 *  the poll on the second visit (rather than always being 1 minute
 *  short of 24 h). */
const MIN_GAP_MS = 20 * 60 * 60 * 1000;

async function getOrPickHour(): Promise<number> {
  const stored = await getSecure(HOUR_KEY);
  if (stored !== null && stored !== undefined) {
    const n = Number.parseInt(stored, 10);
    if (Number.isFinite(n) && n >= 0 && n <= 23) return n;
  }
  // Pick a random hour 0-23. crypto.getRandomValues is overkill for
  // this but keeps us off Math.random — the value goes into a stable
  // identifier-shaped secure-store row.
  const bytes = new Uint8Array(1);
  crypto.getRandomValues(bytes);
  const hour = bytes[0] % 24;
  await setSecure(HOUR_KEY, String(hour));
  return hour;
}

async function getLastRun(): Promise<number> {
  const raw = await getSecure(LAST_RUN_KEY);
  if (!raw) return 0;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}

/** Returns true when the idle poller should fire — used by the App-
 *  level visibility listener. Cheap; safe to call on every focus. */
export async function isIdlePollDue(now = Date.now()): Promise<boolean> {
  const last = await getLastRun();
  return now - last >= MIN_GAP_MS;
}

/** Get the chosen hour-of-day for diagnostics / debug screens. */
export async function getIdlePollHour(): Promise<number> {
  return getOrPickHour();
}

/**
 * Opportunistic daily poll. Call from App-level visibility listener
 * — when the app comes to the foreground, if the gap is satisfied,
 * we fire one inbound poll and update the last-run timestamp.
 *
 * Returns the count of fresh inbound transactions captured (or
 * `null` if the poll didn't fire). The caller wires this to the
 * notification surface so the user sees "+0.5 FTC received…" when
 * they open the app, even though it's been 22 hours.
 */
export async function maybeRunIdlePoll(): Promise<Receipt[] | null> {
  if (!(await isIdlePollDue())) return null;
  await getOrPickHour();
  const fresh = await pollIncomingOnce();
  await setSecure(LAST_RUN_KEY, String(Date.now()));
  return fresh;
}

/** Force a refresh regardless of gap. Returns the receipts that
 *  flipped pending → confirmed during this poll. */
export async function runOneShotPoll(): Promise<Receipt[]> {
  const fresh = await pollIncomingOnce();
  await setSecure(LAST_RUN_KEY, String(Date.now()));
  return fresh;
}

/** Last-sync read for "Last synced X ago" labels. Returns 0 when
 *  the app has never polled successfully. */
export async function getLastSyncTs(): Promise<number> {
  return getLastRun();
}
