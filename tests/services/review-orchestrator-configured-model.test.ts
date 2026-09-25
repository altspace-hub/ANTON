/**
 * review-orchestrator-configured-model.test.ts — the five reviewers run on the
 * configured model.
 *
 * Every reviewer was gated on an Anthropic client object (`if (anthropic)`),
 * which exists only when ANTHROPIC_API_KEY is set. On a subscription-only
 * instance or the OpenRouter showcase, POST /api/reviews/orchestrate returned
 * placeholder scores (8.0 / 8.5 / 8.0 / 7.5 / 7.0) that no model had given.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const callChat = vi.fn();
vi.mock('../../server/services/provider-router.js', () => ({ callChat: (...a: unknown[]) => callChat(...a) }));
vi.mock('../../server/services/utility-model.js', () => ({ getRoutedUtilityModelSync: () => 'compat:openrouter:z-ai/glm-5.3-flash' }));

import { createReviewOrchestrator, type ReviewContext } from '../../server/services/review-orchestrator.js';

const context: ReviewContext = {
  moduleId: 'gap-analysis', moduleName: 'Gap analysis', areaId: 'fcp', outputFormats: ['detailed-findings'],
  userMessage: 'Assess our AML programme', systemPrompt: '', thinkingLevel: 'quick', model: 'compat:openrouter:z-ai/glm-5.3-flash',
};
const OUTPUT = '# Findings\n\nAMLR Regulation (EU) 2024/1624 applies.\n' + 'line\n'.repeat(20);

beforeEach(() => { callChat.mockReset(); });

describe('review orchestrator without an Anthropic client', () => {
  it('asks the configured model for every review and uses its scores', async () => {
    callChat.mockResolvedValue({ text: '{"score": 6.5, "findings": [{"severity":"medium","category":"x","message":"m"}], "suggestions": ["s"]}' });
    const orchestrator = await createReviewOrchestrator(undefined);
    const out = await orchestrator.runAllReviewers(OUTPUT, context);

    expect(callChat).toHaveBeenCalledTimes(5);
    expect(callChat.mock.calls[0][0]).toMatchObject({ model: 'compat:openrouter:z-ai/glm-5.3-flash' });
    expect(out.reviews.map((r) => r.score)).toEqual([6.5, 6.5, 6.5, 6.5, 6.5]);
    expect(out.overallScore).toBe(6.5);
  });

  it('says so when the model gives no usable review, instead of passing a placeholder off as one', async () => {
    callChat.mockRejectedValueOnce(new Error('endpoint down')).mockResolvedValue({ text: 'I cannot comply.' });
    const orchestrator = await createReviewOrchestrator(undefined);
    const out = await orchestrator.runAllReviewers(OUTPUT, context);
    for (const r of out.reviews) {
      expect(r.findings.some((f) => f.category === 'system' && /fallback mode/.test(f.message))).toBe(true);
    }
  });
});
