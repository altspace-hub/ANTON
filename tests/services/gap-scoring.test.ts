/**
 * gap-scoring.test.ts — exhaustive unit tests for the Gap Assessor's
 * deterministic scoring rubric (Wave 1.1, CORE_EXPERIENCE_REVIEW 2026-06).
 *
 * Mirrors the atlas-residual-calculator test discipline: every band boundary,
 * n_a handling, partial combinations, caps, normalization of untrusted LLM
 * output, evidence-ref validation, and carry-forward fact equality.
 * Pure functions — no DB, no LLM, no mocking.
 */
import { describe, it, expect } from 'vitest';
import {
  RUBRIC_VERSION,
  WEIGHTS,
  CAP_SCORE,
  creditFor,
  bandForScore,
  priorityForScore,
  computeScoring,
  scoringForManual,
  normalizeFacts,
  validateEvidenceRefs,
  enforceEvidenceConsistency,
  factsEqual,
  isRagBand,
  type CriterionFacts,
} from '../../server/services/gap-scoring.js';

function facts(partial: Partial<CriterionFacts>): CriterionFacts {
  return {
    documented: 'no',
    implemented: 'no',
    tested: 'no',
    evidenced: 'no',
    ownerAssigned: 'no',
    ...partial,
  };
}

const ALL_YES = facts({ documented: 'yes', implemented: 'yes', tested: 'yes', evidenced: 'yes', ownerAssigned: 'yes' });

describe('rubric constants', () => {
  it('RUBRIC_VERSION is 1', () => {
    expect(RUBRIC_VERSION).toBe(1);
  });

  it('weights sum to 100', () => {
    expect(WEIGHTS.documented + WEIGHTS.implemented + WEIGHTS.tested + WEIGHTS.ownerAssigned).toBe(100);
  });

  it('cap score sits at the top of yellow (below green)', () => {
    expect(bandForScore(CAP_SCORE)).toBe('yellow');
    expect(bandForScore(CAP_SCORE + 1)).toBe('green');
  });
});

describe('creditFor', () => {
  it('yes = 1, partial = 0.5, no = 0, unknown = 0', () => {
    expect(creditFor('yes')).toBe(1);
    expect(creditFor('partial')).toBe(0.5);
    expect(creditFor('no')).toBe(0);
    expect(creditFor('unknown')).toBe(0);
  });
});

describe('bandForScore — every boundary', () => {
  it('0 → red (floor)', () => expect(bandForScore(0)).toBe('red'));
  it('24 → red (red max)', () => expect(bandForScore(24)).toBe('red'));
  it('25 → amber (amber min)', () => expect(bandForScore(25)).toBe('amber'));
  it('49 → amber (amber max)', () => expect(bandForScore(49)).toBe('amber'));
  it('50 → yellow (yellow min)', () => expect(bandForScore(50)).toBe('yellow'));
  it('74 → yellow (yellow max)', () => expect(bandForScore(74)).toBe('yellow'));
  it('75 → green (green min)', () => expect(bandForScore(75)).toBe('green'));
  it('100 → green (ceiling)', () => expect(bandForScore(100)).toBe('green'));
});

describe('priorityForScore — derived from band', () => {
  it('red → critical', () => expect(priorityForScore(10)).toBe('critical'));
  it('amber → high', () => expect(priorityForScore(30)).toBe('high'));
  it('yellow → medium', () => expect(priorityForScore(60)).toBe('medium'));
  it('green → low', () => expect(priorityForScore(90)).toBe('low'));
});

describe('computeScoring — core combinations', () => {
  it('all yes + evidenced → 100 / green / low, no caps', () => {
    const r = computeScoring(ALL_YES);
    expect(r).toMatchObject({ numericScore: 100, score: 'green', priority: 'low', rubricVersion: 1 });
    expect(r.capsApplied).toEqual([]);
  });

  it('all no → 0 / red / critical', () => {
    const r = computeScoring(facts({}));
    expect(r).toMatchObject({ numericScore: 0, score: 'red', priority: 'critical' });
  });

  it('all unknown scores 0 — silence is never compliance', () => {
    const r = computeScoring(facts({ documented: 'unknown', implemented: 'unknown', tested: 'unknown', ownerAssigned: 'unknown' }));
    expect(r.numericScore).toBe(0);
    expect(r.score).toBe('red');
  });

  it('all partial + owner yes + evidenced → 15+20+10+10 = 55 / yellow / medium', () => {
    const r = computeScoring(facts({ documented: 'partial', implemented: 'partial', tested: 'partial', evidenced: 'yes', ownerAssigned: 'yes' }));
    expect(r).toMatchObject({ numericScore: 55, score: 'yellow', priority: 'medium' });
    expect(r.capsApplied).toEqual([]);
  });

  it('documented-only (yes) + evidenced → 30 / amber / high', () => {
    const r = computeScoring(facts({ documented: 'yes', evidenced: 'yes' }));
    expect(r).toMatchObject({ numericScore: 30, score: 'amber', priority: 'high' });
  });

  it('documented partial + tested partial + evidenced → exactly 25 = amber min boundary', () => {
    const r = computeScoring(facts({ documented: 'partial', tested: 'partial', evidenced: 'yes' }));
    expect(r.numericScore).toBe(25);
    expect(r.score).toBe('amber');
  });

  it('documented partial only + evidenced → 15 / red', () => {
    const r = computeScoring(facts({ documented: 'partial', evidenced: 'yes' }));
    expect(r).toMatchObject({ numericScore: 15, score: 'red', priority: 'critical' });
  });
});

