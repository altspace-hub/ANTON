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

/**
 * How many times one slot may be attempted before it is left alone.
 *
 * Retries are new spend that did not exist before: every retried slot is at
 * least one more paid LLM cycle. Three is enough to ride out a transient
 * failure (an expired credit balance being topped up, a network that comes back
 * when the laptop gets home) without a permanently-broken phase burning a cycle
 * every five minutes for the whole of its catch-up window.
 */
export const MAX_SLOT_ATTEMPTS = 3;

/**
 * SQL predicate identifying a slot that is still owed: it was attempted, the
 * attempt failed, and it has attempts left.
 *
 * Exported so the recorder's claim and the catch-up's gate ask exactly the same
 * question. If they drifted, the tick would either pick slots it cannot claim
 * (noisy) or skip slots it could (a silent regression of the whole feature).
 *
 * `qualifier` exists because ON CONFLICT DO UPDATE must name the table to refer
 * to the existing row, while a plain WHERE must not.
 *
 * Note what is NOT retryable: a row still 'running'. The tempting rule is to
 * treat one as orphaned after some number of hours, and on this machine that is
 * unsafe — it suspends constantly, and a suspended run's WALL clock bears no
 * relation to its work. The 2026-09-04 cycle measured 3h11m wall against about
 * seven seconds of CPU. A wall-clock threshold short enough to catch a real
 * orphan would double-run a merely sleeping one, and double-running the LLM
 * phases is exactly what the slot claim exists to prevent. Proving orphanhood
 * needs a per-process runner token; until that exists, a row left 'running' by
 * a killed process holds its slot until the window passes, which is no worse
 * than the behaviour before slots existed at all.
 */
export function retryableSlotSql(qualifier?: string): string {
  const q = qualifier ? `${qualifier}.` : '';
  return `${q}status = 'failed' AND COALESCE((${q}metadata->>'attempts')::int, 1) < ${MAX_SLOT_ATTEMPTS}`;
}

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
            // The claim and the retry are one statement. On conflict Postgres
            // takes a row lock, so a second caller waits and then re-evaluates
            // the WHERE against the committed row — two callers can never both
            // win. DO UPDATE ... WHERE that matches nothing returns no row, which
            // is the same "someone else holds this" answer DO NOTHING gave.
            `INSERT INTO market_schedule_runs (phase, status, slot_at, metadata)
             VALUES (?, 'running', ?, '{"attempts":1}'::jsonb)
             ON CONFLICT (phase, slot_at) DO UPDATE
                SET status = 'running',
                    started_at = NOW(),
                    completed_at = NULL,
                    error = NULL,
                    metadata = jsonb_set(
                      COALESCE(market_schedule_runs.metadata, '{}'::jsonb),
                      '{attempts}',
                      to_jsonb(COALESCE((market_schedule_runs.metadata->>'attempts')::int, 1) + 1)
                    )
              WHERE ${retryableSlotSql('market_schedule_runs')}
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
