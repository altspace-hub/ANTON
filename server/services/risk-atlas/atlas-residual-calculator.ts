// ── Atlas Residual Calculator — DETERMINISTIC ────────────────────────────
//
// THIS IS THE CROWN JEWEL OF THE METHODOLOGY.
//
// Per spec §14: "Do not let an LLM decide the residual score. The rule is
// deterministic. The rationale around the score can be LLM-generated; the
// number cannot. This is non-negotiable for audit defensibility."
//
// The full deterministic surface:
//
//   1. Inherent risk per path = max(exposure_score, threat_score, vulnerability_score)
//      (chain is as weak as its weakest link — universal across the methodology)
//   2. Control quality rollup per path = WORST strength across all controls
//      linked to ANY vulnerability of the path (one bad control sinks the rollup)
//   3. Residual = inherent − reduction_from_rollup, clamped to [1, 5]
//      where Strong = -2, Adequate = -1, Weak = 0, Absent = 0
//   4. Appetite position = bucket from residual:
//      1-2 within, 3 boundary, 4 outside, 5 unacceptable
//
// Every step has a unit test. No branch is undocumented. No LLM is involved.

import type {
  Score1to5,
  ControlQualityRollup,
  ControlStrength,
  AppetitePosition,
  ResidualCalcInput,
  ResidualCalcResult,
} from './types.js';
import {
  RESIDUAL_REDUCTION,
  APPETITE_POSITION_FROM_RESIDUAL,
} from './types.js';

// ── Stage 4 — inherent ───────────────────────────────────────────────────

/**
 * Inherent risk = max of (exposure, threat credibility, vulnerability).
 *
 * Why max and not average/product:
 *   The spec is explicit ("chain is as weak as its weakest link"). A path
 *   with low exposure but high vulnerability is still high-inherent — the
 *   risk shows up the moment exposure changes. Averaging hides this.
 */
export function calculateInherent(
  exposure: Score1to5,
  threat: Score1to5,
  vulnerability: Score1to5,
): Score1to5 {
  return Math.max(exposure, threat, vulnerability) as Score1to5;
}

// ── Stage 5 helper — control quality rollup per path ─────────────────────

/**
 * Roll up the strength across an arbitrary set of control strengths into
 * a single per-path quality grade.
 *
 * Rules (spec-driven):
 *   • Empty list → 'absent' (the path has no controls at all)
 *   • Worst-of: any 'weak' present → 'weak'; otherwise any 'adequate' → 'adequate';
 *     all 'strong' → 'strong'.
 *
 * Why worst-of, not best-of or average:
 *   A regulator/auditor reading the Atlas needs to see what is true of the
 *   weakest link, not the marketing brochure. A path covered by one strong
 *   control + one weak control is, in practice, weak — because the gap is
 *   exploitable. This mirrors the inherent-max rule.
 */
export function rollupControlQuality(strengths: ControlStrength[]): ControlQualityRollup {
  if (strengths.length === 0) return 'absent';
  if (strengths.some(s => s === 'weak'))     return 'weak';
  if (strengths.some(s => s === 'adequate')) return 'adequate';
  return 'strong';
}

// ── Stage 6 — residual ───────────────────────────────────────────────────

/**
 * Apply the residual reduction.
 *
 * Reduction table (spec §2.1):
 *   strong   → -2
 *   adequate → -1
 *   weak     →  0
 *   absent   →  0   (no controls = no reduction)
 *
 * Result clamped to [1, 5]. A residual below 1 isn't meaningful (you cannot
 * have negative residual risk — the floor is "low but real"). A residual
 * above 5 is impossible by construction since reductions can only decrease.
 */
export function calculateResidual(input: ResidualCalcInput): ResidualCalcResult {
  const { inherent_score, control_quality_rollup } = input;
  const reduction = RESIDUAL_REDUCTION[control_quality_rollup];
  const raw = inherent_score - reduction;
  const residual_score = clampToScore(raw);
  const appetite_position = APPETITE_POSITION_FROM_RESIDUAL[residual_score];
  return {
    residual_score,
    appetite_position,
    reduction_applied: reduction,
    rationale: buildRationale(inherent_score, control_quality_rollup, reduction, residual_score, appetite_position),
  };
}

// ── Stage 7 — appetite bucket ────────────────────────────────────────────

/** Bucket a residual score into an appetite position. */
export function appetitePositionFor(residual: Score1to5): AppetitePosition {
  return APPETITE_POSITION_FROM_RESIDUAL[residual];
}

// ── Composed end-to-end calc ─────────────────────────────────────────────

/**
 * Convenience: compute inherent + residual + appetite from raw inputs.
 * Used by the executor when both inherent and residual change in the same
 * write (e.g. user re-scored exposure AND a control strength).
 */
export function calculatePathScores(input: {
  exposure: Score1to5;
  threat: Score1to5;
  vulnerability: Score1to5;
  control_strengths: ControlStrength[];
}): {
  inherent_score: Score1to5;
  residual_score: Score1to5;
  appetite_position: AppetitePosition;
  control_quality_rollup: ControlQualityRollup;
  reduction_applied: number;
  rationale: string;
} {
  const inherent = calculateInherent(input.exposure, input.threat, input.vulnerability);
  const rollup = rollupControlQuality(input.control_strengths);
  const r = calculateResidual({ inherent_score: inherent, control_quality_rollup: rollup });
  return {
    inherent_score: inherent,
    residual_score: r.residual_score,
    appetite_position: r.appetite_position,
    control_quality_rollup: rollup,
    reduction_applied: r.reduction_applied,
    rationale: r.rationale,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────

function clampToScore(n: number): Score1to5 {
  if (n < 1) return 1;
  if (n > 5) return 5;
  return n as Score1to5;
}

function buildRationale(
  inherent: Score1to5,
  rollup: ControlQualityRollup,
  reduction: number,
  residual: Score1to5,
  appetite: AppetitePosition,
): string {
  const reductionWord = reduction === 0 ? 'no reduction' : `−${reduction}`;
  const rollupWord = rollup === 'absent' ? 'no controls in place' : `${rollup} control coverage`;
  return [
    `Inherent ${inherent} (max of exposure/threat/vulnerability).`,
    `Controls: ${rollupWord} → ${reductionWord}.`,
    `Residual ${residual} → ${appetite} appetite position.`,
  ].join(' ');
}
