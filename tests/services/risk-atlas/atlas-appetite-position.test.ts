/**
 * atlas-appetite-position.test.ts — the position a threat path counts at.
 *
 * Owner decision 2026-09-23: a declared appetite more lenient than the band of
 * the residual counts only once a person has approved it (the board accepting
 * a risk above appetite); until then the path counts at its band. The rollup,
 * the Stage 7b statement and the BWRA all use this one function.
 */
import { describe, it, expect } from 'vitest';
import { countedPosition, isMoreLenient } from '../../../server/services/risk-atlas/atlas-appetite-position.js';

describe('countedPosition', () => {
  it('no statement: the band of the residual', () => {
    expect(countedPosition(null, false, 5)).toBe('unacceptable');
    expect(countedPosition(undefined, false, 3)).toBe('boundary');
    expect(countedPosition(null, false, null)).toBeNull();
  });

  it('a lenient declaration counts only once approved', () => {
    expect(countedPosition('within', false, 5)).toBe('unacceptable');
    expect(countedPosition('within', true, 5)).toBe('within');
    expect(countedPosition('outside', false, 5)).toBe('unacceptable');
    expect(countedPosition('outside', true, 5)).toBe('outside');
  });

  it('a declaration as strict as the band, or stricter, counts without approval', () => {
    expect(countedPosition('outside', false, 4)).toBe('outside');
    expect(countedPosition('unacceptable', false, 2)).toBe('unacceptable');
  });

  it('with no residual yet, the declaration is all there is', () => {
    expect(countedPosition('boundary', false, null)).toBe('boundary');
  });
});

describe('isMoreLenient', () => {
  it('compares the declaration with the band of the residual', () => {
    expect(isMoreLenient('within', 3)).toBe(true);
    expect(isMoreLenient('boundary', 3)).toBe(false);
    expect(isMoreLenient('outside', 2)).toBe(false);
    expect(isMoreLenient('within', null)).toBe(false);
    expect(isMoreLenient(null, 5)).toBe(false);
  });
});
