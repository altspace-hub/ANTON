// Exhaustive tests for the deterministic residual calculator.
//
// Per spec §14: "the residual score is non-negotiable for audit
// defensibility." This file is the audit's check on the rules.

import { describe, it, expect } from 'vitest';
import {
  calculateInherent,
  rollupControlQuality,
  calculateResidual,
  appetitePositionFor,
  calculatePathScores,
} from '../../../server/services/risk-atlas/atlas-residual-calculator.js';
import type {
  Score1to5,
  ControlStrength,
  ControlQualityRollup,
  AppetitePosition,
} from '../../../server/services/risk-atlas/types.js';

// ── Stage 4: inherent risk = max(exposure, threat, vulnerability) ────────

describe('calculateInherent', () => {
  it('returns the max of three scores', () => {
    expect(calculateInherent(1, 2, 3)).toBe(3);
    expect(calculateInherent(5, 1, 1)).toBe(5);
    expect(calculateInherent(2, 4, 3)).toBe(4);
  });

  it('returns the same value when all three are equal', () => {
    for (const s of [1, 2, 3, 4, 5] as const) {
      expect(calculateInherent(s, s, s)).toBe(s);
    }
  });

  it('exhaustive: max across the full 5x5x5 grid is correct', () => {
    for (let e = 1; e <= 5; e++) {
      for (let t = 1; t <= 5; t++) {
        for (let v = 1; v <= 5; v++) {
          const expected = Math.max(e, t, v);
          expect(calculateInherent(e as Score1to5, t as Score1to5, v as Score1to5)).toBe(expected);
        }
      }
    }
  });
});

// ── Stage 5 helper: control quality rollup (worst-of) ────────────────────

describe('rollupControlQuality', () => {
  it('empty list → absent', () => {
    expect(rollupControlQuality([])).toBe('absent');
  });

  it('all strong → strong', () => {
    expect(rollupControlQuality(['strong'])).toBe('strong');
    expect(rollupControlQuality(['strong', 'strong', 'strong'])).toBe('strong');
  });

  it('any adequate → adequate (when no weak)', () => {
    expect(rollupControlQuality(['adequate'])).toBe('adequate');
    expect(rollupControlQuality(['strong', 'adequate'])).toBe('adequate');
    expect(rollupControlQuality(['adequate', 'strong', 'adequate'])).toBe('adequate');
  });

  it('any weak wins (worst-of) — even with strong present', () => {
    expect(rollupControlQuality(['weak'])).toBe('weak');
    expect(rollupControlQuality(['strong', 'weak'])).toBe('weak');
    expect(rollupControlQuality(['strong', 'adequate', 'weak'])).toBe('weak');
    expect(rollupControlQuality(['weak', 'weak', 'weak'])).toBe('weak');
  });
});

// ── Stage 6: residual = inherent − reduction(rollup), clamped [1, 5] ─────

