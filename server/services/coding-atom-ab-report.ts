/**
 * coding-atom-ab-report.ts — ANTON Studio: the HONEST effectiveness reporter.
 *
 * The first ANTON Studio dogfood project (chosen 2026-06-13): build the very
 * instrument that says whether the project-scoped coding-atoms loop ACTUALLY
 * works — and make that claim falsifiable, the way the Markets pillar's
 * inverted-calibration audit taught us to.
 *
 * WHY THIS EXISTS — the bug it fixes. Phase 4 shipped getCodingAtomAbStats()
 * with a headline gate `worksClaimSupported = sufficient && delta <= 0`. That
 * gate declares "the loop reduces revisions" on a delta of −0.01 sitting in a
 * sea of variance — i.e. it can claim victory on pure statistical NOISE. The
 * Intelligence Dashboard renders exactly that overclaim today
 * (IntelligenceDashboard.tsx: "— the loop reduces revisions (or is neutral)").
 *
 * This reporter replaces the noise-blind gate with an effect-size + significance
 * verdict: it only says "the loop helps" when injected used FEWER revise-rounds
 * than the holdout AND that difference is beyond plausible noise (two-sided
 * large-sample z, α = 0.05). Otherwise it honestly reports "no detectable
 * effect (within noise)" or "insufficient data". Lower revise-rounds is better,
 * so a NEGATIVE delta is the win.
 *
 * The statistics are deliberately dependency-free and DETERMINISTIC (no RNG):
 * a two-sample comparison using a Welch standard error and a normal
 * approximation for the p-value. The normal approximation is honest here
 * because the verdict requires n ≥ MIN_SCORED_PER_ARM (30) per arm — the CLT
 * regime — and the report says so. Revise-rounds are small non-negative counts,
 * so this is an approximation, surfaced as such, not a precise t-test.
 *
 * The core compareNumericArms() is generic (two number[] arms) so the same
 * honest machinery can later score a benchmark-corpus arm (the kickstart path)
 * or be reused by the original atom-ab quality experiment.
 */

import type { DatabaseAdapter } from '../db/database.js';
import { MIN_SCORED_PER_ARM } from './atom-ab.js';
import { getCodingAtomAbSamples, type CodingAtomAbSamples } from './coding-atom-stats.js';

export const DEFAULT_ALPHA = 0.05;

export type EffectMagnitude = 'negligible' | 'small' | 'medium' | 'large';

export interface ArmSummary {
  /** Sample size (tasks the loop actually touched in this arm). */
  n: number;
  /** Mean revise-rounds per task — null when n = 0. */
  mean: number | null;
  /** Sample standard deviation (n−1) — null when n < 2 (undefined spread). */
  stdev: number | null;
  /** Standard error of the mean (stdev / sqrt(n)) — null when n < 2. */
  sem: number | null;
}

export interface NumericAbComparison {
  alpha: number;
  /** First arm (the treatment — 'injected'). */
  a: ArmSummary;
  /** Second arm (the control — 'holdout'). */
  b: ArmSummary;
  /** a.mean − b.mean; null until both means exist. Negative = a used fewer. */
  delta: number | null;
  /** Cohen's d over the pooled SD; null until both spreads exist. */
  effectSize: number | null;
  effectMagnitude: EffectMagnitude | null;
  /** Two-sample statistic over the Welch standard error; null until comparable. */
  zStatistic: number | null;
  /** Two-sided p-value (large-sample normal approximation); null until comparable. */
  pValue: number | null;
  /** p < alpha — null until a p-value exists. */
  significant: boolean | null;
}

// ── Pure statistics (deterministic, no dependencies, no RNG) ─────────────────

