import { describe, it, expect } from 'vitest';
import { MODEL_CAPABILITIES, getThinkingConfig, estimateCost as capEstimateCost } from '../../server/config/model-capabilities';
import { MODEL_REGISTRY } from '../../server/types/modelAdapter';
import { estimateCost as teEstimateCost } from '../../server/services/token-estimator';

/**
 * Guards the "duplicated registries drift" class flagged in the 2026-05-30 audit
 * (roadmap focus ⑤). ANTON keeps model metadata in TWO places —
 * model-capabilities.ts (MODEL_CAPABILITIES, the source of truth) and
 * modelAdapter.ts (MODEL_REGISTRY, drives the main /api/claude route). They
 * silently disagreeing caused real bugs: the Haiku max_tokens=32k ceiling and
 * Haiku/Opus pricing drift. This test fails the moment they diverge again.
 */
describe('model registry consistency (MODEL_CAPABILITIES ↔ MODEL_REGISTRY)', () => {
  const sharedIds = Object.keys(MODEL_CAPABILITIES).filter((id) => MODEL_REGISTRY[id]);

  it('cross-checks a meaningful set of shared models', () => {
    expect(sharedIds.length).toBeGreaterThanOrEqual(6);
  });

  it.each(sharedIds)('%s: max output and pricing agree across registries', (id) => {
    const cap = MODEL_CAPABILITIES[id];
    const reg = MODEL_REGISTRY[id];
    expect(reg.maxOutputTokens).toBe(cap.maxOutputTokens);
    expect(reg.costPer1MInput).toBe(cap.pricing.inputPerMillion);
    expect(reg.costPer1MOutput).toBe(cap.pricing.outputPerMillion);
    // Context window: capabilities tracks the MAX achievable (which may require
    // a beta header, e.g. Sonnet 4.5's 1M), while the registry tracks the GA
    // default (200k). Only require agreement when the full context is GA.
    if (!cap.requires1MBetaHeader) {
      expect(reg.contextWindow).toBe(cap.maxContextWindow);
    }
  });
});

describe('getThinkingConfig', () => {
  it('maps Opus 4.8 ANTON thinking levels to adaptive effort', () => {
    expect(getThinkingConfig('claude-opus-4-8', 'quick')).toMatchObject({ thinkingType: 'adaptive', effort: 'low' });
    expect(getThinkingConfig('claude-opus-4-8', 'think')).toMatchObject({ thinkingType: 'adaptive', effort: 'medium' });
    expect(getThinkingConfig('claude-opus-4-8', 'think_hard')).toMatchObject({ thinkingType: 'adaptive', effort: 'high' });
    expect(getThinkingConfig('claude-opus-4-8', 'investigate')).toMatchObject({ thinkingType: 'adaptive', effort: 'max' });
  });

  it('falls back to a sane default for an unknown ANTON level', () => {
    // Unknown level should not throw and should yield a thinking config.
    expect(getThinkingConfig('claude-opus-4-8', 'nonsense-level').thinkingType).toBe('adaptive');
  });

  it('returns no native thinking for non-Anthropic or unknown models', () => {
    expect(getThinkingConfig('mistral-large-latest', 'think').thinkingType).toBe('none');
    expect(getThinkingConfig('totally-unknown-model', 'think').thinkingType).toBe('none');
  });
});

describe('server cost estimation delegates to the model-capabilities SoT', () => {
  // token-estimator.estimateCost (and audit.ts via it) now delegate to
  // model-capabilities.estimateCost. This guards against re-introducing a
  // hand-maintained server-side pricing table that drifts (the Haiku $0.80 vs
  // $1 class of bug). Asymmetric in/out tokens also catch an input/output swap.
  it.each(Object.keys(MODEL_CAPABILITIES))('%s: token-estimator cost == capabilities cost', (id) => {
    expect(teEstimateCost(1_000_000, 2_000_000, id)).toBeCloseTo(capEstimateCost(id, 1_000_000, 2_000_000, 0), 9);
  });
});
