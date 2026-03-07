import type { WorkflowStep, WorkflowStepType, LoopChildStep } from '@/lib/workflow-definitions';
import { Plus, Trash2 } from 'lucide-react';

interface LoopStepProps {
  step: WorkflowStep;
  onUpdate: (updates: Partial<WorkflowStep['config']>) => void;
}

const LOOP_STEP_TYPES: Array<{ value: WorkflowStepType; label: string }> = [
  { value: 'claude', label: 'Claude Analysis' },
  { value: 'api_call', label: 'API Call' },
  { value: 'database_query', label: 'Database Query' },
  { value: 'email_send', label: 'Email Send' },
  { value: 'notification', label: 'Notification' },
  { value: 'transform', label: 'Transform' },
];

export function LoopStep({ step, onUpdate }: LoopStepProps) {
  const loopSteps = step.config.loopSteps ?? [];

  const addLoopStep = () => {
    const newStep: LoopChildStep = {
      id: `loop-step-${Date.now()}`,
      label: 'Loop Step',
      type: 'claude',
      config: {},
    };
    onUpdate({ loopSteps: [...loopSteps, newStep] });
  };

  const removeLoopStep = (idx: number) => {
    onUpdate({ loopSteps: loopSteps.filter((_, i) => i !== idx) });
  };

  const updateLoopStep = (idx: number, updates: Partial<LoopChildStep>) => {
    onUpdate({ loopSteps: loopSteps.map((s, i) => i === idx ? { ...s, ...updates } : s) });
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-adv-gold/30 bg-adv-gold/10 p-3">
        <p className="text-xs font-medium text-adv-gold">Loop Step</p>
        <p className="mt-0.5 text-xs text-adv-gray">
          Executes child steps for each item in a list. Use {'{{item}}'} inside child step configs to reference the current item.
          Use {'{{item.field}}'} for specific fields on list items.
        </p>
      </div>

      <div>
        <label className="mb-1 block text-[11px] font-medium text-adv-gray">
          Input List Path
          <span className="ml-1 text-adv-gray font-normal">Step output path containing an array</span>
        </label>
        <input
          type="text"
          value={step.config.inputListPath || ''}
          onChange={(e) => onUpdate({ inputListPath: e.target.value })}
          placeholder="{{step_2.transactions}}"
          className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 font-mono"
        />
      </div>

      <div>
        <label className="mb-1 block text-[11px] font-medium text-adv-gray">Max Iterations</label>
        <input
          type="number"
          min={1}
          max={1000}
          value={step.config.maxIterations ?? 100}
          onChange={(e) => onUpdate({ maxIterations: parseInt(e.target.value, 10) || 100 })}
          className="w-32 rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
        />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-[11px] font-medium text-adv-gray">Steps to repeat for each item</label>
          <button
            onClick={addLoopStep}
            className="text-xs text-adv-teal hover:text-adv-teal-dark transition-colors flex items-center gap-1"
          >
            <Plus className="h-3 w-3" /> Add step
          </button>
        </div>

        {loopSteps.length === 0 && (
          <div className="rounded-lg border border-dashed border-border py-4 text-center">
            <p className="text-[11px] text-adv-gray">No loop steps defined. Add a step to execute per item.</p>
          </div>
        )}

        <div className="space-y-2">
          {loopSteps.map((ls, idx) => (
            <div key={ls.id} className="flex items-center gap-2 rounded-lg border border-border bg-adv-dark p-2">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-adv-teal/10 text-xs font-bold text-adv-teal">
                {idx + 1}
              </div>
              <input
                type="text"
                value={ls.label}
                onChange={(e) => updateLoopStep(idx, { label: e.target.value })}
                placeholder="Step label"
                className="flex-1 rounded border border-border bg-adv-dark-2 px-2 py-1 text-[11px] text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
              />
              <select
                value={ls.type}
                onChange={(e) => updateLoopStep(idx, { type: e.target.value as WorkflowStepType })}
                className="rounded border border-border bg-adv-dark-2 px-2 py-1 text-[11px] text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
              >
                {LOOP_STEP_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <button onClick={() => removeLoopStep(idx)} className="text-adv-gray hover:text-adv-red transition-colors">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
