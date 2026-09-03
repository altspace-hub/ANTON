/**
 * Confidence recalibration.
 *
 * market_intelligence_service computes per-bucket accuracy into
 * market_confidence_calibration, anton-bundler exports it, and a getter
 * returns it for display — and for a long time that was the end of the road.
 * Nothing fed a measured miscalibration back into the confidence attached to
 * a new prediction, which is why the old inversion survived being measured
 * for months.
 *
 * Closing that loop turned out to need two guards, both learned the hard way.
 *
 * ── Guard 1: only trusted measurements ───────────────────────────────────
 *
 * The obvious implementation pools every graded prediction on record. That is
 * actively harmful here. Grading defects repaired in mid-August mean earlier
 * labels are unreliable in both directions (see market-learning-window.ts).
 * Measured on 31 August 2026, the pooled mapping sent the 0.60–0.80 band to
 * 0.3806 because the broken era scored it at 28%; in the trusted window that
 * band runs at 73%. Applying the pooled map moved Brier from 0.2384 to
 * 0.2557 — taking a book that beats the coin-flip line and pushing it back
 * over. Every query below is therefore windowed.
 *
 * ── Guard 2: prove the correction helps before applying it ───────────────
 *
 * Windowing makes the mapping safe; it does not make it worthwhile. On the
 * same date the windowed mapping scored 0.2378 against 0.2384 stated — an
 * improvement of 0.0006, in-sample, which is noise. A correction that cannot
 * demonstrate it beats leaving the number alone should not be written.
 *
 * So applyCalibration measures itself first and declines when the gain is
 * below MIN_BRIER_IMPROVEMENT. Today it will decline. As confidence regains
 * variance (the generator's spread has gone from sd 0.034 on 14 August to
 * 0.113 on 31 August) the mapping will have something to bite on, and this
 * will start applying on its own without anyone re-running an analysis.
 *
 * The report also carries the Brier of a flat forecast at the base rate.
 * When flat beats calibrated, confidence is carrying no usable information
 * yet — worth logging loudly, because it is the single most important fact
 * about the forecast quality and it is invisible in an accuracy number.
 *
 * ── What this deliberately does NOT do ───────────────────────────────────
 *
 * It never overwrites `confidence`. The raw model output is the only record
 * of what the system actually believed, and the entire question — is
 * calibration improving? — is unanswerable once it has been overwritten in
 * place. The calibrated value lands in its own column so both can be scored.
 *
 * It does not extrapolate. A band with too few graded examples keeps its
 * stated confidence rather than being mapped from a handful of data points;
 * MIN_BUCKET_SAMPLES is the floor. It shrinks toward the base rate in
 * proportion to how little evidence a bucket has, so a bucket that has just
 * crossed the floor does not swing the whole book on twenty observations.
 */

import type { DatabaseAdapter } from '../db/database.js';
import { childLogger } from '../lib/logger.js';
import { trustedSince } from './market-learning-window.js';

const log = childLogger('market-confidence-recalibration');

/** Below this many graded predictions a bucket cannot speak for itself. */
export const MIN_BUCKET_SAMPLES = 20;

/** Full weight on the observed rate is only reached at this sample size. */
export const FULL_TRUST_SAMPLES = 100;

/**
 * Brier gain the mapping must show, in-window, before it is written to any
 * prediction. Deliberately larger than the noise floor: the comparison is
 * in-sample, so it flatters the mapping, and a correction that only wins by
 * a hair in-sample is not winning at all out-of-sample.
 */
export const MIN_BRIER_IMPROVEMENT = 0.005;

/**
 * The bands confidence is measured in.
 *
 * Edges follow where the mass actually sits rather than round numbers. In the
 * trusted window the generator concentrates between 0.50 and 0.65, so the old
 * [0.4,0.6)/[0.6,0.8) split put 65 of 82 observations in a single bucket and
 * left everything else under the evidence floor. These edges put two bands
 * over the floor (n=46 and n=28) while staying coarse enough that they are
 * not fitting noise. Revisit them if the generator's spread changes shape.
 */
