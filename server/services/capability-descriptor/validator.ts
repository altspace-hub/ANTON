/**
 * validator.ts — ajv-based validator for capability descriptors.
 *
 * Compiles the descriptor schema (Draft 2020-12) once at module load.
 * Exposes:
 *   - validateDescriptor(d): { valid, errors }
 *   - validateCapabilityInputAgainstBaseline(verb, declared)
 *   - validateAgainstSchema(schema, instance) — generic helper
 *
 * Per Cap Schema §4.8: portals SHOULD extend the baseline schemas; baseline
 * fields MUST keep their declared types. The validator surfaces baseline
 * violations as warnings (not failures) so portals can ship richer schemas
 * while staying compatible with visitor agents.
 */

import Ajv2020, { type ErrorObject } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { DESCRIPTOR_SCHEMA, type CapabilityVerb } from './schema.js';
import { getVerbBaseline } from './verbs/index.js';

// ── Singleton ajv instance ─────────────────────────────────────────────────

const ajv = new Ajv2020({
  strict: false, // descriptor uses some keywords ajv-strict rejects unnecessarily
  allErrors: true,
  $data: false,
});
addFormats.default(ajv);

const compiledDescriptor = ajv.compile(DESCRIPTOR_SCHEMA);

// ── Validation result types ────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: Array<{ path: string; message: string; keyword?: string }>;
}

export interface ValidationWithWarnings extends ValidationResult {
  warnings: Array<{ path: string; message: string }>;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Validate a complete capability descriptor against the v1.0.0 schema.
 * Returns errors AND baseline warnings (per-capability inputSchema/outputSchema
 * baseline-field violations are warnings, not errors, per §4.8 SHOULD wording).
 */
export function validateDescriptor(descriptor: unknown): ValidationWithWarnings {
  const valid = compiledDescriptor(descriptor) as boolean;
  const errors = formatErrors(compiledDescriptor.errors);

  const warnings: Array<{ path: string; message: string }> = [];
  if (valid && descriptor && typeof descriptor === 'object') {
    const d = descriptor as { capabilities?: Array<Record<string, unknown>> };
    if (Array.isArray(d.capabilities)) {
      for (const [i, cap] of d.capabilities.entries()) {
        warnings.push(...checkBaselineCompliance(`/capabilities/${i}`, cap));
      }
    }
  }

  return { valid, errors, warnings };
}

/**
 * Validate that a capability's declared inputSchema includes all baseline fields
 * with compatible types. Returns warnings only (baseline is SHOULD per §4.8).
 */
export function validateCapabilityInputAgainstBaseline(
  verb: CapabilityVerb,
  declaredInputSchema: Record<string, unknown> | undefined,
): ValidationResult {
  if (!declaredInputSchema) return { valid: true, errors: [] };
  const baseline = getVerbBaseline(verb).inputSchema as { properties?: Record<string, unknown>; required?: string[] };
  return diffSchema('input', baseline, declaredInputSchema as { properties?: Record<string, unknown>; required?: string[] });
}

/** Generic ajv compile-and-validate for ad-hoc schemas (e.g. capability inputs at invoke time). */
export function validateAgainstSchema(schema: Record<string, unknown>, instance: unknown): ValidationResult {
  try {
    const compiled = ajv.compile(schema);
    const valid = compiled(instance) as boolean;
    return { valid, errors: formatErrors(compiled.errors) };
  } catch (e) {
    return {
      valid: false,
      errors: [{ path: '/', message: e instanceof Error ? e.message : String(e), keyword: 'compile_error' }],
    };
  }
}

// ── Internals ──────────────────────────────────────────────────────────────

function formatErrors(errors: ErrorObject[] | null | undefined): ValidationResult['errors'] {
  if (!errors) return [];
  return errors.map((e) => ({
    path: e.instancePath || '/',
    message: e.message ?? 'validation error',
    keyword: e.keyword,
  }));
}

function checkBaselineCompliance(
  path: string,
  capability: Record<string, unknown>,
): Array<{ path: string; message: string }> {
  const verb = capability.verb as CapabilityVerb | undefined;
  if (!verb || verb === 'custom') return [];

  const warnings: Array<{ path: string; message: string }> = [];
  const declaredInput = capability.inputSchema as { properties?: Record<string, unknown>; required?: string[] } | undefined;
  if (declaredInput) {
    const r = validateCapabilityInputAgainstBaseline(verb, declaredInput);
    for (const err of r.errors) {
      warnings.push({ path: `${path}/inputSchema${err.path}`, message: err.message });
    }
  }
  return warnings;
}

/** Compare baseline schema vs declared schema. Reports baseline fields that are missing or have wrong types. */
function diffSchema(
  kind: 'input' | 'output',
  baseline: { properties?: Record<string, unknown>; required?: string[] },
  declared: { properties?: Record<string, unknown>; required?: string[] },
): ValidationResult {
  const errors: ValidationResult['errors'] = [];
  const baselineProps = baseline.properties ?? {};
  const declaredProps = declared.properties ?? {};

  for (const [field, baselineSpec] of Object.entries(baselineProps)) {
    const declaredSpec = declaredProps[field];
    if (!declaredSpec) {
      errors.push({
        path: `/${field}`,
        message: `baseline ${kind} field '${field}' missing from declared schema`,
        keyword: 'baseline_missing',
      });
      continue;
    }
    // Type compatibility check.
    const bt = (baselineSpec as { type?: string }).type;
    const dt = (declaredSpec as { type?: string }).type;
    if (bt && dt && bt !== dt) {
      errors.push({
        path: `/${field}`,
        message: `baseline ${kind} field '${field}' is type '${bt}' but declared as '${dt}'`,
        keyword: 'baseline_type_mismatch',
      });
    }
  }

  // Baseline-required fields must remain required (or at least present).
  const baselineRequired = baseline.required ?? [];
  const declaredRequired = declared.required ?? [];
  for (const req of baselineRequired) {
    if (!declaredRequired.includes(req) && !(req in declaredProps)) {
      errors.push({
        path: `/${req}`,
        message: `baseline-required field '${req}' is no longer required nor declared`,
        keyword: 'baseline_required_missing',
      });
    }
  }

  return { valid: errors.length === 0, errors };
}