describe('calculateResidual', () => {
  it('strong rollup applies −2', () => {
    const r = calculateResidual({ inherent_score: 5, control_quality_rollup: 'strong' });
    expect(r.residual_score).toBe(3);
    expect(r.reduction_applied).toBe(2);
    expect(r.appetite_position).toBe('boundary');
  });

  it('adequate rollup applies −1', () => {
    const r = calculateResidual({ inherent_score: 5, control_quality_rollup: 'adequate' });
    expect(r.residual_score).toBe(4);
    expect(r.reduction_applied).toBe(1);
    expect(r.appetite_position).toBe('outside');
  });

  it('weak rollup applies 0 reduction', () => {
    const r = calculateResidual({ inherent_score: 4, control_quality_rollup: 'weak' });
    expect(r.residual_score).toBe(4);
    expect(r.reduction_applied).toBe(0);
    expect(r.appetite_position).toBe('outside');
  });

  it('absent rollup applies 0 reduction', () => {
    const r = calculateResidual({ inherent_score: 3, control_quality_rollup: 'absent' });
    expect(r.residual_score).toBe(3);
    expect(r.reduction_applied).toBe(0);
    expect(r.appetite_position).toBe('boundary');
  });

  it('clamps residual to a minimum of 1', () => {
    // inherent 1 with strong (−2) would be -1; must clamp to 1
    const r = calculateResidual({ inherent_score: 1, control_quality_rollup: 'strong' });
    expect(r.residual_score).toBe(1);
    expect(r.appetite_position).toBe('within');
  });

  it('clamps residual to a minimum of 1 when adequate brings inherent 1 below 1', () => {
    const r = calculateResidual({ inherent_score: 1, control_quality_rollup: 'adequate' });
    expect(r.residual_score).toBe(1);
  });

  it('exhaustive: inherent × rollup grid produces correct residual + appetite', () => {
    type Row = { inherent: Score1to5; rollup: ControlQualityRollup; expected_residual: Score1to5; expected_appetite: AppetitePosition };
    const grid: Row[] = [
      // inherent=1
      { inherent: 1, rollup: 'absent',   expected_residual: 1, expected_appetite: 'within' },
      { inherent: 1, rollup: 'weak',     expected_residual: 1, expected_appetite: 'within' },
      { inherent: 1, rollup: 'adequate', expected_residual: 1, expected_appetite: 'within' },
      { inherent: 1, rollup: 'strong',   expected_residual: 1, expected_appetite: 'within' },
      // inherent=2
      { inherent: 2, rollup: 'absent',   expected_residual: 2, expected_appetite: 'within' },
      { inherent: 2, rollup: 'weak',     expected_residual: 2, expected_appetite: 'within' },
      { inherent: 2, rollup: 'adequate', expected_residual: 1, expected_appetite: 'within' },
      { inherent: 2, rollup: 'strong',   expected_residual: 1, expected_appetite: 'within' },
      // inherent=3
      { inherent: 3, rollup: 'absent',   expected_residual: 3, expected_appetite: 'boundary' },
      { inherent: 3, rollup: 'weak',     expected_residual: 3, expected_appetite: 'boundary' },
      { inherent: 3, rollup: 'adequate', expected_residual: 2, expected_appetite: 'within' },
      { inherent: 3, rollup: 'strong',   expected_residual: 1, expected_appetite: 'within' },
      // inherent=4
      { inherent: 4, rollup: 'absent',   expected_residual: 4, expected_appetite: 'outside' },
      { inherent: 4, rollup: 'weak',     expected_residual: 4, expected_appetite: 'outside' },
      { inherent: 4, rollup: 'adequate', expected_residual: 3, expected_appetite: 'boundary' },
      { inherent: 4, rollup: 'strong',   expected_residual: 2, expected_appetite: 'within' },
      // inherent=5
      { inherent: 5, rollup: 'absent',   expected_residual: 5, expected_appetite: 'unacceptable' },
      { inherent: 5, rollup: 'weak',     expected_residual: 5, expected_appetite: 'unacceptable' },
      { inherent: 5, rollup: 'adequate', expected_residual: 4, expected_appetite: 'outside' },
      { inherent: 5, rollup: 'strong',   expected_residual: 3, expected_appetite: 'boundary' },
    ];
    for (const row of grid) {
      const r = calculateResidual({ inherent_score: row.inherent, control_quality_rollup: row.rollup });
      expect(r.residual_score, `inherent=${row.inherent} rollup=${row.rollup}`).toBe(row.expected_residual);
      expect(r.appetite_position, `inherent=${row.inherent} rollup=${row.rollup}`).toBe(row.expected_appetite);
    }
  });

  it('rationale text mentions inherent, controls, residual, appetite', () => {
    const r = calculateResidual({ inherent_score: 5, control_quality_rollup: 'adequate' });
    expect(r.rationale).toContain('Inherent 5');
    expect(r.rationale).toContain('adequate');
    expect(r.rationale).toContain('Residual 4');
    expect(r.rationale).toContain('outside');
  });
});

// ── Stage 7: appetite bucket from residual ───────────────────────────────

describe('appetitePositionFor', () => {
  it('1-2 → within, 3 → boundary, 4 → outside, 5 → unacceptable', () => {
    expect(appetitePositionFor(1)).toBe('within');
    expect(appetitePositionFor(2)).toBe('within');
    expect(appetitePositionFor(3)).toBe('boundary');
    expect(appetitePositionFor(4)).toBe('outside');
    expect(appetitePositionFor(5)).toBe('unacceptable');
  });
});

// ── End-to-end composition ──────────────────────────────────────────────

