import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { WorkflowStep } from '@/lib/workflow-definitions';

interface Script {
  id: string;
  label: string;
  parameters?: Array<{ name: string; description: string }>;
}

interface ScriptStepProps {
  step: WorkflowStep;
  onUpdate: (updates: Partial<WorkflowStep['config']>) => void;
  scripts?: Script[];
}

export function ScriptStep({ step, onUpdate, scripts = [] }: ScriptStepProps) {
  const [newParamKey, setNewParamKey] = useState('');
  const [newParamValue, setNewParamValue] = useState('');

  const selectedScript = scripts.find((s) => s.id === step.config.scriptId);
  const paramMapping = step.config.parameterMapping ?? {};

  const addMapping = () => {
    if (!newParamKey.trim()) return;
    onUpdate({ parameterMapping: { ...paramMapping, [newParamKey.trim()]: newParamValue } });
    setNewParamKey('');
    setNewParamValue('');
  };

  const removeMapping = (key: string) => {
    const next = { ...paramMapping };
    delete next[key];
    onUpdate({ parameterMapping: next });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-md border border-adv-blue/30 bg-adv-blue/10 px-3 py-1.5">
        <span className="text-[10px] font-medium text-adv-blue">Connection required: Script Library</span>
      </div>

      <div>
        <label className="mb-1 block text-[11px] font-medium text-adv-gray">Script</label>
        <select
          value={step.config.scriptId || ''}
          onChange={(e) => onUpdate({ scriptId: e.target.value || undefined, parameterMapping: {} })}
          className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none"
        >
          <option value="">— Select script —</option>
          {scripts.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
          {scripts.length === 0 && (
            <option disabled value="">No approved scripts available</option>
          )}
        </select>
      </div>

      {selectedScript?.parameters && selectedScript.parameters.length > 0 && (
        <div className="rounded-lg border border-border bg-adv-dark/50 p-3">
          <p className="mb-2 text-[10px] text-adv-gray-med">Script parameters:</p>
          {selectedScript.parameters.map((p) => (
            <div key={p.name} className="mb-1 text-[10px] text-adv-gray">
              <span className="font-mono text-adv-teal">{p.name}</span> — {p.description}
            </div>
          ))}
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-[11px] font-medium text-adv-gray">Parameter Mapping</label>
        </div>
        {Object.entries(paramMapping).map(([key, value]) => (
          <div key={key} className="mb-2 flex items-center gap-2">
            <input
              type="text"
              value={key}
              readOnly
              className="w-32 rounded border border-border bg-adv-dark-2 px-2 py-1 text-[11px] text-adv-off-white font-mono"
            />
            <span className="text-adv-gray-med text-xs">→</span>
            <input
              type="text"
              value={value}
              onChange={(e) => onUpdate({ parameterMapping: { ...paramMapping, [key]: e.target.value } })}
              placeholder="{{step_1.field}}"
              className="flex-1 rounded border border-border bg-adv-dark-2 px-2 py-1 text-[11px] text-adv-off-white font-mono focus:border-adv-teal focus:outline-none"
            />
            <button onClick={() => removeMapping(key)} className="text-adv-gray-med hover:text-adv-red transition-colors">
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newParamKey}
            onChange={(e) => setNewParamKey(e.target.value)}
            placeholder="param_name"
            className="w-32 rounded border border-border bg-adv-dark-2 px-2 py-1 text-[11px] text-adv-off-white font-mono focus:border-adv-teal focus:outline-none"
          />
          <span className="text-adv-gray-med text-xs">→</span>
          <input
            type="text"
            value={newParamValue}
            onChange={(e) => setNewParamValue(e.target.value)}
            placeholder="{{step_1.customer_id}}"
            className="flex-1 rounded border border-border bg-adv-dark-2 px-2 py-1 text-[11px] text-adv-off-white font-mono focus:border-adv-teal focus:outline-none"
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
          placeholder="script_result"
          className="w-48 rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none font-mono"
        />
      </div>
    </div>
  );
}
