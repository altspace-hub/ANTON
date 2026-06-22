/**
 * look-alike.test.ts — the pin-time impersonation guard. Pure, no I/O.
 */
import { describe, it, expect } from 'vitest';
import { levenshtein, checkPinLookAlike } from '../../../server/services/trusted-stores/look-alike.js';
import { computeSkeleton } from '../../../server/services/registry-protocol/homoglyph.js';

const pin = (portalAddress: string) => ({ portalAddress, nameSkeleton: computeSkeleton(portalAddress) });

describe('levenshtein', () => {
  it('known distances', () => {
    expect(levenshtein('mybakery', 'mybakery')).toBe(0);
    expect(levenshtein('mybakery', 'mybakerry')).toBe(1);   // insertion
    expect(levenshtein('mybakery', 'mybakary')).toBe(1);    // substitution
    expect(levenshtein('mybakery', 'mybkery')).toBe(1);     // deletion
    expect(levenshtein('', 'abc')).toBe(3);
  });
});

describe('checkPinLookAlike', () => {
  it('returns nothing for a clearly distinct name', () => {
    const existing = [pin('mybakery.futurechain.portal')];
    expect(checkPinLookAlike('sportsdirect.global.portal', existing)).toEqual([]);
  });

  it('flags a homoglyph skeleton-collision (Cyrillic look-alike)', () => {
    const existing = [pin('apple.global.portal')];
    // Cyrillic 'а' (U+0430) in place of Latin 'a' — same skeleton, different string.
    const warnings = checkPinLookAlike('аpple.global.portal', existing);
    expect(warnings.some((w) => w.kind === 'skeleton-collision')).toBe(true);
  });

  it('flags a mixed-script candidate', () => {
    const warnings = checkPinLookAlike('gоogle.global.portal', []); // Cyrillic о
    expect(warnings.some((w) => w.kind === 'mixed-script')).toBe(true);
  });

  it('flags a near-miss typo-squat (edit distance 1-3)', () => {
    const existing = [pin('mybakery.futurechain.portal')];
    const warnings = checkPinLookAlike('mybakerry.futurechain.portal', existing);
    const ed = warnings.find((w) => w.kind === 'edit-distance');
    expect(ed).toBeTruthy();
    expect(ed!.editDistance).toBe(1);
    expect(ed!.against).toBe('mybakery.futurechain.portal');
  });

  it('does NOT flag the identical address (that is the same store, handled upstream)', () => {
    const existing = [pin('mybakery.futurechain.portal')];
    expect(checkPinLookAlike('mybakery.futurechain.portal', existing)).toEqual([]);
  });
});
