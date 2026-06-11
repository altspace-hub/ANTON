/**
 * gap-second-opinion.ts — Gap Assessor second-opinion lane
 * (CORE_EXPERIENCE_REVIEW 2026-06, Wave 2 item 2.7).
 *
 * A second-opinion run re-assesses a completed assessment with a DIFFERENT
 * model into a comparison slot (gap_finding_opinions, migration 224) — it
 * never touches gap_findings.
 *
 * The agreement computation is the payoff of the Wave-1A deterministic rubric:
 * both models answer the same structured criterion facts and the SAME pure
 * function (gap-scoring.ts computeScoring) turns facts into scores. Agreement
 * is therefore exact and judge-free: two models agree on an article iff their
 * deterministic numeric scores match; the per-criterion matrix shows WHERE
 * they diverge. Pure functions, no I/O — unit-tested directly.
 */

import type { CriterionFacts } from './gap-scoring.js';
import { normalizeFacts } from './gap-scoring.js';

// ── Shapes ───────────────────────────────────────────────────────────────────

/** Primary finding subset needed for agreement (mapFindingRow camelCase). */
export interface PrimaryFindingLite {
  framework: string;
  articleId: string;
  articleTitle?: string | null;
  criteria?: CriterionFacts | null;
  /** Effective values (may include assessor override). */
  score: string;
  numericScore: number;
  priority: string;
  notes?: string | null;
  /** Rubric-computed values preserved by Wave 1.2 — preferred for model-vs-model comparison. */
  computedScore?: string | null;
  computedNumericScore?: number | null;
  computedPriority?: string | null;
  rubricVersion?: number | null;
}

/** One stored second-opinion row (camelCase). */
export interface OpinionLite {
  framework: string;
  articleId: string;
  articleTitle?: string | null;
  modelId: string;
  facts?: CriterionFacts | null;
  computedScore?: string | null;
  computedNumericScore?: number | null;
  computedPriority?: string | null;
  rationale?: string | null;
  currentState?: string | null;
  rubricVersion?: number | null;
}

export const CRITERION_KEYS = ['documented', 'implemented', 'tested', 'evidenced', 'ownerAssigned'] as const;
export type CriterionKey = typeof CRITERION_KEYS[number];

export interface ArticleAgreement {
  framework: string;
  articleId: string;
  articleTitle: string;
  /** Deterministic scores match (the shared-rubric definition of agreement). */
  agree: boolean;
  /** Per-criterion matrix: both answers side by side + match flag. */
  criteria: Array<{
    key: CriterionKey;
    primary: string | null;
    opinion: string | null;
    match: boolean;
  }>;
  primary: {
    modelLabel: 'primary';
    numericScore: number | null;
    score: string | null;
    priority: string | null;
    rationale: string | null;
  };
  opinion: {
    modelId: string;
    numericScore: number | null;
    score: string | null;
    priority: string | null;
    rationale: string | null;
  };
  /** True when either side lacks rubric facts (legacy finding) — compared on band only. */
  legacyComparison: boolean;
}

export interface AgreementSummary {
  modelId: string;
  /** Articles present in BOTH the primary findings and the opinion slot. */
  comparedCount: number;
  agreeCount: number;
  /** 0-100, rounded; null when nothing was comparable. */
  agreementPct: number | null;
  /** Articles where the deterministic scores diverge — flagged for human review. */
  divergent: ArticleAgreement[];
  /** Full per-article rows (agreeing + diverging), sorted divergent-first. */
  articles: ArticleAgreement[];
  /** Primary articles the opinion run produced no answer for. */
  uncoveredArticleIds: string[];
}

// ── Pure computation ─────────────────────────────────────────────────────────

function keyOf(framework: string, articleId: string): string {
  return `${framework}::${articleId}`;
}

/**
 * Primary comparison values: prefer the rubric-COMPUTED score (preserved by the
 * override machinery) so an assessor's manual override never masks or fakes
 * model-vs-model disagreement.
 */
function primaryComparisonScore(f: PrimaryFindingLite): { numeric: number | null; band: string | null; priority: string | null } {
  if (f.computedNumericScore !== null && f.computedNumericScore !== undefined && f.computedScore) {
    return { numeric: f.computedNumericScore, band: f.computedScore, priority: f.computedPriority ?? null };
  }
  return { numeric: Number.isFinite(f.numericScore) ? f.numericScore : null, band: f.score ?? null, priority: f.priority ?? null };
}

/**
 * Coerce stored JSONB facts (object or JSON string) into CriterionFacts.
 *
 * #6 fix: an object with ZERO recognized criterion keys (e.g. `{}` or
 * `{foo: 1}`) is NOT facts — returning fabricated all-unknown facts here used
 * to make garbage rows look rubric-comparable. Such input now returns null,
 * which sends the comparison down the honest band-fallback (legacy) path.
 * Normalization warnings are surfaced via `warningsSink` instead of discarded.
 */
