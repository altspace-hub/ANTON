/**
 * market-direction-grading.test.ts
 *
 * The defect: `flat` predictions were graded against a ±1.5% band while
 * `up`/`down` predictions were graded on the sign alone, so a +0.2% move made
 * an 'up' call correct AND a 'flat' call correct — two mutually exclusive
 * claims about one outcome, both scored right.
 *
 * Over the trusted window that inflated the headline from 37% to 68%: 45 of 80
 * graded up/down calls resolved on moves the same code classified as flat, and
 * 25 of them scored correct.
 *
 * The first test is the property that makes the rule coherent, and it is the
 * one that fails against the old code.
 */

import { describe, it, expect } from 'vitest';
import {
  gradeDirectional,
  classifyMove,
  flatBandPct,
  REFERENCE_BAND_PCT,
  REFERENCE_HORIZON_DAYS,
  MIN_BAND_PCT,
  MAX_BAND_PCT,
  type Direction,
} from '../../server/services/market-direction-grading.js';

const DIRECTIONS: Direction[] = ['up', 'down', 'flat'];

describe('the rule is coherent', () => {
  it('marks exactly ONE of up/down/flat correct for any given outcome', () => {
    // The property the old grader violated. Swept across moves and horizons so
    // it cannot pass by accident on one lucky value.
    for (const horizon of [1, 2, 3, 7, 14, 21, 90]) {
      for (const move of [-12, -3.1, -1.5, -0.6, -0.2, 0, 0.2, 0.6, 1.5, 3.1, 12]) {
        const correct = DIRECTIONS.filter(
          (d) => gradeDirectional(d, move, horizon).wasCorrect,
        );
        expect(correct, `move ${move}% over ${horizon}d marked ${correct.length} directions correct`)
          .toHaveLength(1);
      }
    }
  });

  it('is the exact regression: a +0.2% move over 14 days is flat, not up', () => {
    // The old code returned wasCorrect = true here, with gradedScore 0.7.
    const up = gradeDirectional('up', 0.2, 14);
    expect(up.actualDirection).toBe('flat');
    expect(up.wasCorrect).toBe(false);
    // The nuance is not lost — it moves to the score, where it cannot corrupt
    // accuracy or Brier.
    expect(up.gradedScore).toBe(0.7);

    const flat = gradeDirectional('flat', 0.2, 14);
    expect(flat.wasCorrect).toBe(true);
  });

  it('still rewards a clean directional hit', () => {
    const g = gradeDirectional('up', 3.1, 14);
    expect(g.actualDirection).toBe('up');
    expect(g.wasCorrect).toBe(true);
    expect(g.gradedScore).toBe(1.0);
  });

  it('separates a wrong lean from a wrong call in the score, not the binary', () => {
    // Predicted up, drifted down but inside the band: wrong, but barely.
    const nearMiss = gradeDirectional('up', -0.4, 14);
    expect(nearMiss.wasCorrect).toBe(false);
    expect(nearMiss.gradedScore).toBe(0.3);

    // Predicted up, fell hard: wrong, and not close.
    const clearMiss = gradeDirectional('up', -4.0, 14);
    expect(clearMiss.wasCorrect).toBe(false);
    expect(clearMiss.gradedScore).toBe(0.0);

    expect(nearMiss.gradedScore).toBeGreaterThan(clearMiss.gradedScore);
  });

  it('grades a missed flat call by how far the market actually moved', () => {
    expect(gradeDirectional('flat', 2.0, 14).gradedScore).toBe(0.5); // just past the band
    expect(gradeDirectional('flat', 9.0, 14).gradedScore).toBe(0.0); // nowhere near flat
  });

  it('treats the band edge consistently — exactly at the band is flat', () => {
    expect(classifyMove(REFERENCE_BAND_PCT, REFERENCE_HORIZON_DAYS)).toBe('flat');
    expect(classifyMove(-REFERENCE_BAND_PCT, REFERENCE_HORIZON_DAYS)).toBe('flat');
    expect(classifyMove(REFERENCE_BAND_PCT + 0.01, REFERENCE_HORIZON_DAYS)).toBe('up');
    expect(classifyMove(-REFERENCE_BAND_PCT - 0.01, REFERENCE_HORIZON_DAYS)).toBe('down');
  });
});

