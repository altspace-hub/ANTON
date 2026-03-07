import type { WorkflowStep, DecisionCondition } from '@/lib/workflow-definitions';

interface DecisionStepProps {
  step: WorkflowStep;
  onUpdate: (updates: Partial<WorkflowStep['config']>) => void;
  allSteps?: Array<{ id: string; label: string }>;
  currentStepIndex?: number;
}

const OPERATORS: Array<{ value: DecisionCondition['operator']; label: string }> = [
  { value: '==', label: '== (equals)' },
  { value: '!=', label: '!= (not equals)' },
  { value: '>', label: '> (greater than)' },
  { value: '<', label: '< (less than)' },
  { value: '>=', label: '>= (greater or equal)' },
  { value: '<=', label: '<= (less or equal)' },
  { value: 'contains', label: 'contains' },
  { value: 'exists', label: 'exists (non-null)' },
];

export function DecisionStep({ step, onUpdate, allSteps = [], currentStepIndex = 0 }: DecisionStepProps) {
  const condition = step.config.decisionCondition ?? {
    leftOperand: '',
    operator: '==' as const,
    rightOperand: '',
  };

  const updateCondition = (updates: Partial<DecisionCondition>) => {
    onUpdate({ decisionCondition: { ...condition, ...updates } });
  };

  // Only show steps AFTER this one as skip targets
  const futureSteps = allSteps.slice(currentStepIndex + 1);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-adv-gold/30 bg-adv-gold/10 p-3">
        <p className="text-xs font-medium text-adv-gold">Decision Gate</p>
        <p className="mt-0.5 text-xs text-adv-gray">
          If the condition is TRUE, execution continues to the next step.
          If FALSE, execution skips to the step you specify below (or ends the workflow).
        </p>
      </div>

      <div>
        <label className="mb-2 block text-[11px] font-medium text-adv-gray">Condition</label>
        <div className="space-y-2">
          <div>
            <label className="mb-1 block text-xs text-adv-gray">Left operand</label>
            <input
              type="text"
              value={condition.leftOperand}
              onChange={(e) => updateCondition({ leftOperand: e.target.value })}
              placeholder="{{step_3.risk_score}}"
              className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 font-mono"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-adv-gray">Operator</label>
            <select
              value={condition.operator}
              onChange={(e) => updateCondition({ operator: e.target.value as DecisionCondition['operator'] })}
              className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            >
              {OPERATORS.map((op) => (
                <option key={op.value} value={op.value}>{op.label}</option>
              ))}
            </select>
          </div>
          {condition.operator !== 'exists' && (
            <div>
              <label className="mb-1 block text-xs text-adv-gray">Right operand (literal or {'{{variable}}'})</label>
              <input
                type="text"
                value={condition.rightOperand}
                onChange={(e) => updateCondition({ rightOperand: e.target.value })}
                placeholder='8 or "high" or {{step_2.threshold}}'
                className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 font-mono"
              />
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-adv-dark/50 p-3">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-adv-green" />
          <div>
            <p className="text-xs font-medium text-adv-gray">If TRUE</p>
            <p className="text-xs text-adv-off-white">Continue to next step</p>
          </div>
        </div>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="h-2 w-2 rounded-full bg-adv-red" />
            <p className="text-xs font-medium text-adv-gray">If FALSE — skip to:</p>
          </div>
          <select
            value={step.config.onFalseSkipToStepId || ''}
            onChange={(e) => onUpdate({ onFalseSkipToStepId: e.target.value || undefined })}
            className="w-full rounded border border-border bg-adv-dark px-2 py-1 text-[11px] text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
          >
            <option value="">End workflow</option>
            {futureSteps.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      {condition.leftOperand && condition.operator && (
        <div className="rounded-lg border border-border bg-adv-dark-2 px-3 py-2">
          <p className="text-xs text-adv-gray">Preview:</p>
          <p className="mt-0.5 font-mono text-[11px] text-adv-off-white">
            {condition.leftOperand} {condition.operator} {condition.operator !== 'exists' ? condition.rightOperand : ''}
          </p>
        </div>
      )}
    </div>
  );
}