export const BANDS: Array<[number, number]> = [
  [0.0,   0.50],
  [0.50,  0.575],
  [0.575, 0.65],
  [0.65,  1.01],   // 1.01 so a stated confidence of exactly 1.0 has a home
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
  /** ISO date floor these measurements were taken over. */
  since: string;
  bands: BandCalibration[];
  /** In-window Brier as the model stated it. */
  brier_stated: number | null;
  /** In-window Brier after applying the mapping below. */
  brier_calibrated: number | null;
  /** In-window Brier of a flat forecast at the base rate — the "ignore
   *  confidence entirely" benchmark. When this wins, confidence is not yet
   *  carrying information. */
  brier_flat: number | null;
  /** brier_stated − brier_calibrated. Positive means the mapping helps. */
  improvement: number | null;
  /** Whether the improvement clears MIN_BRIER_IMPROVEMENT. */
  worth_applying: boolean;
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

/** The calibrated value for one stated confidence, or null to keep it as-is. */
export function calibratedFor(stated: number, report: RecalibrationReport): number | null {
  const band = report.bands.find(b => stated >= b.low && stated < b.high);
  return band?.applied ? band.calibrated : null;
}

/**
 * Measure the empirical mapping from stated confidence to observed accuracy,
 * over the trusted window only. Reads graded predictions; makes no changes.
 *
 * Also scores the mapping against doing nothing and against ignoring
 * confidence altogether, so the caller can decide whether applying it is
 * justified rather than assuming it is.
 */
export async function measureCalibration(db: DatabaseAdapter): Promise<RecalibrationReport> {
  const since = trustedSince();

  const graded = await db.all<{ confidence: number | string; was_correct: number | string }>(
    `SELECT confidence, was_correct
       FROM market_predictions
      WHERE was_correct IS NOT NULL
        AND confidence IS NOT NULL
        AND validated_at >= ?`,
    since,
  );

  const total = graded.length;
  const rows = graded.map(r => ({ c: Number(r.confidence), y: Number(r.was_correct) ? 1 : 0 }));
  const baseRate = total > 0 ? rows.reduce((s, r) => s + r.y, 0) / total : 0.5;

  const bands: BandCalibration[] = BANDS.map(([low, high]) => {
    const inBand = rows.filter(r => r.c >= low && r.c < high);
    const n = inBand.length;
    const observed = n > 0 ? inBand.reduce((s, r) => s + r.y, 0) / n : null;
    const applied = n >= MIN_BUCKET_SAMPLES && observed != null;
    return {
      low, high, graded: n,
      observed_accuracy: observed,
      calibrated: applied ? shrink(observed as number, n, baseRate) : null,
      applied,
    };
  });

  const mapFor = (c: number): number => {
    const band = bands.find(b => c >= b.low && c < b.high);
    return band?.applied && band.calibrated != null ? band.calibrated : c;
  };

  const mean = (f: (r: { c: number; y: number }) => number) =>
    total > 0 ? rows.reduce((s, r) => s + f(r), 0) / total : null;

  const brierStated    = mean(r => (r.c - r.y) ** 2);
  const brierCalibrated = mean(r => (mapFor(r.c) - r.y) ** 2);
  const brierFlat      = mean(r => (baseRate - r.y) ** 2);

  const improvement =
    brierStated != null && brierCalibrated != null ? brierStated - brierCalibrated : null;

  return {
    base_rate: baseRate,
    total_graded: total,
    since,
    bands,
    brier_stated: brierStated,
    brier_calibrated: brierCalibrated,
    brier_flat: brierFlat,
    improvement,
    worth_applying: improvement != null && improvement >= MIN_BRIER_IMPROVEMENT,
  };
}

export interface EvidenceStratum {
  label: string;
  graded: number;
  accuracy: number | null;
  mean_confidence: number | null;
  brier: number | null;
}

/**
 * Accuracy stratified by evidence quality, over the trusted window.
 *
 * This is the test of whether the second channel (migration 261) is worth
 * anything. The hypothesis it checks: predictions the generator says it found
 * real evidence for should be more accurate than ones it flagged as thin —
 * and if they are, then filtering on evidence quality is a lever that
 * confidence alone could never provide.
 *
 * Returns an empty array until predictions carrying the field have graded.
 * Rows with NULL evidence_quality are excluded rather than bucketed as zero:
 * every prediction made before the column existed has NULL, and folding those
 * into the lowest stratum would manufacture a finding out of a schema change.
 */
export async function measureByEvidenceQuality(db: DatabaseAdapter): Promise<EvidenceStratum[]> {
  const since = trustedSince();
  const rows = await db.all<{ confidence: number | string; was_correct: number | string; evidence_quality: number | string }>(
    `SELECT confidence, was_correct, evidence_quality
       FROM market_predictions
      WHERE was_correct IS NOT NULL
        AND confidence IS NOT NULL
        AND evidence_quality IS NOT NULL
        AND validated_at >= ?`,
    since,
  );
  if (rows.length === 0) return [];

  const parsed = rows.map(r => ({
    c: Number(r.confidence),
    y: Number(r.was_correct) ? 1 : 0,
    e: Number(r.evidence_quality),
  }));

  const strata: Array<[string, number, number]> = [
    ['thin (< 0.35)',      0.0,  0.35],
    ['moderate (0.35-0.7)', 0.35, 0.70],
    ['strong (>= 0.7)',    0.70, 1.01],
  ];

  return strata.map(([label, lo, hi]) => {
    const inStratum = parsed.filter(r => r.e >= lo && r.e < hi);
    const n = inStratum.length;
    return {
      label,
      graded: n,
      accuracy: n > 0 ? inStratum.reduce((s, r) => s + r.y, 0) / n : null,
      mean_confidence: n > 0 ? inStratum.reduce((s, r) => s + r.c, 0) / n : null,
      brier: n > 0 ? inStratum.reduce((s, r) => s + (r.c - r.y) ** 2, 0) / n : null,
    };
  });
}

/**
 * Write calibrated_confidence onto open predictions — but only if the mapping
 * has earned it.
 *
 * Applies to open predictions only. A graded prediction's confidence is part
 * of the record its Brier score was computed from; rewriting it after the
 * fact would silently restate history and make the before/after comparison
 * meaningless.
 */
export async function applyCalibration(
  db: DatabaseAdapter,
): Promise<{
  updated: number;
  skipped_no_band: number;
  applied: boolean;
  reason?: string;
  report: RecalibrationReport;
}> {
  const report = await measureCalibration(db);

  if (!report.worth_applying) {
    const reason =
      report.total_graded === 0
        ? 'no graded predictions in the trusted window'
        : `in-window Brier gain ${report.improvement?.toFixed(4) ?? 'n/a'} below the ` +
          `${MIN_BRIER_IMPROVEMENT} threshold — leaving stated confidence alone`;
    log.info(
      {
        since: report.since,
        total_graded: report.total_graded,
        brier_stated: report.brier_stated,
        brier_calibrated: report.brier_calibrated,
        brier_flat: report.brier_flat,
        improvement: report.improvement,
        // When a flat forecast at the base rate beats the model's own
        // confidence, the confidence field is not yet carrying information.
        flat_beats_stated:
          report.brier_flat != null && report.brier_stated != null
            ? report.brier_flat < report.brier_stated
            : null,
      },
      'confidence_recalibration_declined',
    );
    return { updated: 0, skipped_no_band: 0, applied: false, reason, report };
  }

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
      since: report.since,
      base_rate: report.base_rate,
      total_graded: report.total_graded,
      improvement: report.improvement,
      updated,
      skipped_no_band: skipped,
      bands_applied: report.bands.filter(b => b.applied).length,
    },
    'confidence_recalibration_complete',
  );
  return { updated, skipped_no_band: skipped, applied: true, report };
}
