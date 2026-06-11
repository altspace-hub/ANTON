/**
 * orchestrator-spend-gate.ts — Wave 3.6: orchestrator spend gate.
 *
 * Problem (live numbers, 2026-06): 2,627 briefings generated, 0 proposals
 * rated, trust ladder stuck at Stage 1 forever. The heartbeat keeps spending
 * LLM tokens on briefings/proposals that nobody reads or rates — zero
 * behavioural consequence.
 *
 * The gate: when the last N proposals (default 10, configurable via
 * app_settings key 'orchestrator_unrated_pause_threshold') are ALL unrated,
 * heartbeat LLM briefing generation is PAUSED. Deterministic signal
 * aggregation, pattern detection and stage checks keep running. On-demand
 * (manual "Generate Briefing") is never gated — it is an explicit user ask.
 *
 * Resume is automatic: rating any of the recent proposals changes the
 * query result and the gate opens on the next check. Gate state transitions
 * are persisted (app_settings 'orchestrator_spend_gate_state') so each
 * transition is logged exactly once and a notification is created on pause.
 */

import type { DatabaseAdapter } from '../db/database.js';
import { createNotification } from './notification-service.js';

export const DEFAULT_UNRATED_PAUSE_THRESHOLD = 10;
export const SPEND_GATE_THRESHOLD_KEY = 'orchestrator_unrated_pause_threshold';
export const SPEND_GATE_STATE_KEY = 'orchestrator_spend_gate_state';

export interface SpendGateState {
  /** true = heartbeat LLM briefing generation is paused */
  paused: boolean;
  /** how many of the most recent proposals are unrated (consecutive from newest) */
  unratedStreak: number;
  /** the configured threshold N */
  threshold: number;
  /** human-readable status for surfacing in the UI */
  reason: string;
}

// ── Pure logic (unit-tested without a DB) ───────────────────────────────────

/**
 * Evaluate the spend gate from the ratings of the most recent proposals
 * (newest first). Pure function.
 *
 * Pauses only when there are at least `threshold` recent proposals AND every
 * one of the last `threshold` is unrated. Fewer proposals than the threshold
 * never pauses (a fresh install must be allowed to generate its first batch).
 */
export function evaluateSpendGate(
  recentRatingsNewestFirst: Array<string | null>,
  threshold: number = DEFAULT_UNRATED_PAUSE_THRESHOLD
): SpendGateState {
  const t = Number.isFinite(threshold) && threshold >= 1 ? Math.floor(threshold) : DEFAULT_UNRATED_PAUSE_THRESHOLD;
  const window = recentRatingsNewestFirst.slice(0, t);

  let unratedStreak = 0;
  for (const r of recentRatingsNewestFirst) {
    if (r === null || r === undefined || r === '') unratedStreak++;
    else break;
  }

  const paused = window.length >= t && window.every((r) => r === null || r === undefined || r === '');

  return {
    paused,
    unratedStreak,
    threshold: t,
    reason: paused
      ? `Paused: the last ${t} proposals are unrated — rate recent proposals to resume`
      : window.length < t
        ? `Active: only ${window.length} proposal(s) generated so far (gate engages at ${t} consecutive unrated)`
        : `Active: a proposal within the last ${t} has been rated`,
  };
}

// ── DB-backed checks ─────────────────────────────────────────────────────────

/** Read the configurable threshold from app_settings (clamped 1–100). */
export async function getSpendGateThreshold(db: DatabaseAdapter): Promise<number> {
  try {
    const row = await db.get(
      'SELECT value FROM app_settings WHERE key = ?',
      SPEND_GATE_THRESHOLD_KEY
    ) as { value: string } | undefined;
    if (row?.value) {
      const n = parseInt(row.value, 10);
      if (Number.isFinite(n) && n >= 1) return Math.min(n, 100);
    }
  } catch { /* table missing → default */ }
  return DEFAULT_UNRATED_PAUSE_THRESHOLD;
}

/** Compute the current gate state from the live proposals table. */
export async function checkSpendGate(db: DatabaseAdapter): Promise<SpendGateState> {
  const threshold = await getSpendGateThreshold(db);
  try {
    const rows = await db.all(
      'SELECT human_rating FROM orchestrator_proposals ORDER BY created_at DESC LIMIT ?',
      threshold
    ) as Array<{ human_rating: string | null }>;
    return evaluateSpendGate(rows.map((r) => r.human_rating), threshold);
  } catch {
    // Table missing (fresh install) — never pause.
    return evaluateSpendGate([], threshold);
  }
}

/**
 * Check the gate AND log/persist any state transition (pause ↔ resume).
 * On a pause transition a system notification is created so the user sees
 * "Paused: rate recent proposals to resume" in the notification tray too.
 */
export async function checkAndRecordSpendGate(db: DatabaseAdapter): Promise<SpendGateState> {
  const state = await checkSpendGate(db);

  try {
    const row = await db.get(
      'SELECT value FROM app_settings WHERE key = ?',
      SPEND_GATE_STATE_KEY
    ) as { value: string } | undefined;
    const previous: { paused: boolean } | null = row?.value ? JSON.parse(row.value) as { paused: boolean } : null;

    if (!previous || previous.paused !== state.paused) {
      await db.run(
        'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        SPEND_GATE_STATE_KEY,
        JSON.stringify({ paused: state.paused, changed_at: new Date().toISOString(), threshold: state.threshold })
      );

      if (state.paused) {
        console.warn(`[orchestrator-spend-gate] PAUSED — last ${state.threshold} proposals all unrated. Heartbeat briefing generation halted until a proposal is rated.`);
        await createNotification(db, {
          type: 'system',
          title: 'ANTON Orchestrator — Paused: rate recent proposals to resume',
          message: `The last ${state.threshold} proposals are unrated. Briefing generation is paused (deterministic checks keep running). Rate any recent proposal to resume.`,
          link: '/orchestrator',
        });
      } else if (previous) {
        console.log('[orchestrator-spend-gate] RESUMED — a recent proposal was rated. Heartbeat briefing generation re-enabled.');
      }
    }
  } catch (err) {
    // Gate transition bookkeeping must never break the caller.
    console.warn('[orchestrator-spend-gate] transition record failed (non-fatal):', err);
  }

  return state;
}
