/**
 * utility-model.test.ts — where the ~40 Haiku-class utility calls (extraction,
 * scoring, naming, titles) actually go.
 *
 * The Settings default is a bare Haiku id, routed through mapModelToProvider.
 * Under an sdk: instance default that used to resolve to the metered API key;
 * now it lands on the engine — and on Sonnet 5, not the Opus default, so plan
 * usage is not spent promoting a 500-token JSON scoring call to Opus.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  routeUtilityModel,
  isValidUtilityModelId,
  DEFAULT_UTILITY_MODEL,
} from '../../server/services/utility-model.js';

const ENV_KEYS = ['ANTHROPIC_API_KEY', 'MISTRAL_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY', 'DEFAULT_MODEL'] as const;
let saved: Record<string, string | undefined>;

function setEnv(keys: Partial<Record<(typeof ENV_KEYS)[number], string>>): void {
  for (const k of ENV_KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(keys)) process.env[k] = v;
}

beforeEach(() => { saved = {}; for (const k of ENV_KEYS) saved[k] = process.env[k]; });
afterEach(() => { for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

describe('routeUtilityModel', () => {
  it('keeps the default Haiku choice on the API when the API is the configured provider', () => {
    setEnv({ ANTHROPIC_API_KEY: 'k' });
    expect(routeUtilityModel(DEFAULT_UTILITY_MODEL)).toBe(DEFAULT_UTILITY_MODEL);
  });

  it('lands the default Haiku choice on Sonnet 5 via the engine under an sdk: default — not the metered key, not Opus', () => {
    setEnv({ ANTHROPIC_API_KEY: 'k', DEFAULT_MODEL: 'sdk:claude-opus-5' });
    expect(routeUtilityModel(DEFAULT_UTILITY_MODEL)).toBe('sdk:claude-sonnet-5');
  });

  it('passes an explicit engine or provider choice through untouched', () => {
    setEnv({ ANTHROPIC_API_KEY: 'k', DEFAULT_MODEL: 'sdk:claude-opus-5' });
    expect(routeUtilityModel('sdk:claude-sonnet-5')).toBe('sdk:claude-sonnet-5');
    expect(routeUtilityModel('mistral-small-latest')).toBe('mistral-small-latest');
  });
});

describe('isValidUtilityModelId', () => {
  it('accepts engine-prefixed ids so Settings can persist them', () => {
    expect(isValidUtilityModelId('sdk:claude-sonnet-5')).toBe(true);
    expect(isValidUtilityModelId('codex:gpt-5.4')).toBe(true);
    expect(isValidUtilityModelId('mistral-small-latest')).toBe(true);
    expect(isValidUtilityModelId('claude-bananas')).toBe(false);
  });
});
