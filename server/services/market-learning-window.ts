/**
 * The trusted-measurement window.
 *
 * Every learning loop in Markets reads graded predictions and turns them into
 * a correction — signal weights, symbol overrides, confidence calibration.
 * All of them were pooling over the entire history, and the entire history is
 * not equally trustworthy.
 *
 * ── Why the cutoff exists ────────────────────────────────────────────────
 *
 * Predictions run back to March 2026, but the machinery that GRADED them was
 * defective until mid-August. Repaired between 14 and 20 August:
 *
 *   • fdaf8884  LLM verifier graded a prediction it had no evidence for
 *   • 2ad0add2  weekend deadlines were graded on a zero-length window
 *   • de28b868  weekday-only verification left tactical predictions ungraded
 *   • c7599864  price feeds reported success while serving stale or no data
 *   • 2d783cbf  NAV stamped a phantom flat session when prices hadn't landed
 *   • 1fd9d70f  NAV freshness guard was inert
 *
 * A `was_correct` written before those fixes is not a measurement, it is the
 * output of a broken instrument — wrong in BOTH directions by an unknown
 * amount. The split is stark: 92 graded before the boundary at 28.3%
 * accuracy, 82 after at 62.2%. Some unknown share of that gap is repaired
 * measurement rather than improved forecasting.
 *
 * ── Why this matters more than an aesthetic preference ───────────────────
 *
 * Pooling the two eras does not merely add noise, it inverts corrections.
 * Measured on 31 August 2026: the pooled confidence→accuracy mapping sends
 * the 0.60–0.80 band to 0.3806, because the broken era scored that band at
 * 28%. In the trusted window the same band runs at 73%. Applying the pooled
 * mapping to current predictions moves Brier from 0.2384 to 0.2557 — taking a
 * book that beats the coin-flip line (0.2500) and pushing it back over.
 *
 * A correction derived from a broken instrument is worse than no correction.
 * Hence: one constant, one place, every loop reads it.
 *
 * ── Moving it ────────────────────────────────────────────────────────────
 *
 * This is a claim about data quality, not a tuning knob. It should move only
 * when a NEW measurement defect is found and fixed, and then only forward.
 * `MARKETS_TRUSTED_SINCE` exists so that can be done without a deploy, and so
 * tests can pin their own window; it is not a dial to widen when the numbers
 * look thin.
 */

import { childLogger } from '../lib/logger.js';

const log = childLogger('market-learning-window');

/**
 * The date the grading path became trustworthy. Graded predictions validated
 * before this are excluded from every learning loop.
 */
export const DEFAULT_TRUSTED_SINCE = '2026-08-14';

let warnedInvalid = false;

/**
 * ISO date (YYYY-MM-DD) that `validated_at` must be on or after for a graded
 * prediction to inform a correction.
 *
 * Read from `MARKETS_TRUSTED_SINCE` when set to a valid ISO date, else the
 * default above. An unparseable override falls back rather than throwing —
 * a typo in an env var must not take the learning loops offline — but it says
 * so once, loudly, because silently widening the window is the failure mode
 * this whole module exists to prevent.
 */
export function trustedSince(): string {
  const raw = (process.env.MARKETS_TRUSTED_SINCE ?? '').trim();
  if (raw === '') return DEFAULT_TRUSTED_SINCE;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(raw))) {
    if (!warnedInvalid) {
      warnedInvalid = true;
      log.warn(
        { provided: raw, using: DEFAULT_TRUSTED_SINCE },
        'trusted_since_invalid_falling_back',
      );
    }
    return DEFAULT_TRUSTED_SINCE;
  }
  return raw;
}

/**
 * How many graded predictions the window currently holds, and how many it
 * excludes. Callers use this to refuse to act on a sample too thin to
 * support a correction, and to report what was left out rather than
 * silently narrowing.
 */
export async function windowCoverage(
  db: { get<T>(sql: string, ...args: unknown[]): Promise<T | undefined> },
): Promise<{ since: string; inWindow: number; excluded: number }> {
  const since = trustedSince();
  const row = await db.get<{ in_window: number | string; excluded: number | string }>(
    `SELECT
       count(*) FILTER (WHERE validated_at >= ?) AS in_window,
       count(*) FILTER (WHERE validated_at <  ?) AS excluded
     FROM market_predictions
     WHERE was_correct IS NOT NULL AND validated_at IS NOT NULL`,
    since, since,
  );
  return {
    since,
    inWindow: Number(row?.in_window ?? 0),
    excluded: Number(row?.excluded ?? 0),
  };
}
