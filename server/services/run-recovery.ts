/**
 * run-recovery.ts — what a restart owes the runs it killed.
 *
 * Wave 5 (2026-09-17). Long engine runs live in the in-process step-job
 * registry (step-job-registry.ts): a server restart ends them, silently. A
 * gap assessment that was 'assessing' when the process stopped stayed
 * 'assessing' for ever — GET answered `run_job: null`, the wizard showed
 * "Ready to assess" as if nothing had happened, and nothing said the run was
 * lost. Under `tsx watch` every file save is such a restart.
 *
 * At boot, `markInterruptedRuns` finds the rows still marked mid-run with no
 * live job behind them and marks them interrupted; the assessment GET then
 * answers `run_job: { status: 'lost', interruptedAt }` (lostRunJob) and the
 * wizard tells the reader to start the assessment again.
 *
 * The 'interrupted' STATUS is gated on the live schema: the baseline
 * gap_assessments_status_check constraint (schema.postgresql.sql) admits only
 * draft/assessing/scoring/synthesising/complete/paused, and migration 277
 * added `interrupted_at` without relaxing it. Until a migration does, the
 * row keeps status 'assessing' and carries interrupted_at alone; the GET
 * reads both shapes as lost. The probe is a read of pg_catalog, not a write
 * that fails on every boot.
 */
import type { DatabaseAdapter } from '../db/database.js';
import { getStepJob } from './step-job-registry.js';

/** The step-job key the gap run route uses (gap-assessments.ts). */
export const gapRunJobKey = (assessmentId: string): string => `gap-run:${assessmentId}`;

/** What the wizard receives for a run the server lost. */
export interface LostRunJob {
  status: 'lost';
  /** When recovery marked it; null when the row was found mid-run but never marked (recovery not yet wired). */
  interruptedAt: string | null;
}

const isoOrNull = (v: unknown): string | null =>
  v instanceof Date ? v.toISOString() : typeof v === 'string' && v ? v : null;

/**
 * The run_job for an assessment row with no live step job: 'lost' when the
 * row still says a run is in progress, null for every other status.
 */
export function lostRunJob(row: { status?: unknown; interrupted_at?: unknown }): LostRunJob | null {
  if (row.status !== 'assessing' && row.status !== 'interrupted') return null;
  return { status: 'lost', interruptedAt: isoOrNull(row.interrupted_at) };
}

/** The CHECK constraint on gap_assessments.status, as PostgreSQL prints it. */
export const INTERRUPTED_STATUS_PROBE_SQL =
  "SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'gap_assessments'::regclass AND contype = 'c' AND conname = 'gap_assessments_status_check'";

/** True when the status column admits 'interrupted' (no constraint, or one that names it). */
export async function interruptedStatusAllowed(db: DatabaseAdapter): Promise<boolean> {
  const row = await db.get<{ def: string }>(INTERRUPTED_STATUS_PROBE_SQL);
  return !row || String(row.def).includes("'interrupted'");
}

/**
 * Rows mid-run and not yet marked for THIS interruption. The run route sets
 * status 'assessing' and updated_at when a run starts but does not clear
 * interrupted_at, so a row restarted after an earlier interruption carries
 * a mark older than its start — that row was interrupted again and is
 * re-marked. The mark writes interrupted_at and updated_at from the same
 * NOW(), so a marked row is not picked up twice.
 */
export const ORPHANED_RUNS_SQL =
  "SELECT id FROM gap_assessments WHERE status = 'assessing' AND (interrupted_at IS NULL OR interrupted_at < updated_at)";
const MARK_WITH_STATUS_SQL = "UPDATE gap_assessments SET status = 'interrupted', interrupted_at = NOW(), updated_at = NOW() WHERE id = ?";
const MARK_TIMESTAMP_ONLY_SQL = 'UPDATE gap_assessments SET interrupted_at = NOW(), updated_at = NOW() WHERE id = ?';

/**
 * Mark every run the last process took down with it. Call once at boot,
 * after the database is up; safe to call again later (a row with a live
 * job is left alone). Logs one line with the count.
 */
export async function markInterruptedRuns(db: DatabaseAdapter): Promise<{ gapAssessments: number }> {
  const rows = await db.all<{ id: string }>(ORPHANED_RUNS_SQL);
  const orphaned = rows.filter((r) => getStepJob(gapRunJobKey(r.id))?.status !== 'running');

  let statusAllowed = false;
  if (orphaned.length > 0) {
    try {
      statusAllowed = await interruptedStatusAllowed(db);
    } catch {
      statusAllowed = false;   // an unreadable catalog is treated as the stricter schema
    }
    for (const { id } of orphaned) {
      await db.run(statusAllowed ? MARK_WITH_STATUS_SQL : MARK_TIMESTAMP_ONLY_SQL, id);
    }
  }

  const how = orphaned.length === 0
    ? ''
    : statusAllowed
      ? ' — marked interrupted'
      : ' — marked interrupted (interrupted_at only: gap_assessments_status_check does not yet admit the interrupted status)';
  console.log(`[run-recovery] ${orphaned.length} gap assessment(s) were mid-run when the server last stopped${how}`);
  return { gapAssessments: orphaned.length };
}
