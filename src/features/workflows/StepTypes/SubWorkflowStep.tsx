import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { WorkflowStep } from '@/lib/workflow-definitions';

interface WorkflowOption {
  id: string;
  label: string;
}

interface SubWorkflowStepProps {
  step: WorkflowStep;
  onUpdate: (updates: Partial<WorkflowStep['config']>) => void;
  workflows?: WorkflowOption[];
}

export function SubWorkflowStep({ step, onUpdate, workflows = [] }: SubWorkflowStepProps) {
  const [newInputKey, setNewInputKey] = useState('');
  const [newInputValue, setNewInputValue] = useState('');
  const mapping = step.config.subWorkflowInputMapping ?? {};

  const addMapping = () => {
    if (!newInputKey.trim()) return;
    onUpdate({ subWorkflowInputMapping: { ...mapping, [newInputKey.trim()]: newInputValue } });
    setNewInputKey('');
    setNewInputValue('');
  };

  const removeMapping = (key: string) => {
    const next = { ...mapping };
    delete next[key];
    onUpdate({ subWorkflowInputMapping: next });
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-adv-teal/20 bg-adv-teal-soft p-3">
        <p className="text-xs text-adv-teal">
          Execute another saved workflow as a step in this workflow.
          Map context variables from this workflow to the sub-workflow's input fields.
        </p>
      </div>

      <div>
        <label className="mb-1 block text-[11px] font-medium text-adv-gray">Sub-workflow</label>
        <select
          value={step.config.subWorkflowId || ''}
          onChange={(e) => onUpdate({ subWorkflowId: e.target.value || undefined, subWorkflowInputMapping: {} })}
          className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
        >
          <option value="">— Select workflow —</option>
          {workflows.map((w) => (
            <option key={w.id} value={w.id}>{w.label}</option>
          ))}
          {workflows.length === 0 && (
            <option disabled value="">No saved workflows available</option>
          )}
        </select>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-[11px] font-medium text-adv-gray">Input Parameter Mapping</label>
          <span className="text-xs text-adv-gray">sub-workflow input ← this workflow context</span>
        </div>

        {Object.entries(mapping).map(([key, value]) => (
          <div key={key} className="mb-2 flex items-center gap-2">
            <input
              type="text"
              value={key}
              readOnly
              className="w-32 rounded border border-border bg-adv-dark-2 px-2 py-1 text-[11px] text-adv-off-white font-mono"
            />
            <span className="text-adv-gray text-xs">←</span>
            <input
              type="text"
              value={value}
              onChange={(e) => onUpdate({ subWorkflowInputMapping: { ...mapping, [key]: e.target.value } })}
              placeholder="{{step_1.client_id}}"
              className="flex-1 rounded border border-border bg-adv-dark-2 px-2 py-1 text-[11px] text-adv-off-white font-mono focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            />
            <button onClick={() => removeMapping(key)} className="text-adv-gray hover:text-adv-red transition-colors">
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newInputKey}
            onChange={(e) => setNewInputKey(e.target.value)}
            placeholder="input_field_id"
            className="w-32 rounded border border-border bg-adv-dark-2 px-2 py-1 text-[11px] text-adv-off-white font-mono focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
          />
          <span className="text-adv-gray text-xs">←</span>
          <input
            type="text"
            value={newInputValue}
            onChange={(e) => setNewInputValue(e.target.value)}
            placeholder="{{step_1.client_id}}"
            className="flex-1 rounded border border-border bg-adv-dark-2 px-2 py-1 text-[11px] text-adv-off-white font-mono focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
          />
          <button onClick={addMapping} className="text-adv-teal hover:text-adv-teal-dark transition-colors">
            <Plus className="h-3 w-3" />
          </button>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-[11px] font-medium text-adv-gray">Output Variable Name</label>
        <input
          type="text"
          value={step.config.outputVariable || ''}
          onChange={(e) => onUpdate({ outputVariable: e.target.value })}
          placeholder="sub_workflow_result"
          className="w-48 rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 font-mono"
        />
      </div>
    </div>
  );
}
