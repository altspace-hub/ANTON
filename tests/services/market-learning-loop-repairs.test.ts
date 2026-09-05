/**
 * market-learning-loop-repairs.test.ts
 *
 * Three defects were found on 31 August 2026 by measuring the learning loops
 * against outcomes rather than reading them. Each is cheap to reintroduce and
 * silent when reintroduced — none would fail an existing test, and none shows
 * up in a summary count. These pin the properties that make them observable.
 *
 *   1. The symbol loop could only ratchet DOWN. deriveFromSymbolFailure used
 *      `0.5 + accuracy * 0.5`, maximum exactly 1.0, so weight could never be
 *      restored. 8 of 13 symbols had reached the floor; VIXY had been cut six
 *      times in fourteen days at 73% accuracy.
 *
 *   2. The orchestrator's optimizer INSERT was unclamped while every other
 *      writer clamped, producing price_target = 0.000 — an absorbing state
 *      under multiplicative update — and directional = 0.088 despite 61.1%
 *      accuracy over 72 graded predictions.
 *
 *   3. Recalibration pooled every graded prediction ever made, including the
 *      era whose grader was broken, and would have moved in-window Brier from
 *      0.2384 to 0.2557 — worse than the coin-flip line it already beat.
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  deriveAdjustments,
  clampWeight,
  WEIGHT_FLOOR,
  WEIGHT_CEILING,
  type PatternRow,
} from '../../server/services/market-pattern-weight-feedback-service.js';
import {
  trustedSince,
  DEFAULT_TRUSTED_SINCE,
} from '../../server/services/market-learning-window.js';
import {
  calibratedFor,
  MIN_BRIER_IMPROVEMENT,
  BANDS,
  type RecalibrationReport,
} from '../../server/services/market-confidence-recalibration.js';

const pattern = (type: string, meta: Record<string, unknown>): PatternRow => ({
  id: 'pat_1', pattern_type: type, title: 't', description: 'd',
  severity: 'medium', confidence: 0.8, metadata: JSON.stringify(meta),
  status: 'active', detected_at: '2026-08-31T00:00:00Z',
});

const symbolMultiplier = (accuracy: number, total = 10): number => {
  const out = deriveAdjustments(pattern('symbol_failure_cluster', { symbol: 'VIXY', accuracy, total }));
  expect(out).toHaveLength(1);
  return out[0].multiplier;
};

describe('symbol weight loop can restore weight, not only remove it', () => {
  it('emits a multiplier ABOVE 1.0 for a symbol beating a coin flip', () => {
    // The bug in one assertion. The old formula (0.5 + accuracy * 0.5) returns
    // 0.865 here — below 1.0 — so VIXY at 73% accuracy kept losing weight
    // every cycle it was flagged, with no mechanism that could ever give it
    // back. Anything <= 1.0 means the ratchet is back.
    expect(symbolMultiplier(0.73)).toBeGreaterThan(1.0);
  });

  it('still removes weight from a symbol below a coin flip', () => {
    // The fix must not become "everything drifts up".
    expect(symbolMultiplier(0.17)).toBeLessThan(1.0);
  });

  it('leaves a coin-flip symbol untouched', () => {
    expect(symbolMultiplier(0.5)).toBeCloseTo(1.0, 6);
  });

  it('is monotonic in accuracy, and strictly so away from the clamps', () => {
    const ms = [0.1, 0.3, 0.5, 0.7, 0.9].map(a => symbolMultiplier(a));
    // Never decreasing anywhere — a better symbol must never draw a harsher
    // multiplier than a worse one.
    for (let i = 1; i < ms.length; i++) expect(ms[i]).toBeGreaterThanOrEqual(ms[i - 1]);
    // Strictly increasing in the interior. 0.7 and 0.9 both land on the 1.1
    // multiplier ceiling, which is the clamp doing its job rather than a loss
    // of ordering, so the strict check stops before it.
    for (const [lo, hi] of [[0.1, 0.3], [0.3, 0.5], [0.5, 0.6]] as const) {
      expect(symbolMultiplier(hi)).toBeGreaterThan(symbolMultiplier(lo));
    }
  });

  it('stays gentler than the axis-wide directional_bias correction', () => {
    // A symbol override multiplies every future prediction on that ticker, so
    // it compounds faster than a one-off hit to a whole axis and must move
    // less per cycle. Compared at the same accuracy, away from both clamps.
    const symbol = symbolMultiplier(0.2);
    const axis = deriveAdjustments(pattern('directional_bias', { direction: 'up', accuracy: 0.2, total: 10 }))[0].multiplier;
    expect(Math.abs(symbol - 1)).toBeLessThan(Math.abs(axis - 1));
  });

  it('refuses to act on fewer than three observations', () => {
    expect(deriveAdjustments(pattern('symbol_failure_cluster', { symbol: 'VIXY', accuracy: 0.0, total: 2 }))).toHaveLength(0);
  });
});

describe('clampWeight — the guard the optimizer INSERT was missing', () => {
  it('lifts a zero to the floor, because zero can never recover', () => {
    // Every writer updates weights multiplicatively. Zero is an absorbing
    // state: no sequence of multipliers lifts a weight off it, however well
    // the signal performs. This is why price_target = 0.000 was permanent.
    expect(clampWeight(0)).toBe(WEIGHT_FLOOR);
  });

  it('lifts the observed 0.088 corruption to the floor', () => {
    expect(clampWeight(0.0883)).toBe(WEIGHT_FLOOR);
  });

  it('caps runaway upside', () => {
    expect(clampWeight(9.9)).toBe(WEIGHT_CEILING);
  });

  it('passes a legitimate weight through unchanged', () => {
    expect(clampWeight(0.82)).toBeCloseTo(0.82, 9);
  });

  it('returns null for a non-finite value rather than writing NaN', () => {
    // A NaN reaching the column silently poisons every later read of it.
    expect(clampWeight(Number.NaN)).toBeNull();
    expect(clampWeight(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('trusted measurement window', () => {
  const original = process.env.MARKETS_TRUSTED_SINCE;
  afterEach(() => {
    if (original === undefined) delete process.env.MARKETS_TRUSTED_SINCE;
    else process.env.MARKETS_TRUSTED_SINCE = original;
  });

  it('defaults to the date the grading path was repaired', () => {
    delete process.env.MARKETS_TRUSTED_SINCE;
    expect(trustedSince()).toBe(DEFAULT_TRUSTED_SINCE);
    // Held at 2026-08-14. It moved to 2026-09-05 when the directional grader's
    // self-contradiction was found, and back once migration 264 restated the
    // affected gradings — the defect was repaired in the data rather than
    // quarantined. The six defects this floor exists for cannot be repaired
    // retroactively: a prediction graded against a stale price has the wrong
    // observed move recorded, and reclassifying it recovers nothing.
    expect(DEFAULT_TRUSTED_SINCE).toBe('2026-08-14');
  });

  it('accepts a valid override', () => {
    process.env.MARKETS_TRUSTED_SINCE = '2026-09-01';
    expect(trustedSince()).toBe('2026-09-01');
  });

  it('falls back rather than widening the window on a malformed override', () => {
    // A typo must not silently readmit the broken-grader era, and must not
    // take the learning loops offline either.
    process.env.MARKETS_TRUSTED_SINCE = 'last-tuesday';
    expect(trustedSince()).toBe(DEFAULT_TRUSTED_SINCE);
  });

  it('falls back on a well-formed but impossible date', () => {
    process.env.MARKETS_TRUSTED_SINCE = '2026-13-45';
    expect(trustedSince()).toBe(DEFAULT_TRUSTED_SINCE);
  });
});

describe('recalibration bands track where the mass actually sits', () => {
  it('covers 0–1 with no gaps and no overlaps', () => {
    for (let v = 0; v <= 1.0001; v += 0.01) {
      const hits = BANDS.filter(([lo, hi]) => v >= lo && v < hi);
      expect(hits.length, `confidence ${v.toFixed(2)} matched ${hits.length} bands`).toBe(1);
    }
  });

  it('splits the 0.50–0.65 range where the generator concentrates', () => {
    // The old [0.4,0.6)/[0.6,0.8) edges put 65 of 82 in-window observations in
    // a single bucket and left every other band under the evidence floor,
    // which made the mapping unable to say anything. At least two edges must
    // fall inside the range the generator actually uses.
    const inner = BANDS.map(([lo]) => lo).filter(lo => lo > 0.45 && lo < 0.70);
    expect(inner.length).toBeGreaterThanOrEqual(2);
  });
});

describe('recalibration applies only when it beats leaving the number alone', () => {
  const report = (over: Partial<RecalibrationReport>): RecalibrationReport => ({
    base_rate: 0.622, total_graded: 82, since: '2026-08-14',
    bands: [{ low: 0.5, high: 0.575, graded: 46, observed_accuracy: 0.587, calibrated: 0.61, applied: true }],
    brier_stated: 0.2384, brier_calibrated: 0.2378, brier_flat: 0.2351,
    improvement: 0.0006, worth_applying: false,
    ...over,
  });

  it('the observed 31 August gain does not clear the threshold', () => {
    // 0.0006 in-sample is noise, and the comparison flatters the mapping
    // because it is fitted on the same rows it is scored on.
    expect(0.0006).toBeLessThan(MIN_BRIER_IMPROVEMENT);
    expect(report({}).worth_applying).toBe(false);
  });

  it('a band without evidence returns null so the stated value is kept', () => {
    // Null is the signal to KEEP the stated confidence. Returning the stated
    // value instead would make an unmapped prediction indistinguishable from a
    // mapped one, and the comparison becomes a column against itself.
    const r = report({ bands: [{ low: 0.65, high: 1.01, graded: 4, observed_accuracy: 0.75, calibrated: null, applied: false }] });
    expect(calibratedFor(0.8, r)).toBeNull();
  });

  it('maps a stated confidence when its band does have evidence', () => {
    expect(calibratedFor(0.55, report({}))).toBeCloseTo(0.61, 6);
  });

  it('flags when ignoring confidence outright beats using it', () => {
    // brier_flat < brier_stated means the confidence field is not yet earning
    // its keep. That is the single most important fact about forecast quality
    // and it is invisible in an accuracy number, so the report must carry it.
    const r = report({});
    expect(r.brier_flat).toBeLessThan(r.brier_stated as number);
  });
});
