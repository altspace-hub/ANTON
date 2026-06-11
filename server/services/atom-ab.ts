/**
 * atom-ab.ts — Atom-layer A/B effectiveness experiment
 * (CORE_EXPERIENCE_REVIEW 2026-06, Wave 3 item 3.4).
 *
 * The atom layer (buildAtomLayer) injects "prior knowledge atoms" into every
 * module run — the flagship learning claim — but its effect on output quality
 * has never been measured. This module makes the claim falsifiable:
 *
 *  - When atom injection is enabled and the run will be persisted, ~20% of
 *    runs are deterministically assigned to a HOLDOUT arm where the atom
 *    layer is skipped. Assignment hashes the (random) user-message id, so it
 *    is unbiased across runs yet fully deterministic for a given id — no
 *    Math.random, replayable in tests.
 *  - The arm is recorded in audit_log.atom_arm (migration 226) and in the
 *    run's run_artifacts.layer_summary (entry name `atom_ab_arm_<arm>`).
 *  - getAtomAbStats() compares mean quality_scores per arm and refuses to
 *    publish a verdict below MIN_SCORED_PER_ARM scored runs per arm.
 *
 * The experiment defaults ON whenever atom injection is on; the
 * `atom_ab_experiment` app_setting turns it off (Intelligence Dashboard
 * toggle). With the experiment off every run gets the atom layer as before.
 */

import crypto from 'crypto';
import type { DatabaseAdapter } from '../db/database.js';

export type AtomArm = 'injected' | 'holdout';

/** Honest minimum sample size before the dashboard publishes a comparison. */
export const MIN_SCORED_PER_ARM = 30;

/** app_settings key for the experiment kill switch. Missing key = ON. */
export const ATOM_AB_SETTING_KEY = 'atom_ab_experiment';

/**
 * Deterministic arm assignment: sha256(messageId), first 4 bytes as uint32,
 * % 5 === 0 → holdout (~20%). The id hashed is the freshly generated user
 * message UUID of the run, so arms are unbiased w.r.t. content/module/time.
 */
export function assignAtomArm(messageId: string): AtomArm {
  const digest = crypto.createHash('sha256').update(messageId, 'utf8').digest();
  return digest.readUInt32BE(0) % 5 === 0 ? 'holdout' : 'injected';
}

const OFF_VALUES = new Set(['off', 'false', '0', 'disabled', 'no']);

/**
 * Read the experiment switch. Default ON (the whole point is to collect the
 * number); any read failure also resolves ON so a missing app_settings table
 * never silently changes behaviour between installs.
 */
export async function isAtomAbEnabled(db: DatabaseAdapter): Promise<boolean> {
  try {
    const row = await db.get(
      'SELECT value FROM app_settings WHERE key = ?', ATOM_AB_SETTING_KEY,
    ) as { value: string } | undefined;
    if (!row) return true;
    return !OFF_VALUES.has(String(row.value).trim().toLowerCase());
  } catch {
    return true;
  }
}

export async function setAtomAbEnabled(db: DatabaseAdapter, enabled: boolean): Promise<void> {
  await db.run(
    `INSERT INTO app_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ATOM_AB_SETTING_KEY, enabled ? 'on' : 'off',
  );
}

export interface AtomArmStats {
  /** Tagged runs in audit_log for this arm. */
  runs: number;
  /** Quality-scored outputs attributable to this arm (single-arm sessions). */
  scored: number;
  /** Mean quality_scores.score_overall (0-10) — null when scored = 0. */
  meanQuality: number | null;
}

export interface AtomAbStats {
  enabled: boolean;
  minPerArm: number;
  /** True only when BOTH arms have >= minPerArm scored outputs. */
  sufficient: boolean;
  arms: Record<AtomArm, AtomArmStats>;
  /** injected mean − holdout mean; null until both means exist. */
  delta: number | null;
}

/**
 * Aggregate the experiment. Quality attribution joins audit_log → quality_scores
 * on session_id, restricted to sessions whose tagged runs all landed in ONE arm
 * (multi-turn sessions that straddled both arms are excluded rather than
 * guessed — quality_scores carries no message id, so per-run attribution
 * inside a mixed session would be a fabrication).
 */
export async function getAtomAbStats(db: DatabaseAdapter): Promise<AtomAbStats> {
  const empty = (): AtomArmStats => ({ runs: 0, scored: 0, meanQuality: null });
  const arms: Record<AtomArm, AtomArmStats> = { injected: empty(), holdout: empty() };

  const runRows = await db.all(
    `SELECT atom_arm AS arm, COUNT(*) AS runs
     FROM audit_log
     WHERE atom_arm IN ('injected', 'holdout')
     GROUP BY atom_arm`,
  ) as Array<{ arm: AtomArm; runs: number | string }>;
  for (const r of runRows) {
    if (r.arm in arms) arms[r.arm].runs = Number(r.runs);
  }

  const qualityRows = await db.all(
    `WITH session_arm AS (
       SELECT session_id, MIN(atom_arm) AS arm
       FROM audit_log
       WHERE atom_arm IN ('injected', 'holdout') AND session_id IS NOT NULL
       GROUP BY session_id
       HAVING COUNT(DISTINCT atom_arm) = 1
     )
     SELECT sa.arm AS arm, COUNT(q.id) AS scored, AVG(q.score_overall) AS mean_quality
     FROM session_arm sa
     JOIN quality_scores q ON q.session_id = sa.session_id
     GROUP BY sa.arm`,
  ) as Array<{ arm: AtomArm; scored: number | string; mean_quality: number | string | null }>;
  for (const r of qualityRows) {
    if (!(r.arm in arms)) continue;
    arms[r.arm].scored = Number(r.scored);
    arms[r.arm].meanQuality = r.mean_quality !== null ? Number(r.mean_quality) : null;
  }

  const sufficient =
    arms.injected.scored >= MIN_SCORED_PER_ARM && arms.holdout.scored >= MIN_SCORED_PER_ARM;
  const delta =
    arms.injected.meanQuality !== null && arms.holdout.meanQuality !== null
      ? arms.injected.meanQuality - arms.holdout.meanQuality
      : null;

  return {
    enabled: await isAtomAbEnabled(db),
    minPerArm: MIN_SCORED_PER_ARM,
    sufficient,
    arms,
    delta,
  };
}
