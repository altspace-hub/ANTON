/**
 * civic-eligibility.ts — declarative eligibility-rule evaluator for the Civic pillar.
 *
 * Reads `civic_eligibility_rules` (mig 170), evaluates each rule against an
 * applicant context, persists a `civic_eligibility_results` row.
 *
 * Built per Phase B.1 — Civic pillar build-out.
 */

import { randomUUID } from 'crypto';
import type { DatabaseAdapter } from '../db/database.js';

export interface ApplicantContext {
  /** ISO 3166-1 alpha-2. */
  jurisdiction?: string;
  /** Years of age. */
  age?: number;
  /** Months of residency in the relevant jurisdiction. */
  residencyMonths?: number;
  /** Annual gross income (assumed in local currency). */
  income?: number;
  /** Household size (relevant for some benefits rules). */
  householdSize?: number;
  /** Documents the applicant has on hand (set of doc-type ids). */
  documents?: string[];
  /** Free-form additional context. */
  extras?: Record<string, unknown>;
}

export type EligibilityOutcome = 'eligible' | 'ineligible' | 'indeterminate' | 'requires_evidence';

export interface EligibilityRule {
  id: string;
  rule_code: string;
  rule_label: string;
  condition_kind: string;
  condition_value: Record<string, unknown>;
  severity: 'mandatory' | 'recommended' | 'informational';
}

export interface EligibilityResult {
  ruleId: string;
  ruleCode: string;
  outcome: EligibilityOutcome;
  evidence: string;
}

