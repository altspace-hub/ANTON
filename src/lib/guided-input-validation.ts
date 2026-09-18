/**
 * guided-input-validation.ts — the one place that decides whether a guided
 * input a module marked `required` has actually been answered.
 *
 * Wave 0 track C. `required: true` on a guided input used to draw a teal
 * asterisk and nothing else: 1,192 of the 2,414 fields across the catalogue
 * carried it, and a run with none of them filled went to the model anyway,
 * which then invented the frame it was never given — inside a deliverable
 * that ships a provenance appendix describing what it was based on.
 *
 * The rules that matter, and why they are here rather than inside the
 * component:
 *
 *  - "Missing" is type-aware. `false` on a boolean and `0` on a number are
 *    answers, not blanks. A validator that treats them as blanks is the bug
 *    that makes people turn validation off, so it is tested directly.
 *  - A field the renderer cannot draw cannot be filled, so it never blocks.
 *    `DynamicModule` has branches for exactly RENDERABLE_GUIDED_INPUT_TYPES;
 *    30 fields in the catalogue still declare `multiselect` / `toggle` (no
 *    branch) and 23 of those are required. Blocking on them would make those
 *    modules unrunnable. Same for a choice field shipped without options —
 *    there is nothing to pick.
 *  - The caller gets labels, not ids: the message names the field the way the
 *    form does.
 */

/** The shape this module needs — structurally satisfied by the store's
 *  `GuidedInputField` and by `DynamicModule`'s local field interface. */
export interface GuidedInputFieldLike {
  id: string;
  type: string;
  label?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
}

/** Field types `src/components/modules/DynamicModule.tsx` actually draws a
 *  control for. Keep in step with that component's render branches. */
export const RENDERABLE_GUIDED_INPUT_TYPES: readonly string[] = [
  'text',
  'textarea',
  'select',
  'multi-select',
  'chips',
  'boolean',
  'number',
];

/** Types whose only way to answer is picking from `options`. */
const OPTION_DRIVEN_TYPES: readonly string[] = ['select', 'multi-select', 'chips'];

/** What the message calls the field. Falls back to the id so a field that
 *  shipped without a label still names itself instead of showing a blank. */
export function guidedFieldLabel(field: GuidedInputFieldLike): string {
  const label = typeof field.label === 'string' ? field.label.trim() : '';
  return label || field.id;
}

/**
 * Can the user answer this field at all? False for a type the renderer has no
 * branch for, and for a choice field with nothing to choose from. Such a field
 * is never allowed to block a run.
 */
export function isGuidedFieldAnswerable(field: GuidedInputFieldLike): boolean {
  if (!field || typeof field.type !== 'string') return false;
  if (!RENDERABLE_GUIDED_INPUT_TYPES.includes(field.type)) return false;
  if (OPTION_DRIVEN_TYPES.includes(field.type)) {
    return Array.isArray(field.options) && field.options.length > 0;
  }
  return true;
}

function isBlankString(value: unknown): boolean {
  return typeof value === 'string' && value.trim() === '';
}

/**
 * Is this value an unanswered required field?
 *
 * Per type:
 *  - `boolean` — never missing. The toggle always renders a definite state
 *    (`(v as boolean) ?? false`), so there is no "unanswered" for the user to
 *    see and nothing they could do about being told there is. `false` is the
 *    answer "no".
 *  - `number` — `0` is an answer. Missing is undefined / null / empty string /
 *    a value that is not a finite number (the renderer stores `''` for empty).
 *  - arrays (`multi-select`, `chips`) — missing when empty, or when every
 *    entry is blank.
 *  - strings — missing when empty or whitespace only.
 */
export function isGuidedValueMissing(field: GuidedInputFieldLike, value: unknown): boolean {
  if (field.type === 'boolean') return false;
  if (value === undefined || value === null) return true;
  if (typeof value === 'boolean') return false;
  if (typeof value === 'number') return !Number.isFinite(value);
  if (typeof value === 'string') {
    if (value.trim() === '') return true;
    return field.type === 'number' ? !Number.isFinite(Number(value)) : false;
  }
  if (Array.isArray(value)) {
    return value.every((entry) => entry === undefined || entry === null || isBlankString(entry));
  }
  // Any other concrete value (an object a custom field stored, say) is an answer.
  return false;
}

/** A required field the run cannot proceed without, named as the form names it. */
export interface MissingGuidedInput {
  id: string;
  label: string;
}

/**
 * The required guided inputs that are still unanswered, in field order.
 *
 * Returns an empty array when the module has no guided inputs at all — an
 * open-chat style run is never blocked by this.
 *
 * @param onUnanswerableField called for each required field the renderer
 *   cannot draw (or that has no options to pick). The field is skipped either
 *   way; the callback exists so the caller can warn in dev without this
 *   module reaching for `console`.
 */
export function findMissingRequiredInputs(
  fields: readonly GuidedInputFieldLike[] | null | undefined,
  values: Record<string, unknown> | null | undefined,
  onUnanswerableField?: (field: GuidedInputFieldLike) => void,
): MissingGuidedInput[] {
  if (!Array.isArray(fields) || fields.length === 0) return [];

  const missing: MissingGuidedInput[] = [];
  const seen = new Set<string>();

  for (const field of fields) {
    if (!field || typeof field.id !== 'string' || !field.id) continue;
    if (field.required !== true) continue;
    if (!isGuidedFieldAnswerable(field)) {
      onUnanswerableField?.(field);
      continue;
    }
    if (seen.has(field.id)) continue;
    if (isGuidedValueMissing(field, values ? values[field.id] : undefined)) {
      seen.add(field.id);
      missing.push({ id: field.id, label: guidedFieldLabel(field) });
    }
  }

  return missing;
}
