/**
 * coding-atom-stats.ts — ANTON Studio Phase 4 measurement (the Markets lesson).
 *
 * The project-scoped coding-atoms loop (migration 239 + the buildAtomLayer
 * "## LESSONS FROM THIS PROJECT" injection + the 2.0x project boost) claims to
 * make a project smarter as it runs — fewer revise-rounds on later tasks. That
 * claim is FALSIFIABLE here, mirroring atom-ab.ts:
 *
 *  - ~20% of coding TASKS are a deterministic HOLDOUT (assignTaskAtomArm hashes
 *    the task id — replayable, no Math.random). Holdout tasks should be run by
 *    the orchestrator WITHOUT the project-lessons injection (codingProjectId
 *    omitted); injected tasks get it. The arm here is computed purely from the
 *    task id so the dashboard can attribute outcomes without a new column —
 *    EXACTLY the atom-ab deterministic-holdout pattern, keyed on coding_task_id
 *    instead of the user-message id.
 *
 *  - PRIMARY METRIC = mean REVISE-ROUNDS PER TASK (count of
 *    coding_workspace_applications WHERE kind='revision' for that task),
 *    injected vs holdout. Fewer is better — a working loop drives later tasks
 *    to green with fewer revisions.
 *
 *  - getCodingAtomAbStats() refuses to publish a verdict below
 *    MIN_SCORED_PER_ARM tasks per arm (reused from atom-ab), and the dashboard
 *    does NOT claim the loop works until sufficient WITH a non-negative
 *    (fewer-revisions, i.e. delta <= 0) result.
 *
 * NOTE: assignAtomArm / MIN_SCORED_PER_ARM are IMPORTED from atom-ab.ts
 * VERBATIM (the task forbids editing that harness) — only the KEY differs
 * (coding_task_id) and the metric (revise-rounds, not quality).
 */

import type { DatabaseAdapter } from '../db/database.js';
import { assignAtomArm, MIN_SCORED_PER_ARM, type AtomArm } from './atom-ab.js';

export type CodingAtomArm = AtomArm; // 'injected' | 'holdout'

/**
 * Deterministic per-task arm assignment. Delegates to atom-ab's assignAtomArm
 * (sha256(id) % 5 === 0 → holdout, ~20%) keyed on the coding TASK id. Same
 * unbiased, replayable holdout — only the hashed identity differs.
 */
export function assignTaskAtomArm(codingTaskId: string): CodingAtomArm {
  return assignAtomArm(codingTaskId);
}

export interface CodingAtomArmStats {
  /** Tasks (with ≥1 application) attributed to this arm. */
  tasks: number;
  /** Same as tasks — the arm's scored sample size (kept parallel to atom-ab). */
  scored: number;
  /** Total revision applications across this arm's tasks. */
  revisions: number;
  /** Mean revise-rounds per task — null when tasks = 0. LOWER is better. */
  meanReviseRounds: number | null;
}

export interface CodingAtomAbStats {
  minPerArm: number;
  /** True only when BOTH arms have >= minPerArm scored tasks. */
  sufficient: boolean;
  arms: Record<CodingAtomArm, CodingAtomArmStats>;
  /**
   * injected mean − holdout mean revise-rounds; null until both means exist.
   * For this experiment a NEGATIVE delta is the WIN (the loop cut revisions).
   */
  delta: number | null;
  /**
   * The honest headline gate: only true when sufficient AND delta is
   * non-negative-as-a-win, i.e. delta <= 0 (injected used FEWER revise-rounds).
   * The dashboard must NOT claim the loop works unless this is true.
   */
  worksClaimSupported: boolean;
}

/**
 * Aggregate the loop's effectiveness. We count revise-rounds per task from
 * coding_workspace_applications (kind='revision'), assign each task to an arm
 * deterministically from its id, and compare the per-arm mean.
 *
 * A task "counts" once it has at least one workspace application (initial or
 * revision) — i.e. the build loop actually touched it. Tasks the loop never
 * ran are excluded (no signal). Revisions are counted across ALL of a task's
 * applications regardless of kind tally so a 0-revision task contributes a
 * legitimate 0 to its arm's mean (not an exclusion).
 */
