/**
 * civic-eligibility.test.ts — pure-function tests for the rule evaluator.
 *
 * Only `evaluateRule` is tested here (no DB needed). The DB-bound
 * `evaluateForProcess` is exercised end-to-end in integration tests.
 */

import { describe, it, expect } from 'vitest';
import { createCivicEligibility, type EligibilityRule, type ApplicantContext } from '../../../server/services/civic-eligibility.js';

const stubDb = {} as never;

function makeRule(over: Partial<EligibilityRule> & Pick<EligibilityRule, 'condition_kind' | 'condition_value'>): EligibilityRule {
  return {
    id: over.id ?? 'r1',
    rule_code: over.rule_code ?? 'TEST',
    rule_label: over.rule_label ?? 'Test rule',
    severity: over.severity ?? 'mandatory',
    ...over,
  };
}

describe('evaluateRule — age_min', () => {
  it('eligible when age >= min', async () => {
    const svc = await createCivicEligibility(stubDb);
    const r = svc.evaluateRule(makeRule({ condition_kind: 'age_min', condition_value: { value: 18 } }), { age: 20 });
    expect(r.outcome).toBe('eligible');
  });

  it('ineligible when age < min', async () => {
    const svc = await createCivicEligibility(stubDb);
    const r = svc.evaluateRule(makeRule({ condition_kind: 'age_min', condition_value: { value: 18 } }), { age: 17 });
    expect(r.outcome).toBe('ineligible');
  });

  it('requires_evidence when age missing', async () => {
    const svc = await createCivicEligibility(stubDb);
    const r = svc.evaluateRule(makeRule({ condition_kind: 'age_min', condition_value: { value: 18 } }), {});
    expect(r.outcome).toBe('requires_evidence');
  });
});

describe('evaluateRule — residency_months', () => {
  it('eligible when residency meets minimum and jurisdiction matches', async () => {
    const svc = await createCivicEligibility(stubDb);
    const r = svc.evaluateRule(
      makeRule({ condition_kind: 'residency_months', condition_value: { min: 12, jurisdiction: 'SE' } }),
      { residencyMonths: 18, jurisdiction: 'SE' },
    );
    expect(r.outcome).toBe('eligible');
  });

  it('ineligible when jurisdiction mismatches', async () => {
    const svc = await createCivicEligibility(stubDb);
    const r = svc.evaluateRule(
      makeRule({ condition_kind: 'residency_months', condition_value: { min: 12, jurisdiction: 'SE' } }),
      { residencyMonths: 18, jurisdiction: 'NO' },
    );
    expect(r.outcome).toBe('ineligible');
  });

  it('ineligible when residency below minimum', async () => {
    const svc = await createCivicEligibility(stubDb);
    const r = svc.evaluateRule(
      makeRule({ condition_kind: 'residency_months', condition_value: { min: 12, jurisdiction: 'SE' } }),
      { residencyMonths: 6, jurisdiction: 'SE' },
    );
    expect(r.outcome).toBe('ineligible');
  });
});

describe('evaluateRule — income_max', () => {
  it('eligible when income at or below cap', async () => {
    const svc = await createCivicEligibility(stubDb);
    const r = svc.evaluateRule(
      makeRule({ condition_kind: 'income_max', condition_value: { value: 50_000 } }),
      { income: 40_000 },
    );
    expect(r.outcome).toBe('eligible');
  });

  it('indeterminate when threshold is FPL-style string', async () => {
    const svc = await createCivicEligibility(stubDb);
    const r = svc.evaluateRule(
      makeRule({ condition_kind: 'income_max', condition_value: { value: '138_FPL' } }),
      { income: 30_000, householdSize: 4 },
    );
    expect(r.outcome).toBe('indeterminate');
    expect(r.evidence).toContain('FPL');
  });
});

describe('evaluateRule — jurisdiction_in', () => {
  it('eligible when jurisdiction in allowed list', async () => {
    const svc = await createCivicEligibility(stubDb);
    const r = svc.evaluateRule(
      makeRule({ condition_kind: 'jurisdiction_in', condition_value: { values: ['SE', 'NO', 'DK'] } }),
      { jurisdiction: 'SE' },
    );
    expect(r.outcome).toBe('eligible');
  });

  it('ineligible when jurisdiction not in list', async () => {
    const svc = await createCivicEligibility(stubDb);
    const r = svc.evaluateRule(
      makeRule({ condition_kind: 'jurisdiction_in', condition_value: { values: ['SE', 'NO'] } }),
      { jurisdiction: 'US' },
    );
    expect(r.outcome).toBe('ineligible');
  });

  it('requires_evidence when jurisdiction missing', async () => {
    const svc = await createCivicEligibility(stubDb);
    const r = svc.evaluateRule(
      makeRule({ condition_kind: 'jurisdiction_in', condition_value: { values: ['SE'] } }),
      {},
    );
    expect(r.outcome).toBe('requires_evidence');
  });
});

describe('evaluateRule — document_present', () => {
  it('eligible when document present in context', async () => {
    const svc = await createCivicEligibility(stubDb);
    const r = svc.evaluateRule(
      makeRule({ condition_kind: 'document_present', condition_value: { doc_type: 'tax_id' } }),
      { documents: ['tax_id', 'passport'] },
    );
    expect(r.outcome).toBe('eligible');
  });

  it('requires_evidence when missing', async () => {
    const svc = await createCivicEligibility(stubDb);
    const r = svc.evaluateRule(
      makeRule({ condition_kind: 'document_present', condition_value: { doc_type: 'tax_id' } }),
      { documents: ['passport'] },
    );
    expect(r.outcome).toBe('requires_evidence');
  });
});

describe('evaluateRule — status_equals', () => {
  it('eligible when extras field matches expected', async () => {
    const svc = await createCivicEligibility(stubDb);
    const r = svc.evaluateRule(
      makeRule({ condition_kind: 'status_equals', condition_value: { field: 'employment', value: 'employed' } }),
      { extras: { employment: 'employed' } },
    );
    expect(r.outcome).toBe('eligible');
  });

  it('ineligible when extras field differs', async () => {
    const svc = await createCivicEligibility(stubDb);
    const r = svc.evaluateRule(
      makeRule({ condition_kind: 'status_equals', condition_value: { field: 'employment', value: 'employed' } }),
      { extras: { employment: 'unemployed' } },
    );
    expect(r.outcome).toBe('ineligible');
  });
});

describe('evaluateRule — unknown / custom', () => {
  it('indeterminate for custom_predicate (external evaluation)', async () => {
    const svc = await createCivicEligibility(stubDb);
    const r = svc.evaluateRule(
      makeRule({ condition_kind: 'custom_predicate', condition_value: {} }),
      {},
    );
    expect(r.outcome).toBe('indeterminate');
  });

  it('indeterminate for unknown condition_kind', async () => {
    const svc = await createCivicEligibility(stubDb);
    const r = svc.evaluateRule(
      makeRule({ condition_kind: 'wat', condition_value: {} }),
      {},
    );
    expect(r.outcome).toBe('indeterminate');
    expect(r.evidence).toContain('Unknown condition_kind');
  });
});
