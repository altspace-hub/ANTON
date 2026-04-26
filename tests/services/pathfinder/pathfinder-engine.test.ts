/**
 * pathfinder-engine.test.ts — public-export tests for the Pathfinder engine.
 *
 * The full search dispatch needs an Anthropic API key + network; we cover
 * the deterministic public surface here (getAvailableSearchModels) and
 * its responsiveness to env-var availability.
 */

import { describe, it, expect } from 'vitest';
import { getAvailableSearchModels } from '../../../server/services/pathfinder-engine.js';

describe('getAvailableSearchModels', () => {
  it('returns the canonical 3-model council', () => {
    const models = getAvailableSearchModels();
    expect(models).toHaveLength(3);
    expect(models.every(m => m.provider === 'anthropic')).toBe(true);
  });

  it('includes a Web Search role', () => {
    const models = getAvailableSearchModels();
    expect(models.find(m => m.role === 'Web Search')).toBeDefined();
  });

  it('includes a Chairman Synthesis role', () => {
    const models = getAvailableSearchModels();
    expect(models.find(m => m.role === 'Chairman Synthesis')).toBeDefined();
  });

  it('includes an Analysis role for Quick/Thorough', () => {
    const models = getAvailableSearchModels();
    expect(models.find(m => m.role.includes('Analysis'))).toBeDefined();
  });

  it('availability mirrors ANTHROPIC_API_KEY env var', () => {
    const original = process.env.ANTHROPIC_API_KEY;
    try {
      // Simulate "key set"
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
      const withKey = getAvailableSearchModels();
      expect(withKey.every(m => m.available)).toBe(true);

      // Simulate "key missing"
      delete process.env.ANTHROPIC_API_KEY;
      const withoutKey = getAvailableSearchModels();
      expect(withoutKey.every(m => m.available === false)).toBe(true);
    } finally {
      // Restore original
      if (original === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = original;
    }
  });

  it('every model carries a non-empty modelId', () => {
    const models = getAvailableSearchModels();
    for (const m of models) {
      expect(m.modelId).toBeTruthy();
      expect(typeof m.modelId).toBe('string');
    }
  });
});
