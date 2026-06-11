/**
 * model-router.test.ts — Wave 3.7 provider-aware recommender.
 *
 * Verifies that tier→model derivation is REGISTRY-driven (MODEL_REGISTRY
 * costTier + real pricing) for three providers, and that cost multipliers
 * come from registry pricing rather than hardcoded constants.
 */
import { describe, it, expect } from 'vitest';
import { recommendModel, decideTier, deriveTierModels, blendedCostPer1M } from '../../server/services/model-router.js';
import { MODEL_REGISTRY } from '../../server/types/modelAdapter.js';

describe('decideTier (task-shaped rules)', () => {
  it('investigate / plan_first force the large tier', () => {
    expect(decideTier({ thinkingLevel: 'investigate' }).tier).toBe('large');
    expect(decideTier({ thinkingLevel: 'plan_first' }).tier).toBe('large');
  });

  it('quick forces the small tier', () => {
    expect(decideTier({ thinkingLevel: 'quick' }).tier).toBe('small');
  });

  it('heavyweight output formats trigger the large tier', () => {
    expect(decideTier({ outputFormats: ['executive-summary'] }).tier).toBe('large');
    expect(decideTier({ outputFormats: ['action-plan', 'regulatory-comparison'] }).tier).toBe('large');
  });

  it('exclusively-light formats trigger the small tier', () => {
    expect(decideTier({ outputFormats: ['quick-briefing'] }).tier).toBe('small');
    // mixed light + medium → medium
    expect(decideTier({ outputFormats: ['quick-briefing', 'action-plan'] }).tier).toBe('medium');
  });

  it('defaults to the medium tier', () => {
    expect(decideTier({}).tier).toBe('medium');
  });
});

describe('recommendModel — provider derivation (registry-driven)', () => {
  it('Claude default → Haiku / Sonnet / Opus per tier', () => {
    const large = recommendModel({ thinkingLevel: 'investigate', defaultModel: 'claude-opus-4-8' });
    expect(large.provider).toBe('anthropic');
    expect(large.recommended).toBe('claude-opus-4-8');

    const small = recommendModel({ thinkingLevel: 'quick', defaultModel: 'claude-opus-4-8' });
    expect(small.recommended).toBe('claude-haiku-4-5-20251001');

    const medium = recommendModel({ defaultModel: 'claude-sonnet-4-6' });
    expect(medium.recommended).toBe('claude-sonnet-4-6');
    // Alternatives cover the other two tiers
    expect(medium.alternatives.map((a) => a.model).sort()).toEqual(
      ['claude-haiku-4-5-20251001', 'claude-opus-4-8'].sort()
    );
  });

  it('Mistral default → small/medium/large Mistral models', () => {
    const large = recommendModel({ thinkingLevel: 'investigate', defaultModel: 'mistral-medium-latest' });
    expect(large.provider).toBe('mistral');
    expect(large.recommended).toBe('mistral-large-latest');

    const small = recommendModel({ thinkingLevel: 'quick', defaultModel: 'mistral-medium-latest' });
    expect(small.recommended).toBe('mistral-small-latest');

    const medium = recommendModel({ defaultModel: 'mistral-large-latest' });
    expect(medium.recommended).toBe('mistral-medium-latest');
  });

  it('Ollama default → the user\'s local model, zero token cost, no fake tiers', () => {
    const rec = recommendModel({ thinkingLevel: 'investigate', defaultModel: 'ollama:qwen2.5:14b' });
    expect(rec.provider).toBe('ollama');
    expect(rec.recommended).toBe('ollama:qwen2.5:14b');
    expect(rec.pricing).toEqual({ inputPer1M: 0, outputPer1M: 0 });
    expect(rec.alternatives).toEqual([]);
  });

  it('compat default → the configured endpoint model', () => {
    const rec = recommendModel({ defaultModel: 'compat:openrouter:qwen/qwen-2.5-72b' });
    expect(rec.provider).toBe('openai_compatible');
    expect(rec.recommended).toBe('compat:openrouter:qwen/qwen-2.5-72b');
    expect(rec.alternatives).toEqual([]);
  });

  it('unknown default (azure:dep) → honest passthrough, no invented tiers', () => {
    const rec = recommendModel({ defaultModel: 'azure:my-deployment' });
    expect(rec.recommended).toBe('azure:my-deployment');
    expect(rec.provider).toBe('unknown');
    expect(rec.alternatives).toEqual([]);
  });
});

describe('honest costs from the registry (no hardcoded multipliers)', () => {
  it('recommended pricing equals the registry pricing exactly', () => {
    const rec = recommendModel({ thinkingLevel: 'investigate', defaultModel: 'claude-sonnet-4-6' });
    const reg = MODEL_REGISTRY[rec.recommended];
    expect(rec.pricing.inputPer1M).toBe(reg.costPer1MInput);
    expect(rec.pricing.outputPer1M).toBe(reg.costPer1MOutput);
  });

  it('alternative cost multipliers are computed from registry pricing', () => {
    const rec = recommendModel({ defaultModel: 'claude-sonnet-4-6' }); // medium → Sonnet
    const sonnet = MODEL_REGISTRY['claude-sonnet-4-6'];
    const sonnetBlended = blendedCostPer1M({ inputPer1M: sonnet.costPer1MInput, outputPer1M: sonnet.costPer1MOutput });

    for (const alt of rec.alternatives) {
      const reg = MODEL_REGISTRY[alt.model];
      const expected = blendedCostPer1M({ inputPer1M: reg.costPer1MInput, outputPer1M: reg.costPer1MOutput }) / sonnetBlended;
      expect(alt.estimatedCostMultiplier).toBeCloseTo(expected, 6);
    }
  });

  it('deriveTierModels only returns models whose registry costTier matches the tier', () => {
    for (const provider of ['anthropic', 'mistral', 'openai', 'google'] as const) {
      const tiers = deriveTierModels(provider);
      const expectedCostTier = { small: 1, medium: 2, large: 3 } as const;
      for (const [tier, model] of Object.entries(tiers)) {
        expect(model.provider).toBe(provider);
        expect(model.costTier).toBe(expectedCostTier[tier as 'small' | 'medium' | 'large']);
        expect(MODEL_REGISTRY[model.modelId]).toBeDefined();
      }
    }
  });
});
