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
  recordPhase(phase: string, fn: () => Promise<void>): Promise<void>;
}

export function createSchedulePhaseRecorder(db: DatabaseAdapter): SchedulePhaseRecorder {
  /**
   * Run `fn`, bracketed by a row in market_schedule_runs.
   *
   * Bookkeeping never breaks the work it observes: if the INSERT or either
   * UPDATE fails, the phase still runs and still completes. A recorder that
   * can take down the scheduler is worse than no recorder.
   */
  async function recordPhase(phase: string, fn: () => Promise<void>): Promise<void> {
    let runId: number | null = null;
    try {
      const row = await db.get<{ id: number }>(
        `INSERT INTO market_schedule_runs (phase, status) VALUES (?, 'running') RETURNING id`,
        phase,
      );
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
  }

  return { recordPhase };
}
