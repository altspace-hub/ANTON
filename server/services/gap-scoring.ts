// ── Gap Assessment Scoring Rubric — DETERMINISTIC ─────────────────────────
//
// The Risk Atlas pattern applied to the Gap Assessor (CORE_EXPERIENCE_REVIEW
// 2026-06, Wave 1.1): the LLM answers a small set of STRUCTURED CRITERION
// FACTS per article; this module — and only this module — turns those facts
// into a 0-100 numeric score, a RAG band, and a priority. The LLM never
// decides a score. The rationale around the score stays LLM-generated; the
// number cannot be. Pure functions, no I/O, no imports — unit-tested like
// atlas-residual-calculator.ts.
//
// ── RUBRIC v1 ──────────────────────────────────────────────────────────────
//
// Criterion facts (universal across frameworks — the classic design-vs-
// operating-effectiveness ladder plus the two trust signals):
//
//   documented     yes | partial | no | unknown
//                  The requirement is covered by an approved, current
//                  policy / procedure / control description.
//   implemented    yes | partial | no | unknown
//                  The requirement is operating in practice (people,
//                  process, systems) — not just on paper.
//   tested         yes | partial | no | n_a | unknown
//                  Effectiveness has been independently tested / audited /
//                  QA'd. n_a is allowed for articles where testing is not
//                  meaningful (e.g. purely definitional provisions).
//   evidenced      yes | no
//                  The answers above are grounded in the evidence provided
//                  to this assessment (with evidenceRefs citing doc + quote).
//   ownerAssigned  yes | no | unknown
//                  A clearly accountable owner exists for the requirement.
//
// Weights (sum = 100):
//   documented 30 · implemented 40 · tested 20 · ownerAssigned 10
//   Credit: yes = full weight, partial = half weight, no/unknown = 0.
//   'unknown' deliberately scores 0 — silence in the evidence is treated
//   conservatively, never as compliance.
//
// n_a handling: when tested = n_a its 20 points leave the denominator and
//   the remaining 80 points are rescaled to 100 (round half up). An article
//   that cannot be tested can still reach 100.
//
// Caps (applied after rescale; the binding cap is reported):
//   evidence cap  evidenced = no            → score capped at 74
//   testing cap   tested = no | unknown     → score capped at 74
//   Rationale: GREEN (≥75) is defined as "documented, tested, and effective"
//   — an assessor never grants that band without evidence or without any
//   testing. Unevidenced/untested strong answers top out at high-YELLOW.
//   Maturity-only assessments (no evidence uploaded) therefore max out at
//   yellow — honest by construction.
//
// Bands (identical to the legacy UI legend so history reads consistently):
//   0-24 red · 25-49 amber · 50-74 yellow · 75-100 green
//
// Priority: derived from the band — red→critical, amber→high, yellow→medium,
//   green→low. Framework JSONs carry NO per-article weight field
//   (ground-truthed against data/frameworks/*.json — articles have only
//   id/title/chapter/section/theme/requirement), so there is nothing
//   deterministic to multiply by; the assessor override (Wave 1.2) is the
//   sanctioned adjustment path when an article deserves a different priority.
//
// Versioning: bump RUBRIC_VERSION whenever weights, caps, or bands change.
// Stored per finding so historical scores remain interpretable.
// ───────────────────────────────────────────────────────────────────────────

export const RUBRIC_VERSION = 1;

export type CriterionAnswer = 'yes' | 'partial' | 'no' | 'unknown';
export type TestedAnswer = CriterionAnswer | 'n_a';
export type EvidencedAnswer = 'yes' | 'no';
export type OwnerAnswer = 'yes' | 'no' | 'unknown';

export type RagBand = 'red' | 'amber' | 'yellow' | 'green';
export type Priority = 'critical' | 'high' | 'medium' | 'low';

export interface CriterionFacts {
  documented: CriterionAnswer;
  implemented: CriterionAnswer;
  tested: TestedAnswer;
  evidenced: EvidencedAnswer;
  ownerAssigned: OwnerAnswer;
}

export interface EvidenceRef {
  docId: string;
  quote: string;
}

export interface ComputedScoring {
  numericScore: number;       // 0-100
  score: RagBand;
  priority: Priority;
  rubricVersion: number;
  /** Which caps bound the score (empty when uncapped) */
  capsApplied: Array<'evidence' | 'testing'>;
}

