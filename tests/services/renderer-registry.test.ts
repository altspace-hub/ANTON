// Unit tests for the dotted-path requires_fields evaluator.
// This gate is the filter that hides renderers when the structured
// payload doesn't carry the data they need.

import { describe, it, expect } from 'vitest';
import { evaluateRequiresField } from '../../server/services/renderer-registry.types.js';

describe('evaluateRequiresField', () => {
  it('returns true for a simple key that exists and is truthy', () => {
    expect(evaluateRequiresField({ items: [1, 2, 3] }, 'items')).toBe(true);
  });

  it('returns false for a key that is missing', () => {
    expect(evaluateRequiresField({ other: 'x' }, 'items')).toBe(false);
  });

  it('returns false for null / empty string / empty array', () => {
    expect(evaluateRequiresField({ title: null },  'title')).toBe(false);
    expect(evaluateRequiresField({ title: '' },    'title')).toBe(false);
    expect(evaluateRequiresField({ items: [] },    'items')).toBe(false);
  });

  it('walks dotted paths', () => {
    const body = { scoring_scheme: { dimensions: ['compliance'] } };
    expect(evaluateRequiresField(body, 'scoring_scheme.dimensions')).toBe(true);
    expect(evaluateRequiresField(body, 'scoring_scheme.missing')).toBe(false);
  });

  it('[*] enforces every element has the child path', () => {
    const ok = { items: [{ likelihood: 3 }, { likelihood: 2 }] };
    const bad = { items: [{ likelihood: 3 }, { impact: 2 }] };
    expect(evaluateRequiresField(ok,  'items[*].likelihood')).toBe(true);
    expect(evaluateRequiresField(bad, 'items[*].likelihood')).toBe(false);
  });

  it('[*] with empty array returns false (renderer should be hidden)', () => {
    expect(evaluateRequiresField({ items: [] }, 'items[*].likelihood')).toBe(false);
  });

  it('handles missing intermediate objects without throwing', () => {
    expect(evaluateRequiresField({}, 'a.b.c[*].d')).toBe(false);
    expect(evaluateRequiresField(null, 'a')).toBe(false);
  });

  it('zero and false are treated as truthy (values exist)', () => {
    expect(evaluateRequiresField({ count: 0 },     'count')).toBe(true);
    expect(evaluateRequiresField({ flag: false },  'flag')).toBe(true);
  });
});
