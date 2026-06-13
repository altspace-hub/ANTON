/**
 * coding-atom-ab-report.test.ts — the falsifiability suite for ANTON Studio's
 * honest effectiveness reporter. The headline assertion: a small NEGATIVE delta
 * drowning in variance must NOT be reported as "the loop works" — the exact
 * overclaim P4's noise-blind `worksClaimSupported = delta <= 0` gate makes.
 */

import { describe, it, expect } from 'vitest';
import {
  erf,
  normalCdf,
  compareNumericArms,
  buildCodingAtomAbReport,
  getCodingAtomAbReport,
} from '../../server/services/coding-atom-ab-report.js';
import { MIN_SCORED_PER_ARM } from '../../server/services/atom-ab.js';
import type { CodingAtomAbSamples } from '../../server/services/coding-atom-stats.js';

/** n copies of a value. */
const rep = (n: number, v: number): number[] => Array.from({ length: n }, () => v);
/** n elements cycling through `vals`. */
const cycle = (n: number, vals: number[]): number[] =>
  Array.from({ length: n }, (_, i) => vals[i % vals.length]);

const N = MIN_SCORED_PER_ARM; // 30

describe('erf / normalCdf', () => {
  it('erf(0)=0, normalCdf(0)=0.5, symmetric tails', () => {
    expect(erf(0)).toBeCloseTo(0, 6);
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3); // the canonical 95% point
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 3);
  });
});

describe('compareNumericArms — pure stats', () => {
  it('computes mean / stdev / sem and a two-sided p', () => {
    const c = compareNumericArms([2, 4, 6], [2, 4, 6]);
    expect(c.a.mean).toBeCloseTo(4, 6);
    expect(c.a.stdev).toBeCloseTo(2, 6);          // sample sd of [2,4,6]
    expect(c.a.sem).toBeCloseTo(2 / Math.sqrt(3), 6);
    expect(c.delta).toBeCloseTo(0, 6);
    expect(c.pValue).toBeCloseTo(1, 6);           // identical arms → no effect
    expect(c.significant).toBe(false);
  });

  it('null (not 0) for undefined quantities when an arm is empty', () => {
    const c = compareNumericArms([], [1, 2, 3]);
    expect(c.a.mean).toBeNull();
    expect(c.delta).toBeNull();
    expect(c.pValue).toBeNull();
    expect(c.significant).toBeNull();
  });

  it('zero-variance arms that differ → perfect separation (p≈0)', () => {
    const c = compareNumericArms(rep(N, 0), rep(N, 3));
    expect(c.delta).toBeCloseTo(-3, 6);
    expect(c.pValue).toBe(0);
    expect(c.significant).toBe(true);
  });
});

