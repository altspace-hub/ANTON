import type { WorkflowStep } from '@/lib/workflow-definitions';

interface WaitStepProps {
  step: WorkflowStep;
  onUpdate: (updates: Partial<WorkflowStep['config']>) => void;
}

type WaitMode = 'duration' | 'condition';

export function WaitStep({ step, onUpdate }: WaitStepProps) {
  const mode: WaitMode = step.config.waitCondition ? 'condition' : 'duration';

  const setMode = (newMode: WaitMode) => {
    if (newMode === 'duration') {
      onUpdate({ waitCondition: undefined, waitSeconds: step.config.waitSeconds ?? 60 });
    } else {
      onUpdate({ waitCondition: '', waitSeconds: undefined });
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-2 block text-[11px] font-medium text-adv-gray">Wait Mode</label>
        <div className="flex gap-2">
          <button
            onClick={() => setMode('duration')}
            className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${
              mode === 'duration'
                ? 'bg-adv-teal text-adv-dark font-medium'
                : 'border border-border text-adv-gray hover:text-adv-off-white'
            }`}
          >
            Fixed Duration
          </button>
          <button
            onClick={() => setMode('condition')}
            className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${
              mode === 'condition'
                ? 'bg-adv-teal text-adv-dark font-medium'
                : 'border border-border text-adv-gray hover:text-adv-off-white'
            }`}
          >
            Wait for Condition
          </button>
        </div>
      </div>

      {mode === 'duration' && (
        <div>
          <label className="mb-1 block text-[11px] font-medium text-adv-gray">
            Duration (seconds)
          </label>
          <input
            type="number"
            min={1}
            max={86400}
            value={step.config.waitSeconds ?? 60}
            onChange={(e) => onUpdate({ waitSeconds: parseInt(e.target.value, 10) || 60 })}
            className="w-32 rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
          />
          {(step.config.waitSeconds ?? 60) >= 60 && (
            <p className="mt-1 text-xs text-adv-gray">
              = {Math.round((step.config.waitSeconds ?? 60) / 60)} minute{Math.round((step.config.waitSeconds ?? 60) / 60) !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      )}

      {mode === 'condition' && (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-adv-gray">
              Condition Expression
              <span className="ml-1 text-adv-gray font-normal">Polling checks this every 10 seconds</span>
            </label>
            <input
              type="text"
              value={step.config.waitCondition || ''}
              onChange={(e) => onUpdate({ waitCondition: e.target.value })}
              placeholder="{{step_2.status}} == 'completed'"
              className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 font-mono"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-adv-gray">
              Max Wait Time (seconds)
              <span className="ml-1 text-adv-gray font-normal">Abort if condition not met within this time</span>
            </label>
            <input
              type="number"
              min={10}
              max={86400}
              value={step.config.maxWaitSeconds ?? 300}
              onChange={(e) => onUpdate({ maxWaitSeconds: parseInt(e.target.value, 10) || 300 })}
              className="w-32 rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            />
          </div>
        </div>
      )}
    </div>
  );
}