// ── Weights & thresholds (the whole rubric in four constants) ─────────────

export const WEIGHTS = {
  documented: 30,
  implemented: 40,
  tested: 20,
  ownerAssigned: 10,
} as const;

/** Maximum score when evidenced='no' or tested∈{no,unknown} — top of yellow. */
export const CAP_SCORE = 74;

export const BAND_THRESHOLDS = {
  redMax: 24,     // 0-24    red
  amberMax: 49,   // 25-49   amber
  yellowMax: 74,  // 50-74   yellow
} as const;       // 75-100  green

const PRIORITY_FOR_BAND: Record<RagBand, Priority> = {
  red: 'critical',
  amber: 'high',
  yellow: 'medium',
  green: 'low',
};

// ── Core computation ───────────────────────────────────────────────────────

/** Credit multiplier for a criterion answer: yes=1, partial=0.5, no/unknown=0. */
export function creditFor(answer: CriterionAnswer): number {
  if (answer === 'yes') return 1;
  if (answer === 'partial') return 0.5;
  return 0;
}

/** RAG band for a 0-100 numeric score. */
export function bandForScore(numericScore: number): RagBand {
  if (numericScore <= BAND_THRESHOLDS.redMax) return 'red';
  if (numericScore <= BAND_THRESHOLDS.amberMax) return 'amber';
  if (numericScore <= BAND_THRESHOLDS.yellowMax) return 'yellow';
  return 'green';
}

/** Priority for a 0-100 numeric score (derived from band — see header). */
export function priorityForScore(numericScore: number): Priority {
  return PRIORITY_FOR_BAND[bandForScore(numericScore)];
}

/**
 * THE deterministic scoring function. Facts in, score/band/priority out.
 * No LLM. No randomness. Every branch unit-tested.
 */
export function computeScoring(facts: CriterionFacts): ComputedScoring {
  const testedNA = facts.tested === 'n_a';

  let raw =
    WEIGHTS.documented * creditFor(facts.documented) +
    WEIGHTS.implemented * creditFor(facts.implemented) +
    WEIGHTS.ownerAssigned * (facts.ownerAssigned === 'yes' ? 1 : 0);

  let denominator = 100;
  if (testedNA) {
    denominator = 100 - WEIGHTS.tested; // 80 — tested leaves the denominator
  } else {
    raw += WEIGHTS.tested * creditFor(facts.tested as CriterionAnswer);
  }

  let numericScore = Math.round((raw * 100) / denominator);

  const capsApplied: Array<'evidence' | 'testing'> = [];
  if (facts.evidenced === 'no' && numericScore > CAP_SCORE) {
    capsApplied.push('evidence');
  }
  if (!testedNA && (facts.tested === 'no' || facts.tested === 'unknown') && numericScore > CAP_SCORE) {
    capsApplied.push('testing');
  }
  if (capsApplied.length > 0) numericScore = CAP_SCORE;

  return {
    numericScore,
    score: bandForScore(numericScore),
    priority: priorityForScore(numericScore),
    rubricVersion: RUBRIC_VERSION,
    capsApplied,
  };
}

/**
 * Scoring for an explicit MANUAL assessor override (Wave 1.2): the assessor
 * sets the numeric score directly; band is still derived deterministically
 * from the rubric thresholds (so band and number can never disagree), and
 * priority is the supplied value when valid, else derived from the band.
 */
export function scoringForManual(
  numericScore: number,
  priority?: unknown,
): { numericScore: number; score: RagBand; priority: Priority } {
  const clamped = Math.max(0, Math.min(100, Math.round(Number.isFinite(numericScore) ? numericScore : 0)));
  const band = bandForScore(clamped);
  const prio = isPriority(priority) ? priority : PRIORITY_FOR_BAND[band];
  return { numericScore: clamped, score: band, priority: prio };
}

// ── Normalization / validation (LLM output is untrusted input) ────────────

const CRITERION_VALUES: ReadonlySet<string> = new Set(['yes', 'partial', 'no', 'unknown']);
const TESTED_VALUES: ReadonlySet<string> = new Set(['yes', 'partial', 'no', 'n_a', 'unknown']);
const OWNER_VALUES: ReadonlySet<string> = new Set(['yes', 'no', 'unknown']);