export function coerceFacts(raw: unknown, warningsSink?: string[]): CriterionFacts | null {
  let value = raw;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch {
      warningsSink?.push('facts_unparseable');
      return null;
    }
  }
  const normalized = normalizeFacts(value);
  if (!normalized) return null;
  const perKeyWarnings = normalized.warnings.filter(
    w => w.startsWith('missing_criterion:') || w.startsWith('invalid_criterion_value:'),
  );
  if (perKeyWarnings.length >= CRITERION_KEYS.length) {
    // Not a single criterion key carried a valid value — this is not facts.
    warningsSink?.push('facts_unrecognized', ...normalized.warnings);
    return null;
  }
  warningsSink?.push(...normalized.warnings);
  return normalized.facts;
}

/**
 * Compute the agreement view between primary findings and one model's
 * second-opinion slot. Deterministic, no I/O.
 */
export function computeOpinionAgreement(
  findings: PrimaryFindingLite[],
  opinions: OpinionLite[],
  modelId: string,
): AgreementSummary {
  const opinionMap = new Map<string, OpinionLite>();
  for (const o of opinions) {
    if (o.modelId === modelId) opinionMap.set(keyOf(o.framework, o.articleId), o);
  }

  const articles: ArticleAgreement[] = [];
  const uncovered: string[] = [];

  for (const f of findings) {
    const o = opinionMap.get(keyOf(f.framework, f.articleId));
    if (!o) {
      uncovered.push(f.articleId);
      continue;
    }

    const primaryFacts = f.criteria ?? null;
    const opinionFacts = o.facts ?? null;
    const legacyComparison = !primaryFacts || !opinionFacts;

    const criteria = CRITERION_KEYS.map((k) => {
      const p = primaryFacts ? String(primaryFacts[k]) : null;
      const q = opinionFacts ? String(opinionFacts[k]) : null;
      return { key: k, primary: p, opinion: q, match: p !== null && q !== null && p === q };
    });

    const pScore = primaryComparisonScore(f);
    const oNumeric = o.computedNumericScore ?? null;
    const oBand = o.computedScore ?? null;

    // Agreement = the deterministic scores match. With the shared rubric this
    // is equivalent to "the facts produce the same number". For legacy
    // findings without facts, fall back to band equality (best available).
    const agree = legacyComparison
      ? pScore.band !== null && oBand !== null && pScore.band === oBand
      : pScore.numeric !== null && oNumeric !== null && pScore.numeric === oNumeric;

    articles.push({
      framework: f.framework,
      articleId: f.articleId,
      articleTitle: String(f.articleTitle ?? o.articleTitle ?? f.articleId),
      agree,
      criteria,
      primary: {
        modelLabel: 'primary',
        numericScore: pScore.numeric,
        score: pScore.band,
        priority: pScore.priority,
        rationale: f.notes ?? null,
      },
      opinion: {
        modelId: o.modelId,
        numericScore: oNumeric,
        score: oBand,
        priority: o.computedPriority ?? null,
        rationale: o.rationale ?? null,
      },
      legacyComparison,
    });
  }

  const divergent = articles.filter((a) => !a.agree);
  const sorted = [...divergent, ...articles.filter((a) => a.agree)];
  const comparedCount = articles.length;
  const agreeCount = comparedCount - divergent.length;

  return {
    modelId,
    comparedCount,
    agreeCount,
    agreementPct: comparedCount > 0 ? Math.round((agreeCount / comparedCount) * 100) : null,
    divergent,
    articles: sorted,
    uncoveredArticleIds: uncovered,
  };
}

// ── Row mapping (DB → camelCase) ─────────────────────────────────────────────

export interface OpinionRow {
  id: number | string;
  assessment_id: string;
  framework: string;
  article_id: string;
  article_title: string | null;
  model_id: string;
  facts: unknown;
  computed_score: string | null;
  computed_numeric_score: number | null;
  computed_priority: string | null;
  rubric_version: number | null;
  rationale: string | null;
  current_state: string | null;
  evidence_refs: unknown;
  warnings: unknown;
  created_at: unknown;
}

export function mapOpinionRow(row: OpinionRow): OpinionLite & { createdAt: unknown; evidenceRefs: unknown; warnings: unknown } {
  const parseMaybe = (v: unknown): unknown => {
    if (typeof v !== 'string') return v;
    try { return JSON.parse(v); } catch { return v; }
  };
  // Surface facts-normalization warnings alongside the stored ones (#6).
  const factWarnings: string[] = [];
  const facts = coerceFacts(row.facts, factWarnings);
  const storedWarnings = parseMaybe(row.warnings);
  const warnings = factWarnings.length === 0
    ? storedWarnings
    : [...(Array.isArray(storedWarnings) ? storedWarnings : []), ...factWarnings];
  return {
    framework: row.framework,
    articleId: row.article_id,
    articleTitle: row.article_title,
    modelId: row.model_id,
    facts,
    computedScore: row.computed_score,
    computedNumericScore: row.computed_numeric_score,
    computedPriority: row.computed_priority,
    rationale: row.rationale,
    currentState: row.current_state,
    rubricVersion: row.rubric_version,
    evidenceRefs: parseMaybe(row.evidence_refs),
    warnings,
    createdAt: row.created_at,
  };
}
