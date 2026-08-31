/**
 * Confidence recalibration.
 *
 * The loop that measures calibration has never closed. market_intelligence_service
 * computes per-bucket accuracy into market_confidence_calibration, anton-bundler
 * exports it, and a getter returns it for display — and that is the end of the
 * road. Nothing has ever fed a measured miscalibration back into the confidence
 * attached to a new prediction, which is why the inversion below survived being
 * measured for months.
 *
 * What the measurement says, over 174 graded predictions:
 *
 *     stated <0.4      4 graded   25.0% correct
 *     stated 0.4–0.6  90 graded   54.4% correct
 *     stated 0.6–0.8  72 graded   34.7% correct
 *     stated >=0.8     8 graded   25.0% correct
 *
 * Confidence is not merely overstated, it is ANTI-correlated with being right.
 * The usual fix — shrink everything toward the base rate — would be wrong here,
 * because it treats the signal as noisy rather than as pointing the wrong way.
 * The right first move is to stop pretending the stated number is a probability
 * and replace it with the observed frequency for its band.
 *
 * ── What this deliberately does NOT do ───────────────────────────────────
 *
 * It never overwrites `confidence`. The raw model output is the only record of
 * what the system actually believed, and the entire question — is calibration
 * improving? — is unanswerable once it has been overwritten in place. The
 * calibrated value lands in its own column, so both can be scored and compared.
 *
 * It does not extrapolate. A band with too few graded examples keeps its stated
 * confidence rather than being mapped from four data points; MIN_BUCKET_SAMPLES
 * is the floor. Two of the four bands above (n=4 and n=8) are below it today,
 * which is honest: we do not yet know what a 0.85 means.
 *
 * It shrinks toward the base rate in proportion to how little evidence a bucket
 * has, so a bucket that has just crossed the floor does not swing the whole book
 * on twenty observations.
 */

import type { DatabaseAdapter } from '../db/database.js';
import { childLogger } from '../lib/logger.js';

const log = childLogger('market-confidence-recalibration');

/** Below this many graded predictions a bucket cannot speak for itself. */
export const MIN_BUCKET_SAMPLES = 20;

/** Full weight on the observed rate is only reached at this sample size. */
export const FULL_TRUST_SAMPLES = 100;

/** The bands confidence is measured in. Deliberately coarse: finer buckets on
 *  174 observations would be noise dressed as precision. */
export const BANDS: Array<[number, number]> = [
  [0.0, 0.4],
  [0.4, 0.6],
  [0.6, 0.8],
  [0.8, 1.01],   // 1.01 so a stated confidence of exactly 1.0 has a home
];

export interface BandCalibration {
  low: number;
  high: number;
  graded: number;
  observed_accuracy: number | null;
  /** What a prediction in this band should be scored at. */
  calibrated: number | null;
  /** False when the band kept its stated confidence for want of evidence. */
  applied: boolean;
}

export interface RecalibrationReport {
  base_rate: number;
  total_graded: number;
  bands: BandCalibration[];
}

/**
 * Shrink an observed rate toward the base rate according to sample size.
 *
 * At MIN_BUCKET_SAMPLES the observed rate carries little weight; by
 * FULL_TRUST_SAMPLES it carries nearly all of it. Without this, a bucket that
 * has just cleared the floor would move the whole book on a handful of calls.
 */
export function shrink(observed: number, n: number, baseRate: number): number {
  if (n <= 0) return baseRate;
  const span = Math.max(1, FULL_TRUST_SAMPLES - MIN_BUCKET_SAMPLES);
  const trust = Math.min(1, Math.max(0, (n - MIN_BUCKET_SAMPLES) / span));
  return baseRate + (observed - baseRate) * trust;
}

/**
 * Measure the empirical mapping from stated confidence to observed accuracy.
 *
 * Reads only graded predictions; makes no changes.
 */
export async function measureCalibration(db: DatabaseAdapter): Promise<RecalibrationReport> {
  const overall = await db.get<{ n: number | string; correct: number | string }>(
    `SELECT count(*) AS n, COALESCE(sum(was_correct), 0) AS correct
       FROM market_predictions WHERE was_correct IS NOT NULL`,
  );
  const total = Number(overall?.n ?? 0);
  const baseRate = total > 0 ? Number(overall?.correct ?? 0) / total : 0.5;

  const bands: BandCalibration[] = [];
  for (const [low, high] of BANDS) {
    const row = await db.get<{ n: number | string; correct: number | string }>(
      `SELECT count(*) AS n, COALESCE(sum(was_correct), 0) AS correct
         FROM market_predictions
        WHERE was_correct IS NOT NULL AND confidence >= ? AND confidence < ?`,
      low, high,
    );
    const n = Number(row?.n ?? 0);
    const observed = n > 0 ? Number(row?.correct ?? 0) / n : null;
    const applied = n >= MIN_BUCKET_SAMPLES && observed != null;
    bands.push({
      low, high, graded: n,
      observed_accuracy: observed,
      calibrated: applied ? shrink(observed!, n, baseRate) : null,
      applied,
    });
  }

  return { base_rate: baseRate, total_graded: total, bands };
}

/** The calibrated value for one stated confidence, or null to keep it as-is. */
export function calibratedFor(stated: number, report: RecalibrationReport): number | null {
  const band = report.bands.find(b => stated >= b.low && stated < b.high);
  return band?.applied ? band.calibrated : null;
}

/**
 * Write calibrated_confidence onto predictions that have one.
 *
 * Applies to open predictions only. A graded prediction's confidence is part of
 * the record its Brier score was computed from; rewriting it after the fact
 * would silently restate history and make the before/after comparison
 * meaningless.
 */
export async function applyCalibration(
  db: DatabaseAdapter,
): Promise<{ updated: number; skipped_no_band: number; report: RecalibrationReport }> {
  const report = await measureCalibration(db);
  let updated = 0;
  let skipped = 0;

  const open = await db.all<{ id: string; confidence: number }>(
    `SELECT id, confidence FROM market_predictions
      WHERE was_correct IS NULL AND confidence IS NOT NULL`,
  );

  for (const p of open) {
    const calibrated = calibratedFor(Number(p.confidence), report);
    if (calibrated == null) { skipped++; continue; }
    await db.run(
      'UPDATE market_predictions SET calibrated_confidence = ? WHERE id = ?',
      calibrated, p.id,
    );
    updated++;
  }

  log.info(
    {
      base_rate: report.base_rate,
      total_graded: report.total_graded,
      updated,
      skipped_no_band: skipped,
      bands_applied: report.bands.filter(b => b.applied).length,
    },
    'confidence_recalibration_complete',
  );
  return { updated, skipped_no_band: skipped, report };
}
