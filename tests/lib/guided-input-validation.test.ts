/**
 * guided-input-validation.test.ts — Wave 0 track C (2026-09-17).
 *
 * `required: true` on a guided input is now enforced at the run instead of
 * drawing an asterisk. Everything the gate decides is in one pure function, so
 * the contract lives here rather than inside a React component.
 *
 * The two cases that matter most are the false negatives: `false` on a toggle
 * and `0` on a number are deliberate answers. A validator that calls them
 * blanks blocks a correctly filled form, and the fix people reach for is
 * turning validation off. Both are asserted directly.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  findMissingRequiredInputs,
  isGuidedFieldAnswerable,
  isGuidedValueMissing,
  guidedFieldLabel,
  RENDERABLE_GUIDED_INPUT_TYPES,
  type GuidedInputFieldLike,
} from '../../src/lib/guided-input-validation';

const field = (over: Partial<GuidedInputFieldLike> & { id: string; type: string }): GuidedInputFieldLike => ({
  label: over.id,
  required: true,
  ...over,
});

const choice = (id: string, type: string): GuidedInputFieldLike =>
  field({ id, type, options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] });

describe('findMissingRequiredInputs — when a run is blocked', () => {
  it('returns nothing when the module has no guided inputs at all (open-chat style runs)', () => {
    expect(findMissingRequiredInputs([], {})).toEqual([]);
    expect(findMissingRequiredInputs(undefined, {})).toEqual([]);
    expect(findMissingRequiredInputs(null, { anything: 'x' })).toEqual([]);
  });

  it('returns nothing when every required field is answered', () => {
    const fields = [
      field({ id: 'entity_type', type: 'select', options: [{ value: 'casp', label: 'CASP' }] }),
      field({ id: 'contract_text', type: 'textarea' }),
      choice('domains', 'multi-select'),
      field({ id: 'threshold', type: 'number' }),
      field({ id: 'include_annex', type: 'boolean' }),
    ];
    const values = {
      entity_type: 'casp',
      contract_text: 'Clause 4.2 …',
      domains: ['a'],
      threshold: 25,
      include_annex: true,
    };
    expect(findMissingRequiredInputs(fields, values)).toEqual([]);
  });

  it('blocks on an unanswered required text field and names it by label, not id', () => {
    const fields = [field({ id: 'jurisdiction_code', type: 'text', label: 'Jurisdiction' })];
    expect(findMissingRequiredInputs(fields, {})).toEqual([{ id: 'jurisdiction_code', label: 'Jurisdiction' }]);
    expect(findMissingRequiredInputs(fields, { jurisdiction_code: '' })).toHaveLength(1);
    expect(findMissingRequiredInputs(fields, { jurisdiction_code: '   ' })).toHaveLength(1);
    expect(findMissingRequiredInputs(fields, { jurisdiction_code: 'SE' })).toEqual([]);
  });

  it('does NOT block on `false` for a required boolean — that is the answer "no"', () => {
    const fields = [field({ id: 'is_pep', type: 'boolean', label: 'Customer is a PEP' })];
    expect(findMissingRequiredInputs(fields, { is_pep: false })).toEqual([]);
    expect(findMissingRequiredInputs(fields, { is_pep: true })).toEqual([]);
    // The toggle renders `(v as boolean) ?? false`, so an untouched toggle
    // already shows a definite state — there is nothing for the user to fix.
    expect(findMissingRequiredInputs(fields, {})).toEqual([]);
  });

  it('does NOT block on `0` for a required number — zero is a value', () => {
    const fields = [field({ id: 'prior_findings', type: 'number', label: 'Prior findings' })];
    expect(findMissingRequiredInputs(fields, { prior_findings: 0 })).toEqual([]);
    expect(findMissingRequiredInputs(fields, { prior_findings: -3 })).toEqual([]);
    // The number renderer stores '' while the box is empty.
    expect(findMissingRequiredInputs(fields, { prior_findings: '' })).toEqual([
      { id: 'prior_findings', label: 'Prior findings' },
    ]);
    expect(findMissingRequiredInputs(fields, {})).toHaveLength(1);
    expect(findMissingRequiredInputs(fields, { prior_findings: Number.NaN })).toHaveLength(1);
  });

  it('blocks on an empty array for a required multi-select, and clears once one option is picked', () => {
    const fields = [field({ id: 'fcp_domains', type: 'multi-select', label: 'FCP domains', options: [{ value: 'aml', label: 'AML/CFT' }] })];
    expect(findMissingRequiredInputs(fields, { fcp_domains: [] })).toEqual([
      { id: 'fcp_domains', label: 'FCP domains' },
    ]);
    // An array of blanks is still nothing chosen.
    expect(findMissingRequiredInputs(fields, { fcp_domains: ['', '  '] })).toHaveLength(1);
    expect(findMissingRequiredInputs(fields, { fcp_domains: ['aml'] })).toEqual([]);
  });

  it('does NOT block on a required field whose type the renderer cannot draw, and reports it instead', () => {
    // The 30 catalogue fields that declared `multiselect` / `toggle` were
    // fixed in a parallel track, but a custom module can still ship one: an
    // unrenderable field has no control, so it can never be filled.
    const onUnanswerable = vi.fn();
    const fields = [
      field({ id: 'sectors', type: 'multiselect', label: 'Sectors' }),
      field({ id: 'notify', type: 'toggle', label: 'Notify' }),
      field({ id: 'evidence', type: 'file', label: 'Evidence' }),
      field({ id: 'summary', type: 'textarea', label: 'Summary' }),
    ];
    expect(findMissingRequiredInputs(fields, {}, onUnanswerable)).toEqual([
      { id: 'summary', label: 'Summary' },
    ]);
    expect(onUnanswerable).toHaveBeenCalledTimes(3);
    expect(onUnanswerable.mock.calls.map((c) => (c[0] as GuidedInputFieldLike).id)).toEqual([
      'sectors', 'notify', 'evidence',
    ]);
  });

  it('does NOT block on a choice field shipped without options — there is nothing to pick', () => {
    const onUnanswerable = vi.fn();
    const fields = [
      field({ id: 'framework', type: 'select', label: 'Framework', options: [] }),
      field({ id: 'tags', type: 'chips', label: 'Tags' }),
    ];
    expect(findMissingRequiredInputs(fields, {}, onUnanswerable)).toEqual([]);
    expect(onUnanswerable).toHaveBeenCalledTimes(2);
  });

  it('ignores fields that are not marked required', () => {
    const fields = [
      field({ id: 'optional_note', type: 'textarea', required: false }),
      field({ id: 'undeclared', type: 'text', required: undefined }),
      choice('needed', 'select'),
    ];
    expect(findMissingRequiredInputs(fields, {})).toEqual([{ id: 'needed', label: 'needed' }]);
  });

  it('keeps field order, reports each field once, and survives malformed entries', () => {
    const fields = [
      field({ id: 'a', type: 'text', label: 'Alpha' }),
      field({ id: 'a', type: 'text', label: 'Alpha again' }),
      field({ id: '', type: 'text', label: 'No id' }),
      field({ id: 'b', type: 'text', label: 'Beta' }),
    ];
    expect(findMissingRequiredInputs(fields, {})).toEqual([
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Beta' },
    ]);
  });

  it('falls back to the id when a field shipped without a usable label', () => {
    expect(guidedFieldLabel({ id: 'entity_type', type: 'text' })).toBe('entity_type');
    expect(guidedFieldLabel({ id: 'entity_type', type: 'text', label: '   ' })).toBe('entity_type');
    expect(guidedFieldLabel({ id: 'entity_type', type: 'text', label: ' Entity type ' })).toBe('Entity type');
  });

  it('reads values from the live map, so filling a field clears exactly that entry', () => {
    const fields = [
      field({ id: 'entity_type', type: 'select', label: 'Entity type', options: [{ value: 'casp', label: 'CASP' }] }),
      field({ id: 'jurisdiction', type: 'text', label: 'Jurisdiction' }),
    ];
    expect(findMissingRequiredInputs(fields, {})).toHaveLength(2);
    expect(findMissingRequiredInputs(fields, { entity_type: 'casp' })).toEqual([
      { id: 'jurisdiction', label: 'Jurisdiction' },
    ]);
  });
});

describe('isGuidedValueMissing — the per-type rule', () => {
  it('treats undefined and null as missing for every type except boolean', () => {
    for (const type of RENDERABLE_GUIDED_INPUT_TYPES) {
      const f = { id: 'x', type };
      const expected = type !== 'boolean';
      expect(isGuidedValueMissing(f, undefined)).toBe(expected);
      expect(isGuidedValueMissing(f, null)).toBe(expected);
    }
  });

  it('accepts a numeric string in a number field but rejects one that is not a number', () => {
    const f = { id: 'n', type: 'number' };
    expect(isGuidedValueMissing(f, '0')).toBe(false);
    expect(isGuidedValueMissing(f, '12.5')).toBe(false);
    expect(isGuidedValueMissing(f, 'twelve')).toBe(true);
  });

  it('treats any concrete non-empty value as an answer', () => {
    expect(isGuidedValueMissing({ id: 'x', type: 'text' }, 'value')).toBe(false);
    expect(isGuidedValueMissing({ id: 'x', type: 'select' }, false)).toBe(false);
    expect(isGuidedValueMissing({ id: 'x', type: 'chips' }, ['a'])).toBe(false);
    expect(isGuidedValueMissing({ id: 'x', type: 'text' }, { nested: true })).toBe(false);
  });
});

describe('isGuidedFieldAnswerable — what DynamicModule can actually draw', () => {
  it('accepts exactly the renderer branches', () => {
    expect(isGuidedFieldAnswerable({ id: 'x', type: 'text' })).toBe(true);
    expect(isGuidedFieldAnswerable({ id: 'x', type: 'textarea' })).toBe(true);
    expect(isGuidedFieldAnswerable({ id: 'x', type: 'boolean' })).toBe(true);
    expect(isGuidedFieldAnswerable({ id: 'x', type: 'number' })).toBe(true);
    expect(isGuidedFieldAnswerable(choice('x', 'select'))).toBe(true);
    expect(isGuidedFieldAnswerable(choice('x', 'multi-select'))).toBe(true);
    expect(isGuidedFieldAnswerable(choice('x', 'chips'))).toBe(true);
  });

  it('rejects types with no branch, including the `file` type the union still declares', () => {
    expect(isGuidedFieldAnswerable({ id: 'x', type: 'file' })).toBe(false);
    expect(isGuidedFieldAnswerable({ id: 'x', type: 'multiselect' })).toBe(false);
    expect(isGuidedFieldAnswerable({ id: 'x', type: 'toggle' })).toBe(false);
    expect(isGuidedFieldAnswerable({ id: 'x', type: 'date' })).toBe(false);
  });
});
