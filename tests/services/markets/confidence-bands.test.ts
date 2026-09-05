import { describe, it, expect } from 'vitest';
import {
  confidenceBand,
  CONFIDENCE_BAND_CUTS,
} from '../../../server/services/market-conditional-accuracy-service.js';

/**
 * 2026-08-24: confidence_band was cut at 0.50 / 0.65, chosen before any data
 * existed. The pulse prompt caps confidence at 0.40-0.75 and steers tactical
 * calls low, so 184 of 234 pulse predictions landed in 'mid' and exactly 2 in
 * 'low'. Every prediction in both of Monday's runs came out 'mid'.
 *
 * A feature that is 79% one value conditions nothing — the same dead weight
 * as signal_type being 'ai' for every row, just harder to notice. The cuts
 * are now the observed terciles.
 */
describe('confidenceBand', () => {
  it('uses the observed terciles, not the pre-data guess', () => {
    expect(CONFIDENCE_BAND_CUTS.mid).toBe(0.56);
    expect(CONFIDENCE_BAND_CUTS.high).toBe(0.60);
  });

  it('splits the range the pulse actually produces', () => {
    // The live spread on 2026-08-24 was 0.53 to 0.60. Under the old cuts
    // every one of these was 'mid'.
    expect(confidenceBand(0.53)).toBe('low');
    expect(confidenceBand(0.55)).toBe('low');
    expect(confidenceBand(0.56)).toBe('mid');
    expect(confidenceBand(0.58)).toBe('mid');
    expect(confidenceBand(0.60)).toBe('high');
    expect(confidenceBand(0.66)).toBe('high');
  });

  it('is half-open at each cut, so no confidence lands in two bands', () => {
    expect(confidenceBand(CONFIDENCE_BAND_CUTS.mid - 0.0001)).toBe('low');
    expect(confidenceBand(CONFIDENCE_BAND_CUTS.mid)).toBe('mid');
    expect(confidenceBand(CONFIDENCE_BAND_CUTS.high - 0.0001)).toBe('mid');
    expect(confidenceBand(CONFIDENCE_BAND_CUTS.high)).toBe('high');
  });

  it('covers the whole clamped range the pulse can emit', () => {
    // clampedConf is Math.max(0.3, Math.min(0.8, conf)).
    expect(confidenceBand(0.3)).toBe('low');
    expect(confidenceBand(0.8)).toBe('high');
  });

  it('does not throw on a non-finite confidence', () => {
    expect(confidenceBand(Number.NaN)).toBe('low');
  });

  it('actually discriminates over the real distribution', () => {
    // The 234 stored pulse confidences, bucketed by value:count.
    const histogram: Array<[number, number]> = [
      [0.45, 1], [0.48, 1], [0.50, 8], [0.51, 1], [0.52, 12], [0.53, 12],
      [0.54, 14], [0.55, 26], [0.56, 16], [0.57, 14], [0.58, 33], [0.59, 2],
      [0.60, 25], [0.61, 3], [0.62, 13], [0.63, 3], [0.64, 2], [0.65, 6],
      [0.66, 2], [0.68, 8],
    ];
    const counts: Record<string, number> = { low: 0, mid: 0, high: 0 };
    for (const [value, n] of histogram) counts[confidenceBand(value)] += n;

    // No band may swallow the distribution the way 'mid' used to (184/234).
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    for (const band of ['low', 'mid', 'high']) {
      expect(counts[band], `${band} share`).toBeGreaterThan(total * 0.15);
    }
  });
});
