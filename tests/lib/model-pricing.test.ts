/**
 * model-pricing.test.ts — frontend pricing single-source (roadmap Phase 4).
 *
 * getModelPricing derives from the MODELS catalogue so StatusIndicator (and any
 * other client cost display) can't drift from it. Guards the bug where Sonnet 4.6
 * was missing from StatusIndicator's hand-maintained map and showed Opus pricing.
 */
import { describe, it, expect } from 'vitest';
import { getModelPricing, MODELS } from '../../src/lib/constants';

describe('getModelPricing (frontend pricing single-source)', () => {
  it('returns the MODELS-catalogue pricing for a known model', () => {
    const m = MODELS.find((x) => x.id === 'claude-sonnet-4-6')!;
    expect(getModelPricing('claude-sonnet-4-6')).toEqual({ input: m.inputCostPer1M, output: m.outputCostPer1M });
  });

  it('prices Sonnet 4.6 at $3/$15 (not Opus pricing — the StatusIndicator drift bug)', () => {
    expect(getModelPricing('claude-sonnet-4-6')).toEqual({ input: 3, output: 15 });
  });

  it('prices Opus 4.8 at $5/$25', () => {
    expect(getModelPricing('claude-opus-4-8')).toEqual({ input: 5, output: 25 });
  });

  it('falls back to Opus 4.8 pricing for an unknown id', () => {
    expect(getModelPricing('totally-unknown')).toEqual({ input: 5, output: 25 });
  });
});
