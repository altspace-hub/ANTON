/**
 * mission-model-resolver.test.ts — Wave-2 2A.4 / parity M8.
 *
 * model_strategy was stored but never read (`resolveModel(_strategy)`).
 * These tests lock the new contract: an explicit valid model wins, unknown
 * ids fall back to the tier default, dynamic ollama:/compat:/azure: ids are
 * accepted, and the tier-default path maps through the configured provider.
 *
 * Env handling mirrors tests/services/provider-router.test.ts.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  resolveMissionModel,
  isResolvableModelId,
  providerForModel,
} from '../../../server/services/missions/mission-model-resolver.js';

const ENV_KEYS = ['ANTHROPIC_API_KEY', 'MISTRAL_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY', 'DEFAULT_MODEL'] as const;
let saved: Record<string, string | undefined>;

function onlyProvider(provider: 'anthropic' | 'mistral' | 'openai' | 'google'): void {
  for (const k of ENV_KEYS) delete process.env[k];
  process.env[`${provider.toUpperCase()}_API_KEY`] = 'test-key';
}

beforeEach(() => { saved = {}; for (const k of ENV_KEYS) saved[k] = process.env[k]; for (const k of ENV_KEYS) delete process.env[k]; });
afterEach(() => { for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

describe('isResolvableModelId', () => {
  it('accepts known registry ids', () => {
    expect(isResolvableModelId('claude-sonnet-4-6')).toBe(true);
    expect(isResolvableModelId('mistral-large-latest')).toBe(true);
  });

  it('accepts dynamic ollama:/compat:/azure: ids (DB/endpoint-resolved)', () => {
    expect(isResolvableModelId('ollama:qwen3:8b')).toBe(true);
    expect(isResolvableModelId('compat:groq:llama-3.3-70b')).toBe(true);
    expect(isResolvableModelId('azure:my-deployment')).toBe(true);
  });

  it('rejects unknown static ids (typos fall back to tier default)', () => {
    expect(isResolvableModelId('claude-bananas')).toBe(false);
    expect(isResolvableModelId('gpt-99-ultra')).toBe(false);
  });
});

describe('resolveMissionModel', () => {
  it('returns the explicit per-tier model when set and valid', () => {
    onlyProvider('anthropic');
    const strategy = {
      planning_model: 'claude-opus-4-8',
      execution_model: 'mistral-small-latest',
      utility_model: 'claude-haiku-4-5-20251001',
    };
    expect(resolveMissionModel('planning', strategy)).toBe('claude-opus-4-8');
    expect(resolveMissionModel('execution', strategy)).toBe('mistral-small-latest');
    expect(resolveMissionModel('utility', strategy)).toBe('claude-haiku-4-5-20251001');
  });

  it("returns a dynamic ollama model when set (lets an Ollama user run whole missions)", () => {
    onlyProvider('anthropic');
    expect(resolveMissionModel('execution', { execution_model: 'ollama:qwen3:8b' })).toBe('ollama:qwen3:8b');
  });

  it("falls back to the tier default when the strategy model is 'auto'", () => {
    onlyProvider('anthropic');
    expect(resolveMissionModel('execution', { execution_model: 'auto' })).toBe('claude-sonnet-4-6');
  });

  it('falls back to the tier default for unknown model ids', () => {
    onlyProvider('anthropic');
    expect(resolveMissionModel('planning', { planning_model: 'claude-bananas' })).toBe('claude-opus-4-8');
  });

  it('maps the tier default to the configured provider when no strategy model is set', () => {
    onlyProvider('mistral');
    expect(resolveMissionModel('execution')).toBe('mistral-medium-latest');
    expect(resolveMissionModel('planning')).toBe('mistral-large-latest');
  });

  it("provider_preference='anthropic' pins the Claude tier default when a key exists", () => {
    onlyProvider('anthropic');
    expect(resolveMissionModel('execution', { provider_preference: 'anthropic' })).toBe('claude-sonnet-4-6');
  });

  it('honours a defaultModel override (decomposition plans on Sonnet, not Opus)', () => {
    onlyProvider('anthropic');
    expect(resolveMissionModel('planning', undefined, 'claude-sonnet-4-6')).toBe('claude-sonnet-4-6');
  });
});

describe('providerForModel', () => {
  it('records the real provider for the activity log', () => {
    expect(providerForModel('claude-sonnet-4-6')).toBe('anthropic');
    expect(providerForModel('mistral-large-latest')).toBe('mistral');
    expect(providerForModel('ollama:qwen3:8b')).toBe('ollama');
    expect(providerForModel('compat:groq:llama-3.3-70b')).toBe('openai_compatible');
  });

  it('falls back to anthropic for unclassifiable ids (mirrors provider-router)', () => {
    expect(providerForModel('mystery-model')).toBe('anthropic');
  });
});
