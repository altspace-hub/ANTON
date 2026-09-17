/**
 * token-estimator-chunking.test.ts — Wave 2 (2026-09-16): estimateTokens must
 * stay linear on adversarial input.
 *
 * tiktoken's BPE is quadratic on one long run with no word boundaries: a
 * 200k-char run of a single character took ~30 s and blocked the event loop.
 * Any website fetched as an online reference can hand such text in. The
 * estimator now encodes in 8k-char pieces; prose estimates differ by at most a
 * token or two per seam.
 */
import { describe, it, expect } from 'vitest';
import { estimateTokens } from '../../server/services/token-estimator.js';

describe('estimateTokens — bounded work on pathological input', () => {
  it('a 200k-char single-character run is estimated in well under a second', () => {
    const text = 'a'.repeat(200_000);
    const t0 = performance.now();
    const n = estimateTokens(text);
    const ms = performance.now() - t0;
    expect(n).toBeGreaterThan(0);
    expect(ms).toBeLessThan(1_000);
  });

  it('prose estimates are consistent across the chunk boundary', () => {
    const sentence = 'The obliged entity shall apply customer due diligence measures when establishing a business relationship. ';
    const short = sentence.repeat(20);           // well under one chunk
    const long = sentence.repeat(400);           // several chunks
    const perShort = estimateTokens(short) / short.length;
    const perLong = estimateTokens(long) / long.length;
    // Same tokens-per-character density within 2% — the seams cost at most a token each.
    expect(Math.abs(perShort - perLong) / perShort).toBeLessThan(0.02);
  });

  it('is monotonic in length', () => {
    const a = estimateTokens('short text');
    const b = estimateTokens('short text '.repeat(1_000));
    const c = estimateTokens('short text '.repeat(10_000));
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });
});
