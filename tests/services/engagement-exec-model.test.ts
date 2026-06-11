/**
 * engagement-exec-model.test.ts — Wave 4.4 (Core Experience Review 2026-06).
 *
 * Engagement execution model resolution: per-engagement selector >
 * product default (default-model-store) > legacy thinking-level mapping
 * (quick → Haiku, else Opus). Pure unit — no DB, no LLM.
 */
import { describe, it, expect } from 'vitest';
import { resolveEngagementModelChoice } from '../../server/services/engagement-exec-model.js';

describe('resolveEngagementModelChoice (4.4)', () => {
  it('honours the per-engagement selector above everything else', () => {
    expect(resolveEngagementModelChoice('mistral-large-latest', 'quick', 'claude-sonnet-4-6'))
      .toBe('mistral-large-latest');
    expect(resolveEngagementModelChoice('claude-haiku-4-5-20251001', 'investigate', null))
      .toBe('claude-haiku-4-5-20251001');
  });

  it('trims whitespace and treats empty/whitespace selector as Auto', () => {
    expect(resolveEngagementModelChoice('  gpt-4o  ', 'think', null)).toBe('gpt-4o');
    expect(resolveEngagementModelChoice('   ', 'think_hard', 'claude-sonnet-4-6'))
      .toBe('claude-sonnet-4-6');
  });

  it('falls back to the product default when no selector is stored', () => {
    expect(resolveEngagementModelChoice(null, 'quick', 'mistral-medium-latest'))
      .toBe('mistral-medium-latest');
    expect(resolveEngagementModelChoice(undefined, 'investigate', 'compat:groq:llama-3.3-70b'))
      .toBe('compat:groq:llama-3.3-70b');
  });

  it('preserves the legacy thinking-level mapping when nothing is configured', () => {
    expect(resolveEngagementModelChoice(null, 'quick', null)).toBe('claude-haiku-4-5-20251001');
    expect(resolveEngagementModelChoice(null, 'think_hard', undefined)).toBe('claude-opus-4-8');
    expect(resolveEngagementModelChoice('', 'plan_first', '')).toBe('claude-opus-4-8');
  });
});
