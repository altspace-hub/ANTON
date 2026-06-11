/**
 * gap-second-opinion.test.ts — pure agreement computation for the Gap Assessor
 * second-opinion lane (Wave 2.7, CORE_EXPERIENCE_REVIEW 2026-06).
 *
 * The agreement definition is the payoff of the shared deterministic rubric
 * (Wave 1A): two models agree on an article iff their criterion facts produce
 * the same computed numeric score. No LLM judge anywhere in here.
 */
import { describe, it, expect } from 'vitest';
import {
  computeOpinionAgreement,
  coerceFacts,
  mapOpinionRow,
  CRITERION_KEYS,
  type PrimaryFindingLite,
  type OpinionLite,
  type OpinionRow,
} from '../../server/services/gap-second-opinion.js';
import { computeScoring, type CriterionFacts } from '../../server/services/gap-scoring.js';

const FACTS_STRONG: CriterionFacts = { documented: 'yes', implemented: 'yes', tested: 'yes', evidenced: 'yes', ownerAssigned: 'yes' };
const FACTS_WEAK: CriterionFacts = { documented: 'partial', implemented: 'no', tested: 'unknown', evidenced: 'no', ownerAssigned: 'unknown' };

function primary(articleId: string, facts: CriterionFacts | null, overrides: Partial<PrimaryFindingLite> = {}): PrimaryFindingLite {
  const computed = facts ? computeScoring(facts) : null;
  return {
    framework: 'amlr-2024',
    articleId,
    articleTitle: `Article ${articleId}`,
    criteria: facts,
    score: computed?.score ?? 'yellow',
    numericScore: computed?.numericScore ?? 55,
    priority: computed?.priority ?? 'medium',
    notes: `primary rationale for ${articleId}`,
    computedScore: computed?.score ?? null,
    computedNumericScore: computed?.numericScore ?? null,
    computedPriority: computed?.priority ?? null,
    rubricVersion: facts ? 1 : null,
    ...overrides,
  };
}

function opinion(articleId: string, facts: CriterionFacts | null, modelId = 'mistral-large-latest'): OpinionLite {
  const computed = facts ? computeScoring(facts) : null;
  return {
    framework: 'amlr-2024',
    articleId,
    articleTitle: `Article ${articleId}`,
    modelId,
    facts,
    computedScore: computed?.score ?? null,
    computedNumericScore: computed?.numericScore ?? null,
    computedPriority: computed?.priority ?? null,
    rationale: `opinion rationale for ${articleId}`,
    rubricVersion: facts ? 1 : null,
  };
}

