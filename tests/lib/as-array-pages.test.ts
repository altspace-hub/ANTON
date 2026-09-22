/**
 * as-array-pages.test.ts — Work pages survive an error answer.
 *
 * 2026-09-22 Work QA: seven pages stored whatever the API returned and crashed
 * on `.map` / `.filter` / `.reduce` / `.find` when it was `{ error }` (a 429) or
 * `{}` (a missing await). Verified live by forcing every /api call to 429:
 * all seven crashed before, none after.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { asArray } from '../../src/lib/as-array';

describe('asArray', () => {
  it('passes a list through', () => { expect(asArray([1, 2])).toEqual([1, 2]); });
  it('turns an error answer into an empty list', () => { expect(asArray({ error: 'Too many requests' })).toEqual([]); });
  it('turns {} / null / undefined into an empty list', () => {
    expect(asArray({})).toEqual([]);
    expect(asArray(null)).toEqual([]);
    expect(asArray(undefined)).toEqual([]);
  });
});

describe('the pages that crashed now normalise their lists', () => {
  const pages = [
    'src/pages/AnalyticsPage.tsx',
    'src/pages/RadarPage.tsx',
    'src/pages/ApprenticePage.tsx',
    'src/pages/KnowledgeGraphPage.tsx',
    'src/pages/TabularReview.tsx',
    'src/pages/PatternDetectionPage.tsx',
    'src/pages/QualityPage.tsx',
    'src/features/intelligence/GraphAnalyticsPanel.tsx',
  ];
  it.each(pages)('%s uses asArray', (p) => {
    expect(readFileSync(p, 'utf8')).toMatch(/asArray(<[^>]+>)?\(/);
  });
});
