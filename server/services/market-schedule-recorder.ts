/**
 * market-schedule-recorder.ts
 * Records every markets scheduler phase run in market_schedule_runs.
 *
 * 2026-08-26: markets LLM work stopped after Monday's 23:00 phase and was
 * only noticed 33 hours later. Free work — grading, price and news fetching —
 * carried on the whole time, so from outside nothing looked broken; only
 * atom extraction, daily intelligence and the pulse were dead. By the time it
 * was found, the terminal scrollback that was the scheduler's ONLY output had
 * been cleared, and the restart that fixed it destroyed the evidence with it.
 *
 * market_schedule_runs has existed since migration 074 with exactly the right
 * columns, and nothing had ever written to it.
 *
 * Wired up, it separates the four cases that logs alone could not:
 *
 *   ran fine    → status 'completed', with timings
 *   HUNG        → status 'running', completed_at still null
 *   threw       → status 'failed' with the message
 *   never fired → no row at all
 *
 * "Hung" versus "never fired" is the distinction that was missing on the day.
 * They are different bugs — one is a stuck await, the other a dead cron — and
 * the database could not tell them apart.
 */

import type { DatabaseAdapter } from '../db/database.js';

/** Longest error text kept; the column is unbounded but a stack dump is not useful. */
const MAX_ERROR_CHARS = 2000;

export interface SchedulePhaseRecorder {
  /**
   * Run `fn` under the recorder. Resolves true when the work ran, false when it
   * was skipped because another caller already claimed the same slot.
   */
  recordPhase(phase: string, fn: () => Promise<void>, slotAt?: Date): Promise<boolean>;
}

export function createSchedulePhaseRecorder(db: DatabaseAdapter): SchedulePhaseRecorder {
  /**
   * Run `fn`, bracketed by a row in market_schedule_runs.
   *
   * Bookkeeping never breaks the work it observes: if the INSERT or either
   * UPDATE fails, the phase still runs and still completes. A recorder that
   * can take down the scheduler is worse than no recorder.
   *
   * `slotAt` (2026-09-03) additionally makes the row a CLAIM on one scheduled
   * occurrence. Two callers now race for every slot — the cron callback and the
   * catch-up tick that covers cron failing to fire at all — and the unique
   * index from migration 263 decides between them: the loser's INSERT returns
   * no row and it skips the work rather than doing it twice. For the LLM phases
   * a double run means paying twice and writing two sets of predictions for one
   * slot, so this distinction is load-bearing rather than tidy.
   *
   * Note the asymmetry with the fail-open rule above, which is deliberate: an
   * INSERT that THROWS still runs the phase (a broken recorder must not stop
   * the loop), while an INSERT that succeeds with no row means someone else
   * holds the slot and the work genuinely should not happen.
   */
  async function recordPhase(phase: string, fn: () => Promise<void>, slotAt?: Date): Promise<boolean> {
    let runId: number | null = null;
    try {
      const row = slotAt
        ? await db.get<{ id: number }>(
            `INSERT INTO market_schedule_runs (phase, status, slot_at)
             VALUES (?, 'running', ?)
             ON CONFLICT (phase, slot_at) DO NOTHING
             RETURNING id`,
            phase, slotAt.toISOString(),
          )
        : await db.get<{ id: number }>(
            `INSERT INTO market_schedule_runs (phase, status) VALUES (?, 'running') RETURNING id`,
            phase,
          );
      if (slotAt && !row) {
        // Claimed elsewhere. Debug-level on purpose: on a healthy host this is
        // the normal outcome of every catch-up tick and would otherwise bury
        // the log in noise.
        return false;
      }
      runId = row?.id ?? null;
    } catch (err) {
      console.warn(
        `[markets-schedule] could not open a run row for ${phase}:`,
        err instanceof Error ? err.message : err,
      );
    }

    const close = async (status: 'completed' | 'failed', error?: string): Promise<void> => {
      if (runId === null) return;
      try {
        await db.run(
          `UPDATE market_schedule_runs
              SET status = ?, completed_at = NOW(), error = ?
            WHERE id = ?`,
          status, error ?? null, runId,
        );
      } catch (err) {
        console.warn(
          `[markets-schedule] could not close the run row for ${phase}:`,
          err instanceof Error ? err.message : err,
        );
      }
    };

    try {
      await fn();
      await close('completed');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await close('failed', message.slice(0, MAX_ERROR_CHARS));
      // The phases catch their own errors, so anything arriving here is
      // unexpected. Logged rather than rethrown: a throwing cron callback is
      // an unhandled rejection, and the row already records what happened.
      console.error(`[markets-schedule] ${phase} threw:`, message);
    }
    return true;
  }

  return { recordPhase };
}
