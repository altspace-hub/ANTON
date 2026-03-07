import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { WorkflowStep, FieldMapping } from '@/lib/workflow-definitions';

interface TransformStepProps {
  step: WorkflowStep;
  onUpdate: (updates: Partial<WorkflowStep['config']>) => void;
}

const EMPTY_MAPPING: FieldMapping = { sourcePath: '', destinationField: '', expression: '' };

export function TransformStep({ step, onUpdate }: TransformStepProps) {
  const [newMapping, setNewMapping] = useState<FieldMapping>({ ...EMPTY_MAPPING });
  const mappings = step.config.fieldMappings ?? [];

  const addMapping = () => {
    if (!newMapping.sourcePath.trim() || !newMapping.destinationField.trim()) return;
    onUpdate({ fieldMappings: [...mappings, { ...newMapping }] });
    setNewMapping({ ...EMPTY_MAPPING });
  };

  const removeMapping = (idx: number) => {
    onUpdate({ fieldMappings: mappings.filter((_, i) => i !== idx) });
  };

  const updateMapping = (idx: number, updates: Partial<FieldMapping>) => {
    onUpdate({ fieldMappings: mappings.map((m, i) => i === idx ? { ...m, ...updates } : m) });
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-adv-teal/20 bg-adv-teal-soft p-3">
        <p className="text-xs text-adv-teal">
          Map fields from previous step outputs to a new context object.
          Use {'{{step_N.field.path}}'} notation for source paths.
          Optionally add a JS expression to transform the value.
        </p>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-[11px] font-medium text-adv-gray">Field Mappings</label>
          <span className="text-xs text-adv-gray">{mappings.length} mapping{mappings.length !== 1 ? 's' : ''}</span>
        </div>

        {mappings.length > 0 && (
          <div className="mb-3 space-y-2">
            <div className="grid grid-cols-12 gap-1 px-1">
              <span className="col-span-4 text-xs text-adv-gray">Source path</span>
              <span className="col-span-3 text-xs text-adv-gray">Destination field</span>
              <span className="col-span-4 text-xs text-adv-gray">Transform expr (optional)</span>
              <span className="col-span-1" />
            </div>
            {mappings.map((mapping, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-1 items-start">
                <input
                  type="text"
                  value={mapping.sourcePath}
                  onChange={(e) => updateMapping(idx, { sourcePath: e.target.value })}
                  placeholder="{{step_1.customer.id}}"
                  className="col-span-4 rounded border border-border bg-adv-dark-2 px-2 py-1 text-[11px] text-adv-off-white font-mono focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                />
                <input
                  type="text"
                  value={mapping.destinationField}
                  onChange={(e) => updateMapping(idx, { destinationField: e.target.value })}
                  placeholder="customerId"
                  className="col-span-3 rounded border border-border bg-adv-dark-2 px-2 py-1 text-[11px] text-adv-off-white font-mono focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                />
                <input
                  type="text"
                  value={mapping.expression || ''}
                  onChange={(e) => updateMapping(idx, { expression: e.target.value || undefined })}
                  placeholder="value.toUpperCase()"
                  className="col-span-4 rounded border border-border bg-adv-dark-2 px-2 py-1 text-[11px] text-adv-off-white font-mono focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                />
                <button
                  onClick={() => removeMapping(idx)}
                  className="col-span-1 flex items-center justify-center pt-1 text-adv-gray hover:text-adv-red transition-colors"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-lg border border-dashed border-border p-3">
          <p className="mb-2 text-xs text-adv-gray">Add new mapping:</p>
          <div className="grid grid-cols-12 gap-1 items-end">
            <div className="col-span-4">
              <label className="mb-1 block text-xs text-adv-gray">Source path</label>
              <input
                type="text"
                value={newMapping.sourcePath}
                onChange={(e) => setNewMapping((m) => ({ ...m, sourcePath: e.target.value }))}
                placeholder="{{step_1.field}}"
                className="w-full rounded border border-border bg-adv-dark px-2 py-1 text-[11px] text-adv-off-white font-mono focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
              />
            </div>
            <div className="col-span-3">
              <label className="mb-1 block text-xs text-adv-gray">Destination</label>
              <input
                type="text"
                value={newMapping.destinationField}
                onChange={(e) => setNewMapping((m) => ({ ...m, destinationField: e.target.value }))}
                placeholder="fieldName"
                className="w-full rounded border border-border bg-adv-dark px-2 py-1 text-[11px] text-adv-off-white font-mono focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
              />
            </div>
            <div className="col-span-4">
              <label className="mb-1 block text-xs text-adv-gray">Expression (optional)</label>
              <input
                type="text"
                value={newMapping.expression || ''}
                onChange={(e) => setNewMapping((m) => ({ ...m, expression: e.target.value }))}
                placeholder="value * 100"
                className="w-full rounded border border-border bg-adv-dark px-2 py-1 text-[11px] text-adv-off-white font-mono focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
              />
            </div>
            <div className="col-span-1 flex justify-end">
              <button
                onClick={addMapping}
                disabled={!newMapping.sourcePath.trim() || !newMapping.destinationField.trim()}
                className="flex items-center gap-1 rounded bg-adv-teal px-2 py-1 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-40 transition-colors"
              >
                <Plus className="h-3 w-3" />
                Add
              </button>
            </div>
          </div>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-[11px] font-medium text-adv-gray">Output Variable Name</label>
        <input
          type="text"
          value={step.config.outputVariable || ''}
          onChange={(e) => onUpdate({ outputVariable: e.target.value })}
          placeholder="transformed_data"
          className="w-48 rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 font-mono"
        />
      </div>
    </div>
  );
}