export async function getCodingAtomAbStats(db: DatabaseAdapter): Promise<CodingAtomAbStats> {
  const empty = (): CodingAtomArmStats => ({ tasks: 0, scored: 0, revisions: 0, meanReviseRounds: null });
  const arms: Record<CodingAtomArm, CodingAtomArmStats> = { injected: empty(), holdout: empty() };

  // One row per task the loop touched: total applications + revision count.
  let rows: Array<{ coding_task_id: string; revisions: number | string }>;
  try {
    rows = await db.all(
      `SELECT coding_task_id,
              SUM(CASE WHEN kind = 'revision' THEN 1 ELSE 0 END) AS revisions
       FROM coding_workspace_applications
       WHERE coding_task_id IS NOT NULL
       GROUP BY coding_task_id`,
    ) as Array<{ coding_task_id: string; revisions: number | string }>;
  } catch {
    // Table missing (un-migrated install) — return an honest empty/insufficient.
    return { minPerArm: MIN_SCORED_PER_ARM, sufficient: false, arms, delta: null, worksClaimSupported: false };
  }

  for (const r of rows) {
    if (!r.coding_task_id) continue;
    const arm = assignTaskAtomArm(r.coding_task_id);
    const a = arms[arm];
    a.tasks += 1;
    a.scored += 1;
    a.revisions += Number(r.revisions) || 0;
  }

  for (const arm of ['injected', 'holdout'] as const) {
    const a = arms[arm];
    a.meanReviseRounds = a.tasks > 0 ? a.revisions / a.tasks : null;
  }

  const sufficient =
    arms.injected.scored >= MIN_SCORED_PER_ARM && arms.holdout.scored >= MIN_SCORED_PER_ARM;

  const delta =
    arms.injected.meanReviseRounds !== null && arms.holdout.meanReviseRounds !== null
      ? arms.injected.meanReviseRounds - arms.holdout.meanReviseRounds
      : null;

  // The loop "works" only when we have enough data AND injected used no MORE
  // revise-rounds than holdout (delta <= 0). Anything else = no claim.
  //
  // NOTE: this gate is NOISE-BLIND — a delta of −0.01 amid huge variance passes
  // it. coding-atom-ab-report.ts (buildCodingAtomAbReport) supersedes it with an
  // effect-size + significance verdict; this field stays for back-compat only.
  const worksClaimSupported = sufficient && delta !== null && delta <= 0;

  return { minPerArm: MIN_SCORED_PER_ARM, sufficient, arms, delta, worksClaimSupported };
}

/**
 * The PER-TASK revise-round samples per arm — the raw arrays the honest reporter
 * (coding-atom-ab-report.ts) needs to compute spread + a significance test, not
 * just the means getCodingAtomAbStats() returns. Same query + same deterministic
 * arm assignment; one element per task the loop actually touched.
 */
export interface CodingAtomAbSamples {
  /** Per-task revise-round counts for the injected (treatment) arm. */
  injected: number[];
  /** Per-task revise-round counts for the deterministic 20% holdout arm. */
  holdout: number[];
}

export async function getCodingAtomAbSamples(db: DatabaseAdapter): Promise<CodingAtomAbSamples> {
  const out: CodingAtomAbSamples = { injected: [], holdout: [] };

  let rows: Array<{ coding_task_id: string; revisions: number | string }>;
  try {
    rows = await db.all(
      `SELECT coding_task_id,
              SUM(CASE WHEN kind = 'revision' THEN 1 ELSE 0 END) AS revisions
       FROM coding_workspace_applications
       WHERE coding_task_id IS NOT NULL
       GROUP BY coding_task_id`,
    ) as Array<{ coding_task_id: string; revisions: number | string }>;
  } catch {
    // Table missing (un-migrated install) — honest empty samples.
    return out;
  }

  for (const r of rows) {
    if (!r.coding_task_id) continue;
    out[assignTaskAtomArm(r.coding_task_id)].push(Number(r.revisions) || 0);
  }
  return out;
}