describe('computeOpinionAgreement', () => {
  it('identical facts → agreement, all criteria match', () => {
    const summary = computeOpinionAgreement(
      [primary('Art.1', FACTS_STRONG)],
      [opinion('Art.1', FACTS_STRONG)],
      'mistral-large-latest',
    );
    expect(summary.comparedCount).toBe(1);
    expect(summary.agreeCount).toBe(1);
    expect(summary.agreementPct).toBe(100);
    expect(summary.divergent).toHaveLength(0);
    const article = summary.articles[0];
    expect(article.agree).toBe(true);
    expect(article.criteria).toHaveLength(CRITERION_KEYS.length);
    expect(article.criteria.every(c => c.match)).toBe(true);
    expect(article.primary.rationale).toContain('primary rationale');
    expect(article.opinion.rationale).toContain('opinion rationale');
  });

  it('different facts → divergence flagged with per-criterion mismatches', () => {
    const summary = computeOpinionAgreement(
      [primary('Art.2', FACTS_STRONG)],
      [opinion('Art.2', FACTS_WEAK)],
      'mistral-large-latest',
    );
    expect(summary.agreementPct).toBe(0);
    expect(summary.divergent).toHaveLength(1);
    const article = summary.divergent[0];
    expect(article.agree).toBe(false);
    const documented = article.criteria.find(c => c.key === 'documented')!;
    expect(documented).toMatchObject({ primary: 'yes', opinion: 'partial', match: false });
    // Both rationales are carried for human review
    expect(article.primary.rationale).toBeTruthy();
    expect(article.opinion.rationale).toBeTruthy();
  });

  it('different facts that yield the SAME rubric score still agree (the rubric is the referee)', () => {
    // Both score 0: all-no vs all-unknown produce identical numeric scores.
    const allNo: CriterionFacts = { documented: 'no', implemented: 'no', tested: 'no', evidenced: 'no', ownerAssigned: 'no' };
    const allUnknown: CriterionFacts = { documented: 'unknown', implemented: 'unknown', tested: 'unknown', evidenced: 'no', ownerAssigned: 'unknown' };
    expect(computeScoring(allNo).numericScore).toBe(computeScoring(allUnknown).numericScore);

    const summary = computeOpinionAgreement([primary('Art.3', allNo)], [opinion('Art.3', allUnknown)], 'mistral-large-latest');
    expect(summary.articles[0].agree).toBe(true);
    // …but the criterion matrix still shows WHERE the answers differ
    expect(summary.articles[0].criteria.some(c => !c.match)).toBe(true);
  });

  it('assessor override on the primary does not fake divergence (computed_* is compared)', () => {
    // Assessor manually overrode the effective score to 100/green, but the
    // rubric-computed value matches the opinion → still agreement.
    const overridden = primary('Art.4', FACTS_WEAK, { score: 'green', numericScore: 100, priority: 'low' });
    const summary = computeOpinionAgreement([overridden], [opinion('Art.4', FACTS_WEAK)], 'mistral-large-latest');
    expect(summary.articles[0].agree).toBe(true);
    expect(summary.articles[0].primary.numericScore).toBe(computeScoring(FACTS_WEAK).numericScore);
  });

  it('legacy primary without facts falls back to band comparison', () => {
    const legacy = primary('Art.5', null, { score: 'red', numericScore: 10, priority: 'critical' });
    const redOpinionFacts: CriterionFacts = { documented: 'no', implemented: 'no', tested: 'no', evidenced: 'no', ownerAssigned: 'no' };
    const summary = computeOpinionAgreement([legacy], [opinion('Art.5', redOpinionFacts)], 'mistral-large-latest');
    const article = summary.articles[0];
    expect(article.legacyComparison).toBe(true);
    expect(article.agree).toBe(true); // red vs red
  });

  it('uncovered articles + per-model scoping + percentage math', () => {
    const summary = computeOpinionAgreement(
      [primary('Art.1', FACTS_STRONG), primary('Art.2', FACTS_STRONG), primary('Art.3', FACTS_STRONG)],
      [
        opinion('Art.1', FACTS_STRONG),
        opinion('Art.2', FACTS_WEAK),
        opinion('Art.3', FACTS_STRONG, 'some-other-model'), // different slot — ignored
      ],
      'mistral-large-latest',
    );
    expect(summary.comparedCount).toBe(2);
    expect(summary.agreeCount).toBe(1);
    expect(summary.agreementPct).toBe(50);
    expect(summary.uncoveredArticleIds).toEqual(['Art.3']);
    // Divergent-first ordering
    expect(summary.articles[0].agree).toBe(false);
  });

  it('returns null percentage when nothing is comparable', () => {
    const summary = computeOpinionAgreement([primary('Art.1', FACTS_STRONG)], [], 'mistral-large-latest');
    expect(summary.comparedCount).toBe(0);
    expect(summary.agreementPct).toBeNull();
    expect(summary.uncoveredArticleIds).toEqual(['Art.1']);
  });
});

describe('coerceFacts / mapOpinionRow', () => {
  it('accepts objects and JSON strings, rejects garbage', () => {
    expect(coerceFacts(FACTS_STRONG)).toEqual(FACTS_STRONG);
    expect(coerceFacts(JSON.stringify(FACTS_WEAK))).toEqual(FACTS_WEAK);
    expect(coerceFacts('not json')).toBeNull();
    expect(coerceFacts(null)).toBeNull();
    expect(coerceFacts([1, 2])).toBeNull();
  });

  it('maps a DB row (jsonb already parsed or string) to camelCase', () => {
    const row: OpinionRow = {
      id: 1,
      assessment_id: 'a1',
      framework: 'amlr-2024',
      article_id: 'Art.9',
      article_title: 'Internal policies',
      model_id: 'claude-sonnet-4-6',
      facts: JSON.stringify(FACTS_STRONG),
      computed_score: 'green',
      computed_numeric_score: 100,
      computed_priority: 'low',
      rubric_version: 1,
      rationale: 'looks solid',
      current_state: 'mature programme',
      evidence_refs: '[{"docId":"doc-1","quote":"q"}]',
      warnings: [],
      created_at: '2026-06-11T00:00:00Z',
    };
    const mapped = mapOpinionRow(row);
    expect(mapped.articleId).toBe('Art.9');
    expect(mapped.modelId).toBe('claude-sonnet-4-6');
    expect(mapped.facts).toEqual(FACTS_STRONG);
    expect(mapped.computedNumericScore).toBe(100);
    expect(mapped.evidenceRefs).toEqual([{ docId: 'doc-1', quote: 'q' }]);
  });
});
