import { describe, it, expect } from 'vitest';
import { MODEL_CAPABILITIES, getThinkingConfig, estimateCost as capEstimateCost } from '../../server/config/model-capabilities';
import { MODEL_REGISTRY } from '../../server/types/modelAdapter';
import { estimateCost as teEstimateCost } from '../../server/services/token-estimator';

/**
 * Guards the "duplicated registries drift" class flagged in the 2026-05-30 audit
 * (roadmap focus ⑤). As of 2026-05-31 MODEL_REGISTRY is DERIVED from
 * MODEL_CAPABILITIES (the source of truth) — pricing/context/output live in
 * exactly one place, so they can no longer drift. This suite verifies (a) every
 * capabilities model is reflected in the registry (key parity), (b) the
 * pricing/output/context projection, and (c) the non-trivial derivation RULES
 * (GA-context override for beta-gated models, provider→apiKey/temperature/caching
 * mapping, and the hand-set thinking/reasoning flags) against explicit expected
 * values so a wrong builder change is caught — not tautological.
 */
describe('model registry derivation (MODEL_CAPABILITIES → MODEL_REGISTRY)', () => {
  it('registry key set exactly matches the capabilities key set', () => {
    expect(Object.keys(MODEL_REGISTRY).sort()).toEqual(Object.keys(MODEL_CAPABILITIES).sort());
  });

  it.each(Object.keys(MODEL_CAPABILITIES))('%s: pricing + max output project from capabilities', (id) => {
    const cap = MODEL_CAPABILITIES[id];
    const reg = MODEL_REGISTRY[id];
    expect(reg.maxOutputTokens).toBe(cap.maxOutputTokens);
    expect(reg.costPer1MInput).toBe(cap.pricing.inputPerMillion);
    expect(reg.costPer1MOutput).toBe(cap.pricing.outputPerMillion);
    // Beta-gated models (Sonnet 4.5's 1M) report the 200k GA default in the
    // registry; everything else mirrors the capabilities max context.
    expect(reg.contextWindow).toBe(cap.requires1MBetaHeader ? 200_000 : cap.maxContextWindow);
  });

  it('derivation anchors: provider→apiKey/temperature/caching + GA context + corrected prices', () => {
    // Opus 4.8 — anthropic mappings + flat 1M context
    const opus = MODEL_REGISTRY['claude-opus-4-8'];
    expect(opus.provider).toBe('anthropic');
    expect(opus.requiresApiKey).toBe('ANTHROPIC_API_KEY');
    expect(opus.temperatureRange).toEqual([0, 1]);
    expect(opus.supportsPromptCaching).toBe(true);
    expect(opus.contextWindow).toBe(1_000_000);
    expect(opus.costTier).toBe(3);

    // Sonnet 4.5 — beta-gated, so registry reports 200k GA, not the 1M max
    expect(MODEL_REGISTRY['claude-sonnet-4-5-20250929'].contextWindow).toBe(200_000);

    // Haiku 4.5 — the corrected $1/$5 (was the stale $0.80/$4 drift bug)
    const haiku = MODEL_REGISTRY['claude-haiku-4-5-20251001'];
    expect(haiku.costPer1MInput).toBe(1);
    expect(haiku.costPer1MOutput).toBe(5);

    // GPT-5.4 — non-anthropic mappings (was previously registry-only with no caps twin)
    const gpt = MODEL_REGISTRY['gpt-5.4'];
    expect(gpt.provider).toBe('openai');
    expect(gpt.requiresApiKey).toBe('OPENAI_API_KEY');
    expect(gpt.temperatureRange).toEqual([0, 2]);
    expect(gpt.supportsPromptCaching).toBe(false);

    // Gemini 2.5 Pro — thinking=true is hand-set (caps adaptive/extended are both false)
    expect(MODEL_REGISTRY['gemini-2.5-pro'].supportsThinking).toBe(true);

    // Magistral — native reasoning is hand-set, NOT derived from thinking flags
    const magistral = MODEL_REGISTRY['magistral-medium-latest'];
    expect(magistral.supportsThinking).toBe(false);
    expect(magistral.supportsNativeReasoning).toBe(true);
    expect(magistral.provider).toBe('mistral');
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