describe('buildCodingAtomAbReport — the honest verdict', () => {
  it('insufficient_data below MIN_SCORED_PER_ARM, regardless of a huge delta', () => {
    // injected all 0, holdout all 5 — a massive apparent win, but only 5/arm.
    const r = buildCodingAtomAbReport({ injected: rep(5, 0), holdout: rep(5, 5) });
    expect(r.verdict).toBe('insufficient_data');
    expect(r.worksClaimSupported).toBe(false);
    expect(r.sufficient).toBe(false);
  });

  it('29/arm is still insufficient; exactly 30/arm crosses the threshold', () => {
    const below = buildCodingAtomAbReport({ injected: cycle(N - 1, [0, 1]), holdout: cycle(N - 1, [3, 4]) });
    expect(below.verdict).toBe('insufficient_data');
    const at = buildCodingAtomAbReport({ injected: cycle(N, [0, 1]), holdout: cycle(N, [3, 4]) });
    expect(at.sufficient).toBe(true);
    expect(at.verdict).not.toBe('insufficient_data');
  });

  it('THE BUG FIX: a small negative delta in heavy noise is NOT "the loop works"', () => {
    // injected 21×0 + 19×5 (mean 2.375), holdout 20×0 + 20×5 (mean 2.5).
    // delta = −0.125 (injected fewer) but SD ≈ 2.5 over 40 → p ≈ 0.8.
    const injected = [...rep(21, 0), ...rep(19, 5)];
    const holdout = [...rep(20, 0), ...rep(20, 5)];
    const r = buildCodingAtomAbReport({ injected, holdout });

    expect(r.delta).toBeLessThan(0);              // injected DID use fewer on average
    expect(r.sufficient).toBe(true);              // enough data
    // P4's old gate: sufficient && delta <= 0  →  would WRONGLY claim "works".
    const oldGateWouldClaim = r.sufficient && r.delta !== null && r.delta <= 0;
    expect(oldGateWouldClaim).toBe(true);
    // The honest reporter refuses: the effect is within noise.
    expect(r.verdict).toBe('no_detectable_effect');
    expect(r.worksClaimSupported).toBe(false);
    expect(r.pValue).toBeGreaterThan(0.05);
  });

  it('loop_helps only when injected is fewer AND significant', () => {
    // Clearly separated with real variance: injected ~0.5, holdout ~3.5 over 40.
    const r = buildCodingAtomAbReport({ injected: cycle(40, [0, 1]), holdout: cycle(40, [3, 4]) });
    expect(r.verdict).toBe('loop_helps');
    expect(r.worksClaimSupported).toBe(true);
    expect(r.delta).toBeLessThan(0);
    expect(r.pValue).toBeLessThan(0.05);
    expect(r.headline.toLowerCase()).toContain('helps');
  });

  it('loop_hurts when injected uses significantly MORE revisions', () => {
    const r = buildCodingAtomAbReport({ injected: cycle(40, [3, 4]), holdout: cycle(40, [0, 1]) });
    expect(r.verdict).toBe('loop_hurts');
    expect(r.worksClaimSupported).toBe(false);
    expect(r.delta).toBeGreaterThan(0);
    expect(r.pValue).toBeLessThan(0.05);
  });

  it('identical arms → no_detectable_effect (delta exactly 0)', () => {
    const same = cycle(40, [0, 1, 2, 3]);
    const r = buildCodingAtomAbReport({ injected: [...same], holdout: [...same] });
    expect(r.delta).toBeCloseTo(0, 6);
    expect(r.verdict).toBe('no_detectable_effect');
    expect(r.worksClaimSupported).toBe(false);
  });

  it('empty data → insufficient_data, never a fabricated verdict', () => {
    const r = buildCodingAtomAbReport({ injected: [], holdout: [] });
    expect(r.verdict).toBe('insufficient_data');
    expect(r.delta).toBeNull();
    expect(r.worksClaimSupported).toBe(false);
  });

  it('classifies effect magnitude', () => {
    const r = buildCodingAtomAbReport({ injected: cycle(40, [0, 1]), holdout: cycle(40, [5, 6]) });
    expect(r.effectMagnitude).toBe('large');
  });
});

describe('getCodingAtomAbReport — DB plumbing', () => {
  // Minimal fake adapter: only db.all is exercised by getCodingAtomAbSamples.
  const fakeDb = (rows: Array<{ coding_task_id: string; revisions: number }>) =>
    ({ all: async () => rows } as unknown as Parameters<typeof getCodingAtomAbReport>[0]);

  it('reads rows and returns a report', async () => {
    const rows = Array.from({ length: 60 }, (_, i) => ({ coding_task_id: `task-${i}`, revisions: i % 4 }));
    const r = await getCodingAtomAbReport(fakeDb(rows));
    expect(['insufficient_data', 'no_detectable_effect', 'loop_helps', 'loop_hurts']).toContain(r.verdict);
    expect(r.injected.n + r.holdout.n).toBe(60); // every task lands in exactly one arm
  });

  it('un-migrated DB (db.all throws) → insufficient_data, no crash', async () => {
    const throwingDb = { all: async () => { throw new Error('relation does not exist'); } } as unknown as Parameters<typeof getCodingAtomAbReport>[0];
    const r = await getCodingAtomAbReport(throwingDb);
    expect(r.verdict).toBe('insufficient_data');
    expect(r.injected.n).toBe(0);
    expect(r.holdout.n).toBe(0);
  });
});