describe('calculatePathScores (end-to-end)', () => {
  it('NordicCrypto-style worked example: inherent 5, mixed controls → expected residual', () => {
    // CASP TP-3 sanctions exposure: high E+T+V, mixed controls
    const result = calculatePathScores({
      exposure: 5, threat: 5, vulnerability: 4,
      control_strengths: ['strong', 'adequate'] as ControlStrength[],
    });
    expect(result.inherent_score).toBe(5);
    expect(result.control_quality_rollup).toBe('adequate'); // worst-of strong+adequate is adequate
    expect(result.residual_score).toBe(4);
    expect(result.appetite_position).toBe('outside');
  });

  it('Building Firm worked example (addendum A1.6.1, TP-6 cash subcontractor)', () => {
    // Inherent 4, weak controls (no F-skatt verification, cash payments)
    const result = calculatePathScores({
      exposure: 4, threat: 4, vulnerability: 4,
      control_strengths: ['weak'] as ControlStrength[],
    });
    expect(result.inherent_score).toBe(4);
    expect(result.residual_score).toBe(4);
    expect(result.appetite_position).toBe('outside');
  });

  it('Restaurant TP-1 (foodborne illness): high inherent, strong HACCP control', () => {
    const result = calculatePathScores({
      exposure: 5, threat: 4, vulnerability: 4,
      control_strengths: ['strong'] as ControlStrength[],
    });
    expect(result.inherent_score).toBe(5);
    expect(result.residual_score).toBe(3);
    expect(result.appetite_position).toBe('boundary');
  });

  it('No controls at all leaves inherent unchanged', () => {
    const result = calculatePathScores({
      exposure: 3, threat: 2, vulnerability: 2,
      control_strengths: [],
    });
    expect(result.inherent_score).toBe(3);
    expect(result.control_quality_rollup).toBe('absent');
    expect(result.residual_score).toBe(3);
    expect(result.appetite_position).toBe('boundary');
  });

  it('Single weak control = no reduction (even if it exists, weak does nothing)', () => {
    const a = calculatePathScores({
      exposure: 3, threat: 2, vulnerability: 2,
      control_strengths: ['weak'] as ControlStrength[],
    });
    const b = calculatePathScores({
      exposure: 3, threat: 2, vulnerability: 2,
      control_strengths: [],
    });
    expect(a.residual_score).toBe(b.residual_score);
  });

  it('A single weak control among many strong ones still drops the rollup to weak (worst-of)', () => {
    const result = calculatePathScores({
      exposure: 5, threat: 5, vulnerability: 5,
      control_strengths: ['strong', 'strong', 'strong', 'weak'] as ControlStrength[],
    });
    expect(result.control_quality_rollup).toBe('weak');
    expect(result.residual_score).toBe(5);
    expect(result.appetite_position).toBe('unacceptable');
  });
});

// ── Property-based: residual is monotonic in control strength ────────────

describe('property: residual is monotonic in control strength', () => {
  it('strong always produces ≤ residual than adequate', () => {
    for (let inh = 1; inh <= 5; inh++) {
      const strong = calculateResidual({ inherent_score: inh as Score1to5, control_quality_rollup: 'strong' });
      const adequate = calculateResidual({ inherent_score: inh as Score1to5, control_quality_rollup: 'adequate' });
      expect(strong.residual_score).toBeLessThanOrEqual(adequate.residual_score);
    }
  });

  it('adequate always produces ≤ residual than weak', () => {
    for (let inh = 1; inh <= 5; inh++) {
      const adequate = calculateResidual({ inherent_score: inh as Score1to5, control_quality_rollup: 'adequate' });
      const weak = calculateResidual({ inherent_score: inh as Score1to5, control_quality_rollup: 'weak' });
      expect(adequate.residual_score).toBeLessThanOrEqual(weak.residual_score);
    }
  });

  it('weak and absent produce identical residual (both = 0 reduction)', () => {
    for (let inh = 1; inh <= 5; inh++) {
      const weak = calculateResidual({ inherent_score: inh as Score1to5, control_quality_rollup: 'weak' });
      const absent = calculateResidual({ inherent_score: inh as Score1to5, control_quality_rollup: 'absent' });
      expect(weak.residual_score).toBe(absent.residual_score);
    }
  });
});
