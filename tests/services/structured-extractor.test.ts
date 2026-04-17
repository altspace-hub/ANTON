// Unit tests for structured-extractor helpers.
// The LLM-call path is exercised by integration tests elsewhere; these
// cover the pure helpers (validator + safeContentType).

import { describe, it, expect } from 'vitest';
import { validateAgainstSchema, safeContentType } from '../../server/services/structured-extractor.js';
import { loadContentTypeSchema } from '../../server/schemas/content-types/index.js';

describe('validateAgainstSchema', () => {
  it('accepts a minimal gap_analysis body', () => {
    const schema = loadContentTypeSchema('gap_analysis');
    const body = {
      title: 'GDPR Gap',
      items: [{ id: 'A-1', requirement: 'x', score: 'partial' }],
    };
    const result = validateAgainstSchema(body, schema);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects a gap_analysis body missing the required items array', () => {
    const schema = loadContentTypeSchema('gap_analysis');
    const result = validateAgainstSchema({ title: 'x' }, schema);
    expect(result.valid).toBe(false);
    expect(result.errors.join(';')).toMatch(/items/);
  });

  it('rejects a risk_register item missing required id', () => {
    const schema = loadContentTypeSchema('risk_register');
    const body = { title: 'x', items: [{ risk: 'bad thing' }] }; // missing id
    const result = validateAgainstSchema(body, schema);
    expect(result.valid).toBe(false);
    expect(result.errors.join(';')).toMatch(/items\[0\]\.id/);
  });

  it('accepts an analytic_report body (most permissive schema)', () => {
    const schema = loadContentTypeSchema('analytic_report');
    const body = { title: 'Report', sections: [{ heading: 'Intro' }] };
    expect(validateAgainstSchema(body, schema).valid).toBe(true);
  });

  it('loads each of the eight content-type schemas without throwing', () => {
    const types = [
      'gap_analysis', 'risk_register', 'process_map', 'policy_document',
      'analytic_report', 'plan_document', 'entity_register', 'scorecard',
    ] as const;
    for (const t of types) {
      const schema = loadContentTypeSchema(t);
      expect(schema).toBeTruthy();
      expect((schema as { type?: string }).type).toBe('object');
    }
  });
});

describe('safeContentType', () => {
  it('returns the value when it is a known content type', () => {
    expect(safeContentType('gap_analysis')).toBe('gap_analysis');
    expect(safeContentType('scorecard')).toBe('scorecard');
  });

  it('falls back to analytic_report on unknown or wrong-shape input', () => {
    expect(safeContentType('weird_type')).toBe('analytic_report');
    expect(safeContentType(null)).toBe('analytic_report');
    expect(safeContentType(undefined)).toBe('analytic_report');
    expect(safeContentType(42)).toBe('analytic_report');
  });
});