describe('the band scales with the horizon', () => {
  it('keeps exactly the pre-existing 1.5% at the reference horizon', () => {
    // The change is to the SHAPE of the band, not a silent re-tuning of level.
    expect(flatBandPct(REFERENCE_HORIZON_DAYS)).toBeCloseTo(REFERENCE_BAND_PCT, 10);
  });

  it('demands less of a short horizon than a long one', () => {
    // Why this matters: over the trusted window, 2-day predictions had a mean
    // absolute move of 0.56%. Against a fixed 1.5% band all 9 landed "flat" —
    // the answer was decided before the market opened.
    expect(flatBandPct(2)).toBeLessThan(flatBandPct(14));
    expect(flatBandPct(14)).toBeLessThan(flatBandPct(21));
    expect(flatBandPct(2)).toBeCloseTo(1.5 * Math.sqrt(2 / 14), 6);
  });

  it('makes a 0.6% two-day move directional, where a fixed band called it flat', () => {
    // A real shape from the record: 2-day horizon, 0.56% mean move.
    expect(classifyMove(0.6, 2)).toBe('up');
    // The same move over a fortnight is genuinely nothing.
    expect(classifyMove(0.6, 14)).toBe('flat');
  });

  it('clamps at both ends so no horizon produces an absurd band', () => {
    expect(flatBandPct(0.01)).toBe(MIN_BAND_PCT);
    expect(flatBandPct(100000)).toBe(MAX_BAND_PCT);
  });

  it('falls back to the reference horizon when none is recorded', () => {
    expect(flatBandPct(null)).toBe(flatBandPct(REFERENCE_HORIZON_DAYS));
    expect(flatBandPct(undefined)).toBe(flatBandPct(REFERENCE_HORIZON_DAYS));
    expect(flatBandPct(0)).toBe(flatBandPct(REFERENCE_HORIZON_DAYS));
    expect(flatBandPct(-5)).toBe(flatBandPct(REFERENCE_HORIZON_DAYS));
    expect(flatBandPct(NaN)).toBe(flatBandPct(REFERENCE_HORIZON_DAYS));
  });

  it('reports the band it applied, so an explanation can state it', () => {
    expect(gradeDirectional('up', 5, 21).bandPct).toBeCloseTo(1.5 * Math.sqrt(21 / 14), 6);
  });
});

describe('negative control: the old rule really did contradict itself', () => {
  it('the replaced expression scores up AND flat correct on the same move', () => {
    // The old code, transcribed. If this ever stops contradicting itself, the
    // tests above are guarding a defect that no longer exists.
    const oldGrade = (predicted: Direction, pctChange: number): boolean => {
      const flatThreshold = 1.5;
      const absPctChange = Math.abs(pctChange);
      const actualDirection = pctChange > flatThreshold ? 'up'
        : pctChange < -flatThreshold ? 'down' : 'flat';
      if (predicted === 'flat') return actualDirection === 'flat';
      const directionCorrect = (predicted === 'up' && pctChange > 0)
        || (predicted === 'down' && pctChange < 0);
      const strongMove = absPctChange > flatThreshold;
      if (directionCorrect && strongMove) return true;
      if (directionCorrect && !strongMove) return true;  // ← the defect
      return false;
    };

    expect(oldGrade('up', 0.2)).toBe(true);
    expect(oldGrade('flat', 0.2)).toBe(true);   // both "correct" — impossible

    // The new rule cannot do that.
    const nowCorrect = DIRECTIONS.filter((d) => gradeDirectional(d, 0.2, 14).wasCorrect);
    expect(nowCorrect).toEqual(['flat']);
  });
});
