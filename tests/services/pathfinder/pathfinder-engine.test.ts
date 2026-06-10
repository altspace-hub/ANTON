/**
 * pathfinder-engine.test.ts — public-export tests for the Pathfinder engine.
 *
 * The full search dispatch needs an API key + network; we cover the
 * deterministic public surface here (getAvailableSearchModels +
 * getActiveSearchProvider) and its responsiveness to provider configuration.
 */

import { describe, it, expect } from 'vitest';
import { getAvailableSearchModels, getActiveSearchProvider } from '../../../server/services/pathfinder-engine.js';

// Provider resolution reads these env vars — pin them per test so results
// don't depend on whatever keys the local .env happens to contain.
const ENV_KEYS = [
  'ANTHROPIC_API_KEY',
  'MISTRAL_API_KEY',
  'OPENAI_API_KEY',
  'GOOGLE_API_KEY',
  'DEFAULT_MODEL',
  'BING_SEARCH_API_KEY',
] as const;

function withEnv(overrides: Partial<Record<(typeof ENV_KEYS)[number], string>>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  try {
    for (const k of ENV_KEYS) delete process.env[k];
    for (const [k, v] of Object.entries(overrides)) process.env[k] = v;
    fn();
  } finally {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

describe('getAvailableSearchModels', () => {
  it('returns the canonical 3-model council on Claude installs', () => {
    withEnv({ ANTHROPIC_API_KEY: 'sk-ant-test' }, () => {
      const models = getAvailableSearchModels();
      expect(models).toHaveLength(3);
      expect(models.every(m => m.provider === 'anthropic')).toBe(true);
    });
  });

  it('includes a Web Search role', () => {
    withEnv({ ANTHROPIC_API_KEY: 'sk-ant-test' }, () => {
      const models = getAvailableSearchModels();
      expect(models.find(m => m.role === 'Web Search')).toBeDefined();
    });
  });

  it('includes a Chairman Synthesis role', () => {
    withEnv({ ANTHROPIC_API_KEY: 'sk-ant-test' }, () => {
      const models = getAvailableSearchModels();
      expect(models.find(m => m.role === 'Chairman Synthesis')).toBeDefined();
    });
  });

  it('includes an Analysis role for Quick/Thorough', () => {
    withEnv({ ANTHROPIC_API_KEY: 'sk-ant-test' }, () => {
      const models = getAvailableSearchModels();
      expect(models.find(m => m.role.includes('Analysis'))).toBeDefined();
    });
  });

  it('availability mirrors ANTHROPIC_API_KEY on Claude-only installs', () => {
    // Key set → all available
    withEnv({ ANTHROPIC_API_KEY: 'sk-ant-test' }, () => {
      expect(getAvailableSearchModels().every(m => m.available)).toBe(true);
    });
    // No provider keys at all → anthropic fallback, all unavailable
    withEnv({}, () => {
      expect(getAvailableSearchModels().every(m => m.available === false)).toBe(true);
    });
  });

  it('every model carries a non-empty modelId', () => {
    withEnv({ ANTHROPIC_API_KEY: 'sk-ant-test' }, () => {
      for (const m of getAvailableSearchModels()) {
        expect(m.modelId).toBeTruthy();
        expect(typeof m.modelId).toBe('string');
      }
    });
  });

  it('reports the real configured provider on non-Claude installs (2E.2)', () => {
    withEnv({ MISTRAL_API_KEY: 'mk-test' }, () => {
      const models = getAvailableSearchModels();
      expect(models).toHaveLength(3);
      const webSearch = models.find(m => m.role === 'Web Search');
      expect(webSearch?.provider).toBe('bing');
      expect(webSearch?.available).toBe(false); // no BING_SEARCH_API_KEY
      expect(models.filter(m => m.role !== 'Web Search').every(m => m.provider === 'mistral')).toBe(true);
      expect(models.filter(m => m.role !== 'Web Search').every(m => m.available)).toBe(true);
    });
  });

  it('marks Bing web search available when BING_SEARCH_API_KEY is set', () => {
    withEnv({ MISTRAL_API_KEY: 'mk-test', BING_SEARCH_API_KEY: 'bing-test' }, () => {
      const webSearch = getAvailableSearchModels().find(m => m.role === 'Web Search');
      expect(webSearch?.available).toBe(true);
    });
  });
});

describe('getActiveSearchProvider', () => {
  it('resolves anthropic when an Anthropic key is configured', () => {
    withEnv({ ANTHROPIC_API_KEY: 'sk-ant-test' }, () => {
      expect(getActiveSearchProvider()).toBe('anthropic');
    });
  });

  it('resolves the configured non-Claude provider', () => {
    withEnv({ MISTRAL_API_KEY: 'mk-test' }, () => {
      expect(getActiveSearchProvider()).toBe('mistral');
    });
  });
});
