/**
 * walkthrough-depth.test.ts — the (model, thinking level) → depth bucket.
 *
 * The one thing worth locking: an sdk:-prefixed id must resolve to the same
 * depth as its bare model. Looked up raw, the subscription engine was an
 * "unknown model" pinned to 'standard' — never 'deep' — so every walkthrough
 * on the product default ran with the 4k phase cap instead of 16k.
 */
import { describe, it, expect } from 'vitest';
import { getWalkthroughDepth } from '../../../server/services/portals/walkthrough-depth.js';

describe('getWalkthroughDepth', () => {
  it('reads the underlying model behind an sdk: prefix', () => {
    for (const level of ['quick', 'think', 'think_hard', 'investigate'] as const) {
      expect(getWalkthroughDepth('sdk:claude-opus-5', level)).toBe(getWalkthroughDepth('claude-opus-5', level));
    }
  });

  it('lets the subscription engine reach the deep bucket', () => {
    expect(getWalkthroughDepth('sdk:claude-opus-5', 'investigate')).toBe('deep');
    expect(getWalkthroughDepth('sdk:claude-opus-5', 'quick')).toBe('simple');
  });

  it('still treats a genuinely unknown id conservatively (negative control)', () => {
    expect(getWalkthroughDepth('sdk:not-a-model', 'investigate')).toBe('standard');
  });
});
