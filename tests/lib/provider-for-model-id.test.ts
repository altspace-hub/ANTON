/**
 * provider-for-model-id.test.ts — Wave 0 (2026-09-16): the front-end provider
 * helper must describe the model that runs, not the engine prefix in front of it.
 *
 * Before this, `providerForModelId('sdk:claude-opus-5')` returned 'unknown', so
 * ThinkingControls told the user "This model doesn't use thinking levels" on the
 * instance default, and StatusIndicator priced plan usage with a fallback table.
 */
import { describe, it, expect } from 'vitest';
import { engineForModelId, providerForModelId, thinkingGranularity } from '../../src/lib/constants';

describe('providerForModelId — engine prefixes are stripped', () => {
  it('sdk:claude-* is anthropic (a registered underlying id)', () => {
    expect(providerForModelId('sdk:claude-opus-5')).toBe('anthropic');
    expect(providerForModelId('sdk:claude-sonnet-5')).toBe('anthropic');
  });

  it('sdk: with an unregistered underlying id still counts as anthropic — the engine only runs Claude', () => {
    expect(providerForModelId('sdk:claude-something-new')).toBe('anthropic');
  });

  it('codex: is openai', () => {
    expect(providerForModelId('codex:gpt-5-codex')).toBe('openai');
  });

  it('other prefixes are unchanged', () => {
    expect(providerForModelId('ollama:llama3')).toBe('ollama');
    expect(providerForModelId('azure:gpt-5.4')).toBe('azure');
    expect(providerForModelId('compat:groq:llama')).toBe('compat');
    expect(providerForModelId('not-a-model')).toBe('unknown');
  });

  it('thinking granularity on the subscription default is full, not none', () => {
    expect(thinkingGranularity(providerForModelId('sdk:claude-opus-5'), 'sdk:claude-opus-5')).toBe('full');
  });
});

describe('engineForModelId — how a run is billed', () => {
  it('subscription engines', () => {
    expect(engineForModelId('sdk:claude-opus-5')).toBe('subscription');
    expect(engineForModelId('codex:gpt-5-codex')).toBe('subscription');
  });
  it('everything else is api', () => {
    expect(engineForModelId('claude-opus-4-8')).toBe('api');
    expect(engineForModelId('ollama:llama3')).toBe('api');
    expect(engineForModelId('mistral-large-latest')).toBe('api');
  });
});