describe('computeScoring — tested = n_a rescaling', () => {
  it('n_a with everything else yes → 80/80 rescaled to 100 green', () => {
    const r = computeScoring(facts({ documented: 'yes', implemented: 'yes', tested: 'n_a', evidenced: 'yes', ownerAssigned: 'yes' }));
    expect(r).toMatchObject({ numericScore: 100, score: 'green' });
    expect(r.capsApplied).toEqual([]);
  });

  it('n_a rescales partials: doc partial + impl partial → 35/80 = 44 amber', () => {
    const r = computeScoring(facts({ documented: 'partial', implemented: 'partial', tested: 'n_a', evidenced: 'yes' }));
    expect(r.numericScore).toBe(44); // round(35 * 100 / 80)
    expect(r.score).toBe('amber');
  });

  it('n_a with all-no remains 0', () => {
    const r = computeScoring(facts({ tested: 'n_a' }));
    expect(r.numericScore).toBe(0);
  });

  it('n_a does NOT trigger the testing cap', () => {
    const r = computeScoring(facts({ documented: 'yes', implemented: 'yes', tested: 'n_a', evidenced: 'yes', ownerAssigned: 'yes' }));
    expect(r.capsApplied).not.toContain('testing');
    expect(r.score).toBe('green');
  });
});

describe('computeScoring — caps (trust by construction)', () => {
  it('evidence cap: perfect facts without evidence top out at 74 yellow', () => {
    const r = computeScoring(facts({ documented: 'yes', implemented: 'yes', tested: 'yes', evidenced: 'no', ownerAssigned: 'yes' }));
    expect(r.numericScore).toBe(CAP_SCORE);
    expect(r.score).toBe('yellow');
    expect(r.capsApplied).toEqual(['evidence']);
  });

  it('testing cap: never-tested controls cannot be green', () => {
    const r = computeScoring(facts({ documented: 'yes', implemented: 'yes', tested: 'no', evidenced: 'yes', ownerAssigned: 'yes' }));
    expect(r.numericScore).toBe(CAP_SCORE); // raw 80 → capped
    expect(r.capsApplied).toEqual(['testing']);
  });

  it('testing cap also applies for tested=unknown', () => {
    const r = computeScoring(facts({ documented: 'yes', implemented: 'yes', tested: 'unknown', evidenced: 'yes', ownerAssigned: 'yes' }));
    expect(r.capsApplied).toEqual(['testing']);
    expect(r.numericScore).toBe(CAP_SCORE);
  });

  it('both caps reported when both bind', () => {
    const r = computeScoring(facts({ documented: 'yes', implemented: 'yes', tested: 'no', evidenced: 'no', ownerAssigned: 'yes' }));
    expect(r.capsApplied).toEqual(['evidence', 'testing']);
    expect(r.numericScore).toBe(CAP_SCORE);
  });

  it('caps are inert when the raw score is already at/below 74', () => {
    const r = computeScoring(facts({ documented: 'partial', implemented: 'partial', evidenced: 'no' }));
    expect(r.numericScore).toBe(35);
    expect(r.capsApplied).toEqual([]);
  });

  it('tested partial does not trigger the testing cap (raw 90 → evidence-uncapped green)', () => {
    const r = computeScoring(facts({ documented: 'yes', implemented: 'yes', tested: 'partial', evidenced: 'yes', ownerAssigned: 'yes' }));
    expect(r.numericScore).toBe(90);
    expect(r.score).toBe('green');
    expect(r.capsApplied).toEqual([]);
  });
});

