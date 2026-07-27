/**
 * thinking-map.test.ts — the single-source thinking-level → provider-params maps.
 * Locks the canonical values (notably the resolved 10000/16384 think_hard drift)
 * and the adaptive-vs-budget model classification that claude-client and
 * model-adapter now share.
 */
import { describe, it, expect } from 'vitest';
import {
  anthropicUsesAdaptive,
  anthropicEffort,
  anthropicBudgetTokens,
  azureReasoningEffort,
  mistralUsesReasoning,
  openaiReasoningEffort,
  isOpenAIReasoningModel,
  thinkingGranularity,
} from '../../server/services/thinking-map.js';

describe('thinking-map — Anthropic', () => {
  it('classifies adaptive models (Fable 5 / Opus 4.8 / Sonnet 4.6) vs budget models', () => {
    expect(anthropicUsesAdaptive('claude-fable-5')).toBe(true);
    expect(anthropicUsesAdaptive('claude-opus-4-8')).toBe(true);
    expect(anthropicUsesAdaptive('claude-sonnet-4-6')).toBe(true);
    // Older models use budget_tokens — NOT adaptive (model-adapter used to send
    // adaptive to every `opus`, which was wrong for 4.6/4.7).
    expect(anthropicUsesAdaptive('claude-opus-4-7')).toBe(false);
    expect(anthropicUsesAdaptive('claude-opus-4-6')).toBe(false);
    expect(anthropicUsesAdaptive('claude-sonnet-4-5-20250929')).toBe(false);
    expect(anthropicUsesAdaptive('claude-haiku-4-5-20251001')).toBe(false);
  });

  it('maps effort for adaptive models', () => {
    expect(anthropicEffort('quick')).toBe('low');
    expect(anthropicEffort('think')).toBe('medium');
    expect(anthropicEffort('think_hard')).toBe('high');
    expect(anthropicEffort('investigate')).toBe('max');
    expect(anthropicEffort('plan_first')).toBe('max');
    expect(anthropicEffort('deep_investigate')).toBe('max');
  });

  it('maps budget_tokens for older models — think_hard canonicalised to 10000 (not 16384)', () => {
    expect(anthropicBudgetTokens('quick')).toBeNull(); // thinking off
    expect(anthropicBudgetTokens('think')).toBe(4096);
    expect(anthropicBudgetTokens('think_hard')).toBe(10000); // drift guard
    expect(anthropicBudgetTokens('investigate')).toBe(32768);
    expect(anthropicBudgetTokens('plan_first')).toBe(32768);
    expect(anthropicBudgetTokens('deep_investigate')).toBe(32768);
  });
});

describe('thinking-map — Azure reasoning deployments', () => {
  it('maps reasoning_effort into three buckets', () => {
    expect(azureReasoningEffort('quick')).toBe('low');
    expect(azureReasoningEffort('think')).toBe('medium');
    expect(azureReasoningEffort('think_hard')).toBe('high');
    expect(azureReasoningEffort('investigate')).toBe('high');
    expect(azureReasoningEffort('plan_first')).toBe('high');
    expect(azureReasoningEffort('deep_investigate')).toBe('high');
  });
});

describe('thinking-map — OpenAI reasoning', () => {
  it('detects BOTH the o-series and gpt-5.x (safe: unsure → non-reasoning)', () => {
    expect(isOpenAIReasoningModel('o1')).toBe(true);
    expect(isOpenAIReasoningModel('o3-mini')).toBe(true);
    expect(isOpenAIReasoningModel('o4-mini')).toBe(true);
    // gpt-5.x accepts reasoning_effort too. This previously asserted `false`,
    // which encoded a LIMITATION rather than a truth: the thinking level was
    // being silently dropped for every gpt-5 model, while the UI still claimed
    // those models "reason on or off".
    expect(isOpenAIReasoningModel('gpt-5.4')).toBe(true);
    expect(isOpenAIReasoningModel('gpt-5.6-sol')).toBe(true);
    expect(isOpenAIReasoningModel('gpt-5.6-luna')).toBe(true);
    // Older chat models must NOT be flagged — reasoning_effort errors on them.
    expect(isOpenAIReasoningModel('gpt-4o')).toBe(false);
    expect(isOpenAIReasoningModel('gpt-4o-mini')).toBe(false);
    expect(isOpenAIReasoningModel('some-unknown-model')).toBe(false);
  });

  it('gives gpt-5.x the full ladder — the top levels no longer collapse', () => {
    expect(openaiReasoningEffort('quick', 'gpt-5.6-sol')).toBe('low');
    expect(openaiReasoningEffort('think', 'gpt-5.6-sol')).toBe('medium');
    expect(openaiReasoningEffort('think_hard', 'gpt-5.6-sol')).toBe('high');
    expect(openaiReasoningEffort('investigate', 'gpt-5.6-sol')).toBe('xhigh');
    expect(openaiReasoningEffort('deep_investigate', 'gpt-5.6-sol')).toBe('max');
  });

  it('clamps the o-series to low/medium/high — xhigh/max would 400 there', () => {
    expect(openaiReasoningEffort('investigate', 'o3-mini')).toBe('high');
    expect(openaiReasoningEffort('deep_investigate', 'o3-mini')).toBe('high');
    // No model given: assume the narrow set, since sending xhigh to a model that
    // rejects it is a hard failure while sending high is merely conservative.
    expect(openaiReasoningEffort('deep_investigate')).toBe('high');
  });
});

describe('thinking-map — Mistral (Magistral switch)', () => {
  it('escalates only at investigate+ (think_hard stays on the base model)', () => {
    expect(mistralUsesReasoning('quick')).toBe(false);
    expect(mistralUsesReasoning('think')).toBe(false);
    expect(mistralUsesReasoning('think_hard')).toBe(false);
    expect(mistralUsesReasoning('investigate')).toBe(true);
    expect(mistralUsesReasoning('plan_first')).toBe(true);
    expect(mistralUsesReasoning('deep_investigate')).toBe(true);
  });
});

describe('thinking-map — UI granularity classifier', () => {
  it('reports how finely each provider honours thinking levels', () => {
    expect(thinkingGranularity('anthropic')).toBe('full');
    expect(thinkingGranularity('azure', { azureReasoning: true })).toBe('effort3');
    expect(thinkingGranularity('azure', { azureReasoning: false })).toBe('none');
    expect(thinkingGranularity('azure')).toBe('none');
    expect(thinkingGranularity('mistral')).toBe('threshold');
    expect(thinkingGranularity('openai')).toBe('binary');
    expect(thinkingGranularity('google')).toBe('binary');
    expect(thinkingGranularity('ollama')).toBe('none');
    expect(thinkingGranularity('compat')).toBe('none');
    expect(thinkingGranularity('something-unknown')).toBe('none');
  });
});
