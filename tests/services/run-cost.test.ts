/**
 * run-cost.test.ts — Finding #1
 * (run-pipeline adversarial review 2026-06).
 *
 * Free/unknown-provider runs must NOT be billed phantom Opus pricing ($15/$75 per
 * 1M) into the ENFORCED monthly cap (SUM(messages.cost)) + analytics:
 *   - ollama: local models are free → cost 0
 *   - azure:/compat:/other unknowns → cost NULL (excluded by SUM)
 *   - known models → real cache-adjusted cost (unchanged)
 *
 * Pure unit — no DB, no LLM.
 */
import { describe, it, expect } from 'vitest';
import { computeRunCostUsd } from '../../server/services/run-cost.js';

describe('computeRunCostUsd (#1 — honest unknown-provider cost)', () => {
  it('ollama (free, no registry pricing) → 0, NOT phantom Opus dollars', () => {
    const cost = computeRunCostUsd({
      hasKnownPricing: false,
      isOllama: true,
      costPer1MInput: 0,
      costPer1MOutput: 0,
      inputTokens: 100_000,
      outputTokens: 50_000,
    });
    expect(cost).toBe(0);
  });

  it('compat:/azure: (unknown pricing, not ollama) → NULL (excluded from the cap)', () => {
    const compat = computeRunCostUsd({
      hasKnownPricing: false,
      isOllama: false,
      costPer1MInput: 0,
      costPer1MOutput: 0,
      inputTokens: 100_000,
      outputTokens: 50_000,
    });
    expect(compat).toBeNull();
  });

  it('does NOT bill the old $15/$75 Opus default for an unknown provider', () => {
    // Pre-#1 this exact call wrote (100000*15 + 50000*75)/1e6 = $5.25 of phantom cost.
    const cost = computeRunCostUsd({
      hasKnownPricing: false,
      isOllama: false,
      costPer1MInput: 0,
      costPer1MOutput: 0,
      inputTokens: 100_000,
      outputTokens: 50_000,
    });
    expect(cost).not.toBe(5.25);
    expect(cost).toBeNull();
  });

  it('known model → real cost from its registry pricing', () => {
    // Opus 4.8: $15 in / $75 out per 1M. 10k in + 2k out = (10000*15 + 2000*75)/1e6.
    const cost = computeRunCostUsd({
      hasKnownPricing: true,
      isOllama: false,
      costPer1MInput: 15,
      costPer1MOutput: 75,
      inputTokens: 10_000,
      outputTokens: 2_000,
    });
    expect(cost).toBeCloseTo((10_000 * 15 + 2_000 * 75) / 1_000_000, 9);
  });

  it('known model → cache reads bill at 10%, cache writes at 125% of input rate', () => {
    // 12k input total = 2k billable + 5k cache-read + 5k cache-write; 1k output.
    const cost = computeRunCostUsd({
      hasKnownPricing: true,
      isOllama: false,
      costPer1MInput: 15,
      costPer1MOutput: 75,
      inputTokens: 12_000,
      outputTokens: 1_000,
      cacheReadTokens: 5_000,
      cacheCreationTokens: 5_000,
    });
    const expected = (
      2_000 * 15 +
      5_000 * (15 * 0.10) +
      5_000 * (15 * 1.25) +
      1_000 * 75
    ) / 1_000_000;
    expect(cost).toBeCloseTo(expected, 9);
  });
});
