/**
 * provider-router.test.ts — characterization tests (Phase-4 merge #2, safe slice).
 *
 * provider-router.ts is the specialty-route LLM dispatch entry with 42 importers.
 * The adversarial investigation concluded that REMOVING it is reckless and that
 * even the delegation refactor has overstated benefit + real divergence risk, so
 * the hot path is intentionally left intact. What IS valuable now (and was the
 * roadmap's stated prerequisite — "tests make the refactor safe") is locking the
 * provider-router-UNIQUE routing contract that any future delegation must
 * preserve: tier resolution, Claude→provider mapping, tool-format conversion,
 * and the Magistral reasoning-model switch. These are pure + deterministic, so
 * no SDK mocking is needed.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  resolveModel,
  mapModelToProvider,
  convertToolsForProvider,
  resolveMistralThinking,
} from '../../server/services/provider-router.js';

const ENV_KEYS = ['ANTHROPIC_API_KEY', 'MISTRAL_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY', 'DEFAULT_MODEL'] as const;
let saved: Record<string, string | undefined>;

/** Configure exactly one provider as "available" (getConfiguredProvider reads these). */
function onlyProvider(provider: 'anthropic' | 'mistral' | 'openai' | 'google'): void {
  for (const k of ENV_KEYS) delete process.env[k];
  process.env[`${provider.toUpperCase()}_API_KEY`] = 'test-key';
}

/** Set an exact env combination (clears all ENV_KEYS first) — for DEFAULT_MODEL tests. */
function setEnv(keys: Partial<Record<(typeof ENV_KEYS)[number], string>>): void {
  for (const k of ENV_KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(keys)) process.env[k] = v;
}