export async function createCivicEligibility(db: DatabaseAdapter) {

  /** Evaluate one rule against an applicant context. Pure function — no DB writes. */
  function evaluateRule(rule: EligibilityRule, ctx: ApplicantContext): EligibilityResult {
    const v = rule.condition_value;
    const ok = (msg: string): EligibilityResult => ({ ruleId: rule.id, ruleCode: rule.rule_code, outcome: 'eligible', evidence: msg });
    const no = (msg: string): EligibilityResult => ({ ruleId: rule.id, ruleCode: rule.rule_code, outcome: 'ineligible', evidence: msg });
    const ind = (msg: string): EligibilityResult => ({ ruleId: rule.id, ruleCode: rule.rule_code, outcome: 'indeterminate', evidence: msg });
    const need = (msg: string): EligibilityResult => ({ ruleId: rule.id, ruleCode: rule.rule_code, outcome: 'requires_evidence', evidence: msg });

    switch (rule.condition_kind) {
      case 'age_min': {
        const min = Number(v.value ?? v.min);
        if (ctx.age == null) return need(`Age required (≥ ${min})`);
        return ctx.age >= min ? ok(`Age ${ctx.age} ≥ ${min}`) : no(`Age ${ctx.age} below ${min}`);
      }
      case 'age_max': {
        const max = Number(v.value ?? v.max);
        if (ctx.age == null) return need(`Age required (≤ ${max})`);
        return ctx.age <= max ? ok(`Age ${ctx.age} ≤ ${max}`) : no(`Age ${ctx.age} above ${max}`);
      }
      case 'residency_months': {
        const min = Number(v.min ?? v.value);
        const reqJur = v.jurisdiction as string | undefined;
        if (ctx.residencyMonths == null) return need(`Residency duration required (≥ ${min} months${reqJur ? ` in ${reqJur}` : ''})`);
        if (reqJur && ctx.jurisdiction !== reqJur) return no(`Residency required in ${reqJur}; reported jurisdiction ${ctx.jurisdiction}`);
        return ctx.residencyMonths >= min ? ok(`${ctx.residencyMonths} months ≥ ${min}`) : no(`${ctx.residencyMonths} months below ${min}`);
      }
      case 'income_max': {
        if (ctx.income == null) return need(`Income required for income_max rule`);
        // FPL-style values are not numerically resolvable here; mark indeterminate so a downstream service can resolve
        if (typeof v.value === 'string') return ind(`Income threshold "${v.value}" requires external resolution (FPL table, household size: ${ctx.householdSize ?? '?'})`);
        const cap = Number(v.value);
        return ctx.income <= cap ? ok(`Income ${ctx.income} ≤ ${cap}`) : no(`Income ${ctx.income} above ${cap}`);
      }
      case 'income_min': {
        if (ctx.income == null) return need(`Income required for income_min rule`);
        const min = Number(v.value);
        return ctx.income >= min ? ok(`Income ${ctx.income} ≥ ${min}`) : no(`Income ${ctx.income} below ${min}`);
      }
      case 'jurisdiction_in': {
        const allowed = v.values as string[] | undefined;
        if (!allowed?.length) return ind('jurisdiction_in rule has empty allowed list');
        if (!ctx.jurisdiction) return need(`Jurisdiction required (allowed: ${allowed.join(', ')})`);
        return allowed.includes(ctx.jurisdiction) ? ok(`Jurisdiction ${ctx.jurisdiction} permitted`) : no(`Jurisdiction ${ctx.jurisdiction} not in allowed list`);
      }
      case 'document_present': {
        const required = v.doc_type as string | undefined;
        if (!required) return ind('document_present rule missing doc_type');
        return ctx.documents?.includes(required) ? ok(`Document ${required} present`) : need(`Required document ${required} missing`);
      }
      case 'status_equals': {
        const field = v.field as string | undefined;
        const expected = v.value;
        if (!field) return ind('status_equals rule missing field');
        const actual = (ctx.extras ?? {})[field];
        return actual === expected ? ok(`${field} = ${String(expected)}`) : no(`${field} = ${String(actual)} (expected ${String(expected)})`);
      }
      case 'custom_predicate': {
        // Custom predicates are evaluated externally — mark indeterminate with a note.
        return ind(`Custom predicate ${rule.rule_code} requires external evaluation`);
      }
      default:
        return ind(`Unknown condition_kind: ${rule.condition_kind}`);
    }
  }

  /**
   * Run all active rules for a process (or all rules in a pack) against an
   * applicant context, persist each result, return a summary.
   */
  async function evaluateForProcess(processId: string, engagementId: string | null, ctx: ApplicantContext) {
    const rules = await db.all<EligibilityRule>(
      `SELECT id, rule_code, rule_label, condition_kind, condition_value, severity
         FROM civic_eligibility_rules
         WHERE process_id = ? AND is_active = TRUE`,
      processId,
    );

    const results: EligibilityResult[] = rules.map(r => evaluateRule(r, ctx));

    // Persist each result.
    for (const result of results) {
      await db.run(
        `INSERT INTO civic_eligibility_results
           (id, engagement_id, rule_id, applicant_context, outcome, evidence)
         VALUES (?, ?, ?, ?::jsonb, ?, ?)`,
        randomUUID(), engagementId, result.ruleId, JSON.stringify(ctx), result.outcome, result.evidence,
      );
    }

    const summary = {
      eligible: results.filter(r => r.outcome === 'eligible').length,
      ineligible: results.filter(r => r.outcome === 'ineligible').length,
      indeterminate: results.filter(r => r.outcome === 'indeterminate').length,
      requires_evidence: results.filter(r => r.outcome === 'requires_evidence').length,
      total: results.length,
    };

    // Overall verdict: any mandatory ineligibility blocks; otherwise eligible if all mandatory pass.
    const mandatoryIneligible = results.filter(r => r.outcome === 'ineligible' && rules.find(rl => rl.id === r.ruleId)?.severity === 'mandatory');
    const verdict: EligibilityOutcome =
      mandatoryIneligible.length > 0 ? 'ineligible' :
      summary.requires_evidence > 0 ? 'requires_evidence' :
      summary.indeterminate > 0 ? 'indeterminate' :
      'eligible';

    return { verdict, summary, results };
  }

  return {
    evaluateRule,
    evaluateForProcess,
  };
}

export type CivicEligibility = Awaited<ReturnType<typeof createCivicEligibility>>;