describe('scoringForManual — assessor manual override', () => {
  it('keeps a valid score and derives the band from rubric thresholds', () => {
    expect(scoringForManual(60)).toEqual({ numericScore: 60, score: 'yellow', priority: 'medium' });
  });

  it('clamps below 0 and above 100', () => {
    expect(scoringForManual(-5).numericScore).toBe(0);
    expect(scoringForManual(150).numericScore).toBe(100);
  });

  it('rounds fractional input', () => {
    expect(scoringForManual(74.6).numericScore).toBe(75);
    expect(scoringForManual(74.6).score).toBe('green');
  });

  it('keeps an explicitly supplied valid priority', () => {
    expect(scoringForManual(90, 'critical').priority).toBe('critical');
  });

  it('derives priority when the supplied one is invalid', () => {
    expect(scoringForManual(90, 'urgent').priority).toBe('low');
    expect(scoringForManual(10, undefined).priority).toBe('critical');
  });

  it('non-finite input collapses to 0/red', () => {
    expect(scoringForManual(NaN)).toEqual({ numericScore: 0, score: 'red', priority: 'critical' });
  });
});

describe('normalizeFacts — untrusted LLM output coercion', () => {
  it('returns null for non-objects', () => {
    expect(normalizeFacts(null)).toBeNull();
    expect(normalizeFacts(undefined)).toBeNull();
    expect(normalizeFacts('yes')).toBeNull();
    expect(normalizeFacts([1, 2])).toBeNull();
  });

  it('passes through a fully valid object with no warnings', () => {
    const r = normalizeFacts({ documented: 'yes', implemented: 'partial', tested: 'n_a', evidenced: 'yes', ownerAssigned: 'no' });
    expect(r).not.toBeNull();
    expect(r!.warnings).toEqual([]);
    expect(r!.facts).toEqual({ documented: 'yes', implemented: 'partial', tested: 'n_a', evidenced: 'yes', ownerAssigned: 'no' });
  });

  it('lowercases and trims answers ("YES ", "N/A")', () => {
    const r = normalizeFacts({ documented: 'YES ', implemented: 'Partial', tested: 'N/A', evidenced: 'No', ownerAssigned: 'UNKNOWN' });
    expect(r!.facts).toEqual({ documented: 'yes', implemented: 'partial', tested: 'n_a', evidenced: 'no', ownerAssigned: 'unknown' });
    expect(r!.warnings).toEqual([]);
  });

  it('coerces booleans (true/false → yes/no)', () => {
    const r = normalizeFacts({ documented: true, implemented: false, tested: 'yes', evidenced: true, ownerAssigned: true });
    expect(r!.facts.documented).toBe('yes');
    expect(r!.facts.implemented).toBe('no');
    expect(r!.facts.evidenced).toBe('yes');
  });

  it('invalid values fall back conservatively with warnings', () => {
    const r = normalizeFacts({ documented: 'maybe', implemented: 'yes', tested: 'yes', evidenced: 'sort of', ownerAssigned: 'yes' });
    expect(r!.facts.documented).toBe('unknown');
    expect(r!.facts.evidenced).toBe('no'); // evidenced fallback is 'no', never 'yes'
    expect(r!.warnings).toContain('invalid_criterion_value:documented');
    expect(r!.warnings).toContain('invalid_criterion_value:evidenced');
  });

  it('missing keys fall back with missing_criterion warnings', () => {
    const r = normalizeFacts({ documented: 'yes' });
    expect(r!.facts.implemented).toBe('unknown');
    expect(r!.facts.tested).toBe('unknown');
    expect(r!.facts.evidenced).toBe('no');
    expect(r!.warnings).toContain('missing_criterion:implemented');
    expect(r!.warnings).toContain('missing_criterion:evidenced');
  });

  it('n_a is NOT valid for documented/implemented (tested only)', () => {
    const r = normalizeFacts({ documented: 'n_a', implemented: 'yes', tested: 'yes', evidenced: 'no', ownerAssigned: 'yes' });
    expect(r!.facts.documented).toBe('unknown');
    expect(r!.warnings).toContain('invalid_criterion_value:documented');
  });
});