function isPriority(v: unknown): v is Priority {
  return v === 'critical' || v === 'high' || v === 'medium' || v === 'low';
}

export function isRagBand(v: unknown): v is RagBand {
  return v === 'red' || v === 'amber' || v === 'yellow' || v === 'green';
}

/** Lowercase/trim a raw answer; common synonyms mapped conservatively. */
function cleanAnswer(v: unknown): string {
  const s = String(v ?? '').trim().toLowerCase().replace(/[\s-]/g, '_');
  if (s === 'na' || s === 'n/a' || s === 'not_applicable') return 'n_a';
  if (s === 'true') return 'yes';
  if (s === 'false') return 'no';
  return s;
}

export interface NormalizedFacts {
  facts: CriterionFacts;
  warnings: string[];
}

/**
 * Coerce an untrusted criteria object into valid CriterionFacts.
 * Invalid / missing values become 'unknown' (or 'no' for evidenced) with a
 * warning — never a guess in the entity's favour.
 * Returns null facts only when the input is not an object at all.
 */
export function normalizeFacts(raw: unknown): NormalizedFacts | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const warnings: string[] = [];

  const pick = (key: string, allowed: ReadonlySet<string>, fallback: string): string => {
    const v = cleanAnswer(r[key]);
    if (allowed.has(v)) return v;
    if (r[key] !== undefined && r[key] !== null && String(r[key]).trim() !== '') {
      warnings.push(`invalid_criterion_value:${key}`);
    } else {
      warnings.push(`missing_criterion:${key}`);
    }
    return fallback;
  };

  const facts: CriterionFacts = {
    documented: pick('documented', CRITERION_VALUES, 'unknown') as CriterionAnswer,
    implemented: pick('implemented', CRITERION_VALUES, 'unknown') as CriterionAnswer,
    tested: pick('tested', TESTED_VALUES, 'unknown') as TestedAnswer,
    evidenced: pick('evidenced', new Set(['yes', 'no']), 'no') as EvidencedAnswer,
    ownerAssigned: pick('ownerAssigned', OWNER_VALUES, 'unknown') as OwnerAnswer,
  };

  return { facts, warnings };
}

/**
 * Validate evidence refs against the known evidence manifest (Wave 1.5).
 * Refs citing unknown docIds are DROPPED with a warning — the run never fails.
 * Quotes are clipped to 300 chars (verbatim spans, not essays).
 */
export function validateEvidenceRefs(
  raw: unknown,
  knownDocIds: ReadonlySet<string>,
): { refs: EvidenceRef[]; warnings: string[] } {
  const warnings: string[] = [];
  if (!Array.isArray(raw)) return { refs: [], warnings };
  const refs: EvidenceRef[] = [];
  for (const item of raw) {
    if (item === null || typeof item !== 'object') continue;
    const docId = String((item as Record<string, unknown>).docId ?? '').trim();
    const quote = String((item as Record<string, unknown>).quote ?? '').trim().slice(0, 300);
    if (!docId || !quote) continue;
    if (!knownDocIds.has(docId)) {
      warnings.push(`unknown_doc_ref:${docId}`);
      continue;
    }
    refs.push({ docId, quote });
  }
  return { refs, warnings };
}

/**
 * Deterministic consistency guard: an article cannot claim evidenced='yes'
 * with zero surviving evidence refs. Downgrades to 'no' with a warning.
 */
export function enforceEvidenceConsistency(
  facts: CriterionFacts,
  refs: EvidenceRef[],
): { facts: CriterionFacts; warnings: string[] } {
  if (facts.evidenced === 'yes' && refs.length === 0) {
    return {
      facts: { ...facts, evidenced: 'no' },
      warnings: ['evidenced_without_refs'],
    };
  }
  return { facts, warnings: [] };
}

/** Structural equality of two fact sets (carry-forward detection, Wave 1.7). */
export function factsEqual(a: CriterionFacts | null | undefined, b: CriterionFacts | null | undefined): boolean {
  if (!a || !b) return false;
  return (
    a.documented === b.documented &&
    a.implemented === b.implemented &&
    a.tested === b.tested &&
    a.evidenced === b.evidenced &&
    a.ownerAssigned === b.ownerAssigned
  );
}
