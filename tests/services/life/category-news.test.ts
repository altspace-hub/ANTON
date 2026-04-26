/**
 * category-news.test.ts — pure-function unit test for News diversity score.
 */

import { describe, it, expect } from 'vitest';
import { computeSourceDiversity } from '../../../server/services/category-news.js';

describe('computeSourceDiversity', () => {
  it('returns 0 for empty input', () => {
    expect(computeSourceDiversity([])).toBe(0);
  });

  it('returns 14 (1/7 buckets) for a single source', () => {
    expect(computeSourceDiversity(['center'])).toBe(14);
  });

  it('returns 100 when all 7 bias buckets are represented', () => {
    expect(computeSourceDiversity([
      'far_left', 'left', 'center_left', 'center', 'center_right', 'right', 'far_right',
    ])).toBe(100);
  });

  it('caps at 100 when more than 7 distinct strings appear', () => {
    expect(computeSourceDiversity([
      'far_left', 'left', 'center_left', 'center', 'center_right', 'right', 'far_right', 'unknown', 'other',
    ])).toBe(100);
  });

  it('counts duplicates only once', () => {
    expect(computeSourceDiversity(['center', 'center', 'center'])).toBe(14);
  });

  it('ignores empty strings', () => {
    expect(computeSourceDiversity(['', 'center', ''])).toBe(14);
  });

  it('echo chamber (3 left-leaning) scores below mixed coverage', () => {
    const echo  = computeSourceDiversity(['far_left', 'left', 'center_left']);
    const mixed = computeSourceDiversity(['left', 'center', 'right']);
    expect(echo).toBeLessThanOrEqual(mixed);
  });
});