// DEFAULT_MODEL is cleared by default so the env-priority tests are deterministic.
beforeEach(() => { saved = {}; for (const k of ENV_KEYS) saved[k] = process.env[k]; delete process.env.DEFAULT_MODEL; });
afterEach(() => { for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

describe('resolveModel (tier → concrete model for active provider)', () => {
  it('passes a concrete model id through unchanged', () => {
    onlyProvider('mistral'); // active provider must not override an explicit id
    expect(resolveModel('claude-opus-4-8')).toBe('claude-opus-4-8');
  });

  it('resolves large/medium/small for the anthropic provider', () => {
    onlyProvider('anthropic');
    expect(resolveModel('large')).toBe('claude-opus-4-8');
    expect(resolveModel('medium')).toBe('claude-sonnet-4-6');
    expect(resolveModel('small')).toBe('claude-haiku-4-5-20251001');
  });

  it('resolves the tier for the active non-anthropic provider', () => {
    onlyProvider('mistral');
    expect(resolveModel('large')).toBe('mistral-large-latest');
    expect(resolveModel('small')).toBe('mistral-small-latest');
  });

  it('defaults to the medium tier when nothing is passed', () => {
    onlyProvider('anthropic');
    expect(resolveModel()).toBe('claude-sonnet-4-6');
  });
});

describe('mapModelToProvider (hardcoded Claude id → active provider equivalent)', () => {
  it('passes Claude ids through when anthropic is active', () => {
    onlyProvider('anthropic');
    expect(mapModelToProvider('claude-opus-4-8')).toBe('claude-opus-4-8');
  });

  it('maps Claude ids to the active provider by tier', () => {
    onlyProvider('mistral');
    expect(mapModelToProvider('claude-opus-4-8')).toBe('mistral-large-latest');           // large
    expect(mapModelToProvider('claude-haiku-4-5-20251001')).toBe('mistral-small-latest');  // small
  });
});

describe('convertToolsForProvider (Claude tool format → OpenAI/Mistral)', () => {
  it('returns tools unchanged for anthropic', () => {
    const tools = [{ type: 'web_search_20250305' }];
    expect(convertToolsForProvider(tools, 'anthropic')).toBe(tools);
  });

  it('drops Claude-only web_search tools for other providers', () => {
    expect(convertToolsForProvider([{ type: 'web_search_20250305' }], 'mistral')).toBeUndefined();
    expect(convertToolsForProvider([{ type: 'web_search' }], 'openai')).toBeUndefined();
  });

  it('converts a function tool to OpenAI/Mistral shape', () => {
    const out = convertToolsForProvider(
      [{ type: 'function', name: 'get_x', description: 'd', input_schema: { type: 'object', properties: {} } }],
      'openai',
    );
    expect(out).toEqual([{ type: 'function', function: { name: 'get_x', description: 'd', parameters: { type: 'object', properties: {} } } }]);
  });

  it('returns undefined for an empty tool list', () => {
    expect(convertToolsForProvider([], 'openai')).toBeUndefined();
  });
});

describe('resolveMistralThinking (Magistral reasoning-model switch)', () => {
  it('leaves the model unchanged without a thinking level', () => {
    expect(resolveMistralThinking('mistral-large-latest')).toEqual({ model: 'mistral-large-latest' });
  });

  it('leaves the model unchanged for sub-reasoning levels (think_hard)', () => {
    expect(resolveMistralThinking('mistral-large-latest', 'think_hard')).toEqual({ model: 'mistral-large-latest' });
  });

  it('switches generalist Mistral to Magistral at investigate+ levels', () => {
    expect(resolveMistralThinking('mistral-large-latest', 'investigate')).toEqual({ model: 'magistral-medium-latest', promptMode: 'reasoning' });
    expect(resolveMistralThinking('mistral-medium-latest', 'plan_first')).toEqual({ model: 'magistral-medium-latest', promptMode: 'reasoning' });
    expect(resolveMistralThinking('mistral-small-latest', 'deep_investigate')).toEqual({ model: 'magistral-small-latest', promptMode: 'reasoning' });
  });

  it('keeps an already-Magistral model but adds reasoning prompt_mode', () => {
    expect(resolveMistralThinking('magistral-medium-latest', 'investigate')).toEqual({ model: 'magistral-medium-latest', promptMode: 'reasoning' });
  });
});

describe('M5 — configured DEFAULT_MODEL overrides env-priority for specialty routes', () => {
  it('routes specialty calls to Mistral when DEFAULT_MODEL=mistral-*, even with an Anthropic key present', () => {
    setEnv({ ANTHROPIC_API_KEY: 'k', MISTRAL_API_KEY: 'k', DEFAULT_MODEL: 'mistral-large-latest' });
    expect(mapModelToProvider('claude-sonnet-4-6')).toBe('mistral-medium-latest'); // medium tier
    expect(resolveModel('large')).toBe('mistral-large-latest');
  });

  it('uses the local model id for every tier when DEFAULT_MODEL=ollama:*', () => {
    setEnv({ ANTHROPIC_API_KEY: 'k', DEFAULT_MODEL: 'ollama:qwen2.5' });
    expect(mapModelToProvider('claude-opus-4-8')).toBe('ollama:qwen2.5');
    expect(resolveModel('small')).toBe('ollama:qwen2.5');
  });

  it('uses the compat model id when DEFAULT_MODEL=compat:<slug>:<model>', () => {
    setEnv({ ANTHROPIC_API_KEY: 'k', DEFAULT_MODEL: 'compat:openrouter:qwen/qwen-2.5-72b' });
    expect(mapModelToProvider('claude-haiku-4-5-20251001')).toBe('compat:openrouter:qwen/qwen-2.5-72b');
  });

  it('leaves Claude behavior unchanged for a claude- DEFAULT_MODEL', () => {
    setEnv({ ANTHROPIC_API_KEY: 'k', MISTRAL_API_KEY: 'k', DEFAULT_MODEL: 'claude-opus-4-8' });
    expect(mapModelToProvider('claude-sonnet-4-6')).toBe('claude-sonnet-4-6');
    expect(resolveModel('large')).toBe('claude-opus-4-8');
  });

  it('falls back to env-priority when DEFAULT_MODELs provider key is missing', () => {
    // DEFAULT_MODEL=mistral but no MISTRAL key → should not pick mistral
    setEnv({ ANTHROPIC_API_KEY: 'k', DEFAULT_MODEL: 'mistral-large-latest' });
    expect(mapModelToProvider('claude-sonnet-4-6')).toBe('claude-sonnet-4-6'); // anthropic passthrough
  });
});
