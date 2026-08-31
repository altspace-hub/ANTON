/**
 * market-confidence-recalibration.test.ts
 *
 * Confidence on this system is not merely overstated — it is anti-correlated
 * with being right. Over 174 graded predictions the 0.4–0.6 band runs at 54.4%
 * while 0.6–0.8 runs at 34.7%. Recalibration replaces the stated number with
 * the observed frequency of its band, which drops in-sample Brier from 0.3033
 * to 0.2506.
 *
 * Two properties are what make that safe rather than merely flattering, and
 * both are easy to lose in a later edit:
 *
 *   1. A band with too little evidence must keep its stated confidence rather
 *      than be mapped from a handful of observations. Today the 0.8–1.0 band
 *      has eight graded examples — mapping from that would be overfitting
 *      dressed as calibration.
 *   2. The observed rate must be shrunk toward the base rate in proportion to
 *      sample size, so a bucket that has just crossed the floor cannot swing
 *      the book on twenty calls.
 *
 * The tests below pin both, plus the invariant that matters most for the whole
 * exercise: the raw `confidence` is never touched, because it is the only
 * record of what the system actually believed and the before/after comparison
 * dies with it.
 */

import { describe, it, expect } from 'vitest';
import {
  shrink,
  calibratedFor,
  MIN_BUCKET_SAMPLES,
  FULL_TRUST_SAMPLES,
  BANDS,
  type RecalibrationReport,
} from '../../server/services/market-confidence-recalibration.js';

const report = (bands: Array<Partial<RecalibrationReport['bands'][0]>>): RecalibrationReport => ({
  base_rate: 0.44,
  total_graded: 174,
  bands: bands.map(b => ({
    low: b.low ?? 0, high: b.high ?? 1,
    graded: b.graded ?? 0,
    observed_accuracy: b.observed_accuracy ?? null,
    calibrated: b.calibrated ?? null,
    applied: b.applied ?? false,
  })),
});

describe('shrink', () => {
  it('gives a bucket at the floor almost no influence', () => {
    // 100% observed on exactly MIN_BUCKET_SAMPLES must not become 100%.
    const out = shrink(1.0, MIN_BUCKET_SAMPLES, 0.44);
    expect(out).toBeCloseTo(0.44, 6);
  });

  it('gives a large bucket nearly all of its observed rate', () => {
    const out = shrink(0.30, FULL_TRUST_SAMPLES, 0.44);
    expect(out).toBeCloseTo(0.30, 6);
  });

  it('moves monotonically with sample size', () => {
    const base = 0.44, observed = 0.20;
    const a = shrink(observed, MIN_BUCKET_SAMPLES + 10, base);
    const b = shrink(observed, MIN_BUCKET_SAMPLES + 40, base);
    const c = shrink(observed, FULL_TRUST_SAMPLES, base);
    // Each step should sit closer to the observed rate than the last.
    expect(Math.abs(a - observed)).toBeGreaterThan(Math.abs(b - observed));
    expect(Math.abs(b - observed)).toBeGreaterThan(Math.abs(c - observed));
  });

  it('returns the base rate for an empty bucket rather than NaN', () => {
    expect(shrink(0.9, 0, 0.44)).toBeCloseTo(0.44, 9);
  });

  it('never extrapolates past the observed rate', () => {
    // Beyond FULL_TRUST_SAMPLES the trust term is clamped, so a very large
    // bucket lands ON the observed rate and never overshoots it.
    const out = shrink(0.20, FULL_TRUST_SAMPLES * 10, 0.44);
    expect(out).toBeCloseTo(0.20, 6);
    expect(out).toBeGreaterThanOrEqual(0.20);
  });
});

describe('calibratedFor', () => {
  it('maps a stated confidence to its band when the band has evidence', () => {
    const r = report([{ low: 0.4, high: 0.6, graded: 90, calibrated: 0.532, applied: true }]);
    expect(calibratedFor(0.55, r)).toBeCloseTo(0.532, 6);
  });

  it('returns null — not the stated value — for a band without evidence', () => {
    // Null is the signal to KEEP the stated confidence. Returning the stated
    // value here instead would make an unmapped prediction indistinguishable
    // from a mapped one, and the whole comparison would quietly become a
    // column compared with itself.
    const r = report([{ low: 0.8, high: 1.01, graded: 8, calibrated: null, applied: false }]);
    expect(calibratedFor(0.85, r)).toBeNull();
  });

  it('returns null when no band covers the value', () => {
    expect(calibratedFor(0.55, report([{ low: 0.8, high: 1.01, applied: true, calibrated: 0.3 }]))).toBeNull();
  });

  it('covers the whole 0–1 range with no gaps and no overlaps', () => {
    // A stated confidence that falls between bands would silently never be
    // calibrated, and nothing would report it.
    for (let v = 0; v <= 1.0001; v += 0.01) {
      const hits = BANDS.filter(([lo, hi]) => v >= lo && v < hi);
      expect(hits.length, `confidence ${v.toFixed(2)} matched ${hits.length} bands`).toBe(1);
    }
  });

  it('gives a stated confidence of exactly 1.0 a home', () => {
    const hits = BANDS.filter(([lo, hi]) => 1.0 >= lo && 1.0 < hi);
    expect(hits.length).toBe(1);
  });
});