function mean(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

/** Sample variance (n−1 denominator). 0 when n < 2 (no spread to estimate). */
function sampleVariance(xs: number[], m: number): number {
  if (xs.length < 2) return 0;
  return xs.reduce((s, x) => s + (x - m) * (x - m), 0) / (xs.length - 1);
}

/**
 * Error function — Abramowitz & Stegun 7.1.26 (max abs error ~1.5e-7). Pure,
 * deterministic; the only "math" the p-value needs.
 */
export function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

/** Standard normal CDF Φ(x). */
export function normalCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

function effectMagnitude(d: number): EffectMagnitude {
  const a = Math.abs(d);
  if (a < 0.2) return 'negligible';
  if (a < 0.5) return 'small';
  if (a < 0.8) return 'medium';
  return 'large';
}

function summarize(xs: number[]): ArmSummary {
  if (xs.length === 0) return { n: 0, mean: null, stdev: null, sem: null };
  const m = mean(xs);
  if (xs.length < 2) return { n: xs.length, mean: m, stdev: null, sem: null };
  const variance = sampleVariance(xs, m);
  const stdev = Math.sqrt(variance);
  return { n: xs.length, mean: m, stdev, sem: stdev / Math.sqrt(xs.length) };
}

/**
 * Compare two numeric arms honestly. Generic so it can score injected-vs-holdout
 * revise-rounds today and a benchmark-corpus arm later. Returns nulls (never
 * fabricated zeros) whenever a quantity is genuinely undefined.
 */
export function compareNumericArms(
  a: number[],
  b: number[],
  alpha: number = DEFAULT_ALPHA,
): NumericAbComparison {
  const sa = summarize(a);
  const sb = summarize(b);

  const delta = sa.mean !== null && sb.mean !== null ? sa.mean - sb.mean : null;

  let effectSize: number | null = null;
  let effectMag: EffectMagnitude | null = null;
  if (sa.mean !== null && sb.mean !== null && sa.stdev !== null && sb.stdev !== null) {
    // Pooled SD (classic Cohen's d). Falls back to |delta| sign when both arms
    // have zero spread but differ — a perfectly-separated, maximal effect.
    const pooledVar =
      ((a.length - 1) * sa.stdev * sa.stdev + (b.length - 1) * sb.stdev * sb.stdev) /
      Math.max(1, a.length + b.length - 2);
    const pooledSd = Math.sqrt(pooledVar);
    if (pooledSd > 0) {
      effectSize = (sa.mean - sb.mean) / pooledSd;
      effectMag = effectMagnitude(effectSize);
    } else if (delta !== null && delta !== 0) {
      effectSize = delta > 0 ? Infinity : -Infinity;
      effectMag = 'large';
    } else {
      effectSize = 0;
      effectMag = 'negligible';
    }
  }

  let zStatistic: number | null = null;
  let pValue: number | null = null;
  let significant: boolean | null = null;

  // Need both means + both SEMs (so n ≥ 2 each) to run the test.
  if (sa.mean !== null && sb.mean !== null && sa.sem !== null && sb.sem !== null) {
    const se = Math.sqrt(sa.sem * sa.sem + sb.sem * sb.sem);
    if (se > 0) {
      zStatistic = (sa.mean - sb.mean) / se;
      pValue = 2 * (1 - normalCdf(Math.abs(zStatistic)));
      // Clamp p into (0,1] — the normal-approx tail can round to a hair over/under.
      pValue = Math.min(1, Math.max(0, pValue));
    } else {
      // Zero combined SE: both arms had zero variance. Either identical (no
      // effect, p=1) or perfectly separated (maximal effect, p≈0).
      if (sa.mean === sb.mean) {
        zStatistic = 0;
        pValue = 1;
      } else {
        zStatistic = sa.mean > sb.mean ? Infinity : -Infinity;
        pValue = 0;
      }
    }
    significant = pValue < alpha;
  }

  return {
    alpha,
    a: sa,
    b: sb,
    delta,
    effectSize,
    effectMagnitude: effectMag,
    zStatistic,
    pValue,
    significant,
  };
}

// ── The coding-atoms loop verdict ────────────────────────────────────────────

export type CodingAbVerdict =
  | 'insufficient_data'
  | 'no_detectable_effect'
  | 'loop_helps'
  | 'loop_hurts';

export interface CodingAtomAbReport {
  verdict: CodingAbVerdict;
  /** Short, honest headline for a dashboard chip. */
  headline: string;
  /** A plain-language paragraph an operator can act on. */
  detail: string;
  /**
   * Back-compatible flag — TRUE only when the loop is shown to HELP beyond
   * noise. Strictly stronger than P4's `sufficient && delta <= 0`.
   */
  worksClaimSupported: boolean;
  minPerArm: number;
  /** Tasks per arm; below minPerArm → insufficient_data regardless of delta. */
  sufficient: boolean;
  /** injected arm summary. */
  injected: ArmSummary;
  /** holdout arm summary. */
  holdout: ArmSummary;
  /** injected.mean − holdout.mean; negative = the loop cut revise-rounds. */
  delta: number | null;
  effectSize: number | null;
  effectMagnitude: EffectMagnitude | null;
  pValue: number | null;
  /** The full generic comparison (injected = a, holdout = b). */
  comparison: NumericAbComparison;
}

function fmt(x: number | null, digits = 2): string {
  return x === null || !Number.isFinite(x) ? '—' : x.toFixed(digits);
}

/**
 * Turn the two arms' per-task revise-round samples into the honest verdict.
 * injected = treatment (got the "## LESSONS FROM THIS PROJECT" block), holdout =
 * the deterministic 20% that did not.
 */
export function buildCodingAtomAbReport(
  samples: CodingAtomAbSamples,
  opts: { minPerArm?: number; alpha?: number } = {},
): CodingAtomAbReport {
  const minPerArm = opts.minPerArm ?? MIN_SCORED_PER_ARM;
  const alpha = opts.alpha ?? DEFAULT_ALPHA;

  const comparison = compareNumericArms(samples.injected, samples.holdout, alpha);
  const injected = comparison.a;
  const holdout = comparison.b;
  const sufficient = injected.n >= minPerArm && holdout.n >= minPerArm;
  const delta = comparison.delta;

  let verdict: CodingAbVerdict;
  let headline: string;
  let detail: string;

  if (!sufficient) {
    verdict = 'insufficient_data';
    headline = `Insufficient data (${injected.n}/${minPerArm} injected · ${holdout.n}/${minPerArm} holdout)`;
    detail =
      `The loop has not run enough tasks to judge yet. We need at least ${minPerArm} ` +
      `tasks in EACH arm (injected vs the deterministic 20% holdout); so far injected has ` +
      `${injected.n} and holdout has ${holdout.n}. No effectiveness claim is made until ` +
      `both arms reach the threshold — measured, not assumed.`;
  } else if (comparison.significant !== true) {
    verdict = 'no_detectable_effect';
    headline = `No detectable effect (Δ ${fmt(delta)} rev/task, p=${fmt(comparison.pValue, 3)})`;
    detail =
      `With ${injected.n} injected and ${holdout.n} holdout tasks, the difference in mean ` +
      `revise-rounds is ${fmt(delta)} per task (p=${fmt(comparison.pValue, 3)}, ${fmt(comparison.effectSize)} ` +
      `Cohen's d, ${comparison.effectMagnitude ?? '—'}). That is within statistical noise at ` +
      `α=${alpha}, so there is NO evidence the loop changes revise-rounds either way. A ` +
      `non-positive delta alone is not proof — this is exactly the overclaim the reporter exists to prevent.`;
  } else if (delta !== null && delta < 0) {
    // Reached only when sufficient AND significant are both true (the two
    // branches above returned otherwise) AND injected used fewer revisions.
    verdict = 'loop_helps';
    headline = `Loop helps: ${fmt(delta)} rev/task (p=${fmt(comparison.pValue, 3)})`;
    detail =
      `Injected tasks used ${fmt(Math.abs(delta))} FEWER revise-rounds per task than the holdout ` +
      `(injected ${fmt(injected.mean)} vs holdout ${fmt(holdout.mean)}), a ${comparison.effectMagnitude} ` +
      `effect (Cohen's d ${fmt(comparison.effectSize)}) significant at p=${fmt(comparison.pValue, 3)} ` +
      `(α=${alpha}). The project-scoped atoms loop is shown to reduce revisions on this evidence.`;
  } else {
    verdict = 'loop_hurts';
    headline = `Loop HURTS: +${fmt(delta)} rev/task (p=${fmt(comparison.pValue, 3)})`;
    detail =
      `Injected tasks used ${fmt(delta)} MORE revise-rounds per task than the holdout ` +
      `(injected ${fmt(injected.mean)} vs holdout ${fmt(holdout.mean)}), significant at ` +
      `p=${fmt(comparison.pValue, 3)} (α=${alpha}). The loop is making things WORSE on this ` +
      `evidence — investigate the injected lessons before trusting them.`;
  }

  return {
    verdict,
    headline,
    detail,
    worksClaimSupported: verdict === 'loop_helps',
    minPerArm,
    sufficient,
    injected,
    holdout,
    delta,
    effectSize: comparison.effectSize,
    effectMagnitude: comparison.effectMagnitude,
    pValue: comparison.pValue,
    comparison,
  };
}

/** Fetch the samples and build the report. Honest empty/insufficient on an un-migrated DB. */
export async function getCodingAtomAbReport(
  db: DatabaseAdapter,
  opts: { minPerArm?: number; alpha?: number } = {},
): Promise<CodingAtomAbReport> {
  const samples = await getCodingAtomAbSamples(db);
  return buildCodingAtomAbReport(samples, opts);
}
