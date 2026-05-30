import { describe, it, expect } from 'vitest';
import { estimateCost, estimateTokens, formatTokenCount } from '../../server/services/token-estimator';

describe('token-estimator', () => {
  describe('estimateCost (per-million pricing)', () => {
    it('prices Haiku 4.5 at $1/$5 (corrected 2026-05-30, was $0.80/$4)', () => {
      // 1M input + 1M output → 1*1 + 1*5 = $6
      expect(estimateCost(1_000_000, 1_000_000, 'claude-haiku-4-5-20251001')).toBeCloseTo(6, 5);
    });

    it('prices Opus 4.8 at $5/$25', () => {
      expect(estimateCost(1_000_000, 1_000_000, 'claude-opus-4-8')).toBeCloseTo(30, 5);
    });

    it('prices the new Mistral code specialists', () => {
      expect(estimateCost(1_000_000, 0, 'codestral-latest')).toBeCloseTo(0.3, 5);
      expect(estimateCost(0, 1_000_000, 'devstral-medium-latest')).toBeCloseTo(2.0, 5);
    });

    it('falls back to Sonnet pricing ($3/$15) for an unknown model', () => {
      expect(estimateCost(1_000_000, 0, 'who-knows-model')).toBeCloseTo(3, 5);
    });
  });

  describe('estimateTokens', () => {
    it('returns a positive estimate that grows with text length', () => {
      expect(estimateTokens('hello world')).toBeGreaterThan(0);
      expect(estimateTokens('a'.repeat(1000))).toBeGreaterThan(estimateTokens('a'.repeat(100)));
    });
  });

  describe('formatTokenCount', () => {
    it('formats raw / k / M', () => {
      expect(formatTokenCount(500)).toBe('500');
      expect(formatTokenCount(1500)).toBe('1.5k');
      expect(formatTokenCount(2_000_000)).toBe('2.00M');
    });
  });
});
