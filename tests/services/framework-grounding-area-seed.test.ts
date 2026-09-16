/**
 * framework-grounding-area-seed.test.ts — Wave 2 (2026-09-16): a module run
 * in a regulated area receives framework article text even when the user does
 * not name the regulation, and every injected article carries a hash.
 *
 * Runs against the real data/frameworks files (60 regulations, article-level).
 */
import { describe, it, expect } from 'vitest';
import { retrieveGroundingText } from '../../server/services/framework-text-retrieval.js';
import { frameworksForArea } from '../../server/services/area-frameworks.js';

describe('retrieveGroundingText with an area seed', () => {
  it('an fcp question about customer due diligence grounds in AML articles without naming AMLR', async () => {
    const r = await retrieveGroundingText({
      query: 'AML Gap Analysis: customer due diligence and beneficial ownership verification for a bank',
      frameworkIds: frameworksForArea('fcp'),
      tokenBudget: 3000,
    });
    expect(r).not.toBeNull();
    const articles = r!.sources.filter((s) => s.articleId);
    expect(articles.length).toBeGreaterThan(0);
    const frameworkIds = new Set(articles.map((s) => s.frameworkId));
    expect([...frameworkIds].some((id) => frameworksForArea('fcp').includes(id))).toBe(true);
    expect(r!.text).toContain('GROUNDED REGULATORY TEXT');
    // Every injected article is pinned.
    for (const s of articles) {
      expect(s.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(s.chars).toBeGreaterThan(0);
    }
    expect(r!.approxTokens).toBeLessThanOrEqual(3000 + 200);
  });

  it('the same question in an unseeded area receives no AML article (only a framework the query names could ground)', async () => {
    const r = await retrieveGroundingText({
      query: 'customer due diligence and beneficial ownership verification for a bank',
      frameworkIds: frameworksForArea('marketing'),
      tokenBudget: 3000,
    });
    const amlIds = new Set(frameworksForArea('fcp'));
    const amlArticles = (r?.sources ?? []).filter((s) => s.articleId && amlIds.has(s.frameworkId));
    expect(amlArticles).toHaveLength(0);
  });

  it('a regulation named in the query grounds regardless of the seed', async () => {
    const r = await retrieveGroundingText({
      query: 'What does DORA require for ICT third-party risk?',
      frameworkIds: [],
      tokenBudget: 2000,
    });
    expect(r).not.toBeNull();
    expect(r!.sources.some((s) => s.frameworkId === 'dora-2022')).toBe(true);
  });
});
