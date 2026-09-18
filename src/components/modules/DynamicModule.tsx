/**
 * DynamicModule.tsx
 * Renders guided input fields from a ModuleConfig.guidedInputs JSON definition.
 * Field types: text, textarea, select, multi-select, chips, boolean, file, number
 *
 * `missingFieldIds` marks the required fields a blocked run is waiting on —
 * the asterisk turns red, the control is outlined and announced as invalid.
 * Which fields those are is decided in src/lib/guided-input-validation.ts;
 * this component only draws the result.
 */

import { ChevronDown } from 'lucide-react';

// ── Types (mirrors server/types/area-config.ts) ──────────────

interface SelectOption { value: string; label: string }

interface GuidedInputField {
  id: string;
  type: 'text' | 'textarea' | 'select' | 'multi-select' | 'chips' | 'boolean' | 'file' | 'number';
  label: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
  options?: SelectOption[];
  defaultValue?: unknown;
}

interface DynamicModuleProps {
  fields: GuidedInputField[];
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
  /** Ids of required fields still unanswered after a blocked run attempt. */
  missingFieldIds?: readonly string[];
}

/** Border for a control that is, or is not, the reason a run was blocked. */
function borderClass(invalid: boolean): string {
  return invalid ? 'border-adv-red/70' : 'border-border';
}

interface FieldRenderProps {
  field: GuidedInputField;
  invalid: boolean;
  describedBy?: string;
}

// ── Field renderers ──────────────────────────────────────────

function TextField({ field, value, onChange, invalid, describedBy }: FieldRenderProps & { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      className={`w-full rounded-lg border ${borderClass(invalid)} bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray-med focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1`}
    />
  );
}

function TextareaField({ field, value, onChange, invalid, describedBy }: FieldRenderProps & { value: string; onChange: (v: string) => void }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder}
      rows={3}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      className={`w-full rounded-lg border ${borderClass(invalid)} bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray-med focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 resize-none`}
    />
  );
}

function SelectField({ field, value, onChange, invalid, describedBy }: FieldRenderProps & { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={`w-full appearance-none rounded-lg border ${borderClass(invalid)} bg-adv-dark px-3 py-2 pr-8 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1`}
      >
        <option value="">Select…</option>
        {field.options?.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-adv-gray" />
    </div>
  );
}

function MultiSelectField({ field, value, onChange, invalid, describedBy }: FieldRenderProps & { value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (opt: string) => {
    onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);
  };
  return (
    <div
      role="group"
      aria-label={field.label}
      aria-describedby={describedBy}
      className={`flex flex-wrap gap-2 ${invalid ? 'rounded-lg border border-adv-red/40 p-2' : ''}`}
    >
      {field.options?.map((opt) => {
        const selected = value.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={selected}
            onClick={() => toggle(opt.value)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              selected
                ? 'border-adv-teal bg-adv-teal-dim text-adv-teal'
                : 'border-border bg-adv-dark text-adv-gray hover:border-adv-gray-med hover:text-adv-off-white'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// chips = single-select styled as chips
function ChipsField({ field, value, onChange, invalid, describedBy }: FieldRenderProps & { value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (opt: string) => {
    onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);
  };
  return (
    <div
      role="group"
      aria-label={field.label}
      aria-describedby={describedBy}
      className={`flex flex-wrap gap-2 ${invalid ? 'rounded-lg border border-adv-red/40 p-2' : ''}`}
    >
      {field.options?.map((opt) => {
        const selected = value.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={selected}
            onClick={() => toggle(opt.value)}
            className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
              selected
                ? 'border-adv-teal bg-adv-teal text-adv-dark'
                : 'border-border bg-adv-dark text-adv-gray hover:border-adv-teal/50 hover:text-adv-off-white'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function BooleanField({ field, value, onChange }: { field: GuidedInputField; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-3">
      <div
        onClick={() => onChange(!value)}
        className={`relative h-5 w-9 rounded-full transition-colors ${value ? 'bg-adv-teal' : 'bg-adv-dark border border-border'}`}
      >
        <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </div>
      <span className="text-sm text-adv-gray">{field.placeholder || (value ? 'Enabled' : 'Disabled')}</span>
    </label>
  );
}

function NumberField({ field, value, onChange, invalid, describedBy }: FieldRenderProps & { value: number | ''; onChange: (v: number | '') => void }) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      placeholder={field.placeholder}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      className={`w-full rounded-lg border ${borderClass(invalid)} bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray-med focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1`}
    />
  );
}

// ── Main component ────────────────────────────────────────────

export default function DynamicModule({ fields, values, onChange, missingFieldIds }: DynamicModuleProps) {
  if (!fields || fields.length === 0) return null;

  const missing = new Set(missingFieldIds ?? []);

  const update = (id: string, value: unknown) => {
    onChange({ ...values, [id]: value });
  };

  return (
    <div className="space-y-4">
      {fields.map((field) => {
        const v = values[field.id];
        const invalid = missing.has(field.id);
        const noteId = invalid ? `guided-${field.id}-required` : undefined;
        const renderProps = { field, invalid, describedBy: noteId };

        return (
          <div key={field.id}>
            <label className="mb-1 flex items-center gap-1 text-xs font-medium text-adv-off-white">
              {field.label}
              {field.required && <span className={invalid ? 'text-adv-red' : 'text-adv-teal'}>*</span>}
            </label>
            {field.description && (
              <p className="mb-1.5 text-xs text-adv-gray">{field.description}</p>
            )}

            {field.type === 'text' && (
              <TextField {...renderProps} value={(v as string) || ''} onChange={(val) => update(field.id, val)} />
            )}
            {field.type === 'textarea' && (
              <TextareaField {...renderProps} value={(v as string) || ''} onChange={(val) => update(field.id, val)} />
            )}
            {field.type === 'select' && (
              <SelectField {...renderProps} value={(v as string) || ''} onChange={(val) => update(field.id, val)} />
            )}
            {field.type === 'multi-select' && (
              <MultiSelectField {...renderProps} value={(v as string[]) || []} onChange={(val) => update(field.id, val)} />
            )}
            {field.type === 'chips' && (
              <ChipsField {...renderProps} value={(v as string[]) || []} onChange={(val) => update(field.id, val)} />
            )}
            {field.type === 'boolean' && (
              <BooleanField field={field} value={(v as boolean) ?? false} onChange={(val) => update(field.id, val)} />
            )}
            {field.type === 'number' && (
              <NumberField {...renderProps} value={(v as number | '') ?? ''} onChange={(val) => update(field.id, val)} />
            )}

            {invalid && (
              <p id={noteId} className="mt-1 text-xs text-adv-red">
                Required to run
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