describe('validateEvidenceRefs — Wave 1.5', () => {
  const known = new Set(['doc-1', 'int-1']);

  it('non-array input yields empty refs without warnings', () => {
    expect(validateEvidenceRefs(undefined, known)).toEqual({ refs: [], warnings: [] });
    expect(validateEvidenceRefs('doc-1', known)).toEqual({ refs: [], warnings: [] });
  });

  it('keeps valid refs', () => {
    const r = validateEvidenceRefs([{ docId: 'doc-1', quote: 'CDD refresh cycle is 3 years' }], known);
    expect(r.refs).toEqual([{ docId: 'doc-1', quote: 'CDD refresh cycle is 3 years' }]);
    expect(r.warnings).toEqual([]);
  });

  it('drops refs citing unknown docIds with a warning (run never fails)', () => {
    const r = validateEvidenceRefs([
      { docId: 'doc-99', quote: 'hallucinated' },
      { docId: 'int-1', quote: 'real quote' },
    ], known);
    expect(r.refs).toEqual([{ docId: 'int-1', quote: 'real quote' }]);
    expect(r.warnings).toEqual(['unknown_doc_ref:doc-99']);
  });

  it('drops malformed entries (missing quote / docId) silently', () => {
    const r = validateEvidenceRefs([{ docId: 'doc-1' }, { quote: 'no doc' }, null, 42], known);
    expect(r.refs).toEqual([]);
  });

  it('clips quotes to 300 chars', () => {
    const r = validateEvidenceRefs([{ docId: 'doc-1', quote: 'x'.repeat(500) }], known);
    expect(r.refs[0].quote.length).toBe(300);
  });
});

describe('enforceEvidenceConsistency', () => {
  it('downgrades evidenced=yes with zero refs to no + warning', () => {
    const r = enforceEvidenceConsistency(ALL_YES, []);
    expect(r.facts.evidenced).toBe('no');
    expect(r.warnings).toEqual(['evidenced_without_refs']);
  });

  it('leaves evidenced=yes intact when refs survive', () => {
    const r = enforceEvidenceConsistency(ALL_YES, [{ docId: 'doc-1', quote: 'q' }]);
    expect(r.facts.evidenced).toBe('yes');
    expect(r.warnings).toEqual([]);
  });

  it('leaves evidenced=no untouched', () => {
    const f = facts({ evidenced: 'no' });
    const r = enforceEvidenceConsistency(f, []);
    expect(r.facts).toBe(f);
    expect(r.warnings).toEqual([]);
  });
});

describe('factsEqual — carry-forward detection (Wave 1.7)', () => {
  it('identical facts are equal', () => {
    expect(factsEqual(ALL_YES, { ...ALL_YES })).toBe(true);
  });

  it('any single criterion difference breaks equality', () => {
    for (const key of ['documented', 'implemented', 'tested', 'evidenced', 'ownerAssigned'] as const) {
      const changed = { ...ALL_YES, [key]: 'no' } as CriterionFacts;
      expect(factsEqual(ALL_YES, changed)).toBe(false);
    }
  });

  it('null/undefined never equal (legacy baselines are treated as changed)', () => {
    expect(factsEqual(null, ALL_YES)).toBe(false);
    expect(factsEqual(ALL_YES, undefined)).toBe(false);
    expect(factsEqual(null, null)).toBe(false);
  });
});

describe('isRagBand', () => {
  it('accepts the four bands and rejects everything else', () => {
    expect(isRagBand('red')).toBe(true);
    expect(isRagBand('amber')).toBe(true);
    expect(isRagBand('yellow')).toBe(true);
    expect(isRagBand('green')).toBe(true);
    expect(isRagBand('GREEN')).toBe(false);
    expect(isRagBand('orange')).toBe(false);
    expect(isRagBand(undefined)).toBe(false);
  });
});

describe('end-to-end determinism', () => {
  it('the same facts always produce the same scoring (no randomness)', () => {
    const f = facts({ documented: 'partial', implemented: 'yes', tested: 'partial', evidenced: 'yes', ownerAssigned: 'unknown' });
    const first = computeScoring(f);
    for (let i = 0; i < 50; i++) {
      expect(computeScoring(f)).toEqual(first);
    }
  });

  it('score is monotonic in each criterion (upgrading an answer never lowers the score)', () => {
    const base = facts({ documented: 'partial', implemented: 'partial', tested: 'partial', evidenced: 'yes', ownerAssigned: 'no' });
    const baseScore = computeScoring(base).numericScore;
    expect(computeScoring({ ...base, documented: 'yes' }).numericScore).toBeGreaterThanOrEqual(baseScore);
    expect(computeScoring({ ...base, implemented: 'yes' }).numericScore).toBeGreaterThanOrEqual(baseScore);
    expect(computeScoring({ ...base, tested: 'yes' }).numericScore).toBeGreaterThanOrEqual(baseScore);
    expect(computeScoring({ ...base, ownerAssigned: 'yes' }).numericScore).toBeGreaterThanOrEqual(baseScore);
  });
});
