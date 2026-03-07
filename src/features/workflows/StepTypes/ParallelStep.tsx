import type { WorkflowStep, WorkflowStepType, ParallelGroup } from '@/lib/workflow-definitions';
import { Plus, Trash2 } from 'lucide-react';

interface ParallelStepProps {
  step: WorkflowStep;
  onUpdate: (updates: Partial<WorkflowStep['config']>) => void;
}

export function ParallelStep({ step, onUpdate }: ParallelStepProps) {
  const groups = step.config.parallelGroups ?? [];

  const addGroup = () => {
    const newGroup: ParallelGroup = {
      id: `group-${Date.now()}`,
      label: `Branch ${groups.length + 1}`,
      steps: [],
    };
    onUpdate({ parallelGroups: [...groups, newGroup] });
  };

  const removeGroup = (idx: number) => {
    onUpdate({ parallelGroups: groups.filter((_, i) => i !== idx) });
  };

  const updateGroup = (idx: number, updates: Partial<ParallelGroup>) => {
    onUpdate({ parallelGroups: groups.map((g, i) => i === idx ? { ...g, ...updates } : g) });
  };

  const addStepToGroup = (gIdx: number) => {
    const group = groups[gIdx];
    const newStep = {
      id: `par-step-${Date.now()}`,
      label: `Step ${group.steps.length + 1}`,
      type: 'claude' as WorkflowStepType,
      config: {},
    };
    updateGroup(gIdx, { steps: [...group.steps, newStep] });
  };

  const removeStepFromGroup = (gIdx: number, sIdx: number) => {
    const group = groups[gIdx];
    updateGroup(gIdx, { steps: group.steps.filter((_, i) => i !== sIdx) });
  };

  const updateGroupStep = (gIdx: number, sIdx: number, label: string, type: WorkflowStepType) => {
    const group = groups[gIdx];
    const steps = group.steps.map((s, i) => i === sIdx ? { ...s, label, type } : s);
    updateGroup(gIdx, { steps });
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-adv-blue/30 bg-adv-blue/10 p-3">
        <p className="text-xs font-medium text-adv-blue">Parallel Execution</p>
        <p className="mt-0.5 text-xs text-adv-gray">
          All branches execute simultaneously. Workflow continues when all branches complete.
          Results from each branch are merged into the workflow context.
        </p>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-[11px] font-medium text-adv-gray">Parallel Branches ({groups.length})</label>
          <button
            onClick={addGroup}
            className="text-xs text-adv-teal hover:text-adv-teal-dark transition-colors flex items-center gap-1"
          >
            <Plus className="h-3 w-3" /> Add branch
          </button>
        </div>

        {groups.length === 0 && (
          <div className="rounded-lg border border-dashed border-border py-4 text-center">
            <p className="text-[11px] text-adv-gray">No branches. Add at least 2 branches for parallel execution.</p>
          </div>
        )}

        <div className="flex gap-3 overflow-x-auto pb-2">
          {groups.map((group, gIdx) => (
            <div
              key={group.id}
              className="min-w-[200px] flex-1 rounded-lg border border-border bg-adv-dark p-3 space-y-2"
            >
              <div className="flex items-center justify-between">
                <input
                  type="text"
                  value={group.label}
                  onChange={(e) => updateGroup(gIdx, { label: e.target.value })}
                  className="flex-1 rounded border border-border bg-adv-dark-2 px-2 py-1 text-[11px] font-medium text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                />
                <button
                  onClick={() => removeGroup(gIdx)}
                  className="ml-1 text-adv-gray hover:text-adv-red transition-colors"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              <div className="space-y-1">
                {group.steps.map((s, sIdx) => (
                  <div key={s.id} className="flex items-center gap-1">
                    <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-adv-teal/10 text-xs text-adv-teal">
                      {sIdx + 1}
                    </div>
                    <input
                      type="text"
                      value={s.label}
                      onChange={(e) => updateGroupStep(gIdx, sIdx, e.target.value, s.type)}
                      placeholder="Step label"
                      className="flex-1 min-w-0 rounded border border-border bg-adv-dark-2 px-1.5 py-0.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                    />
                    <button
                      onClick={() => removeStepFromGroup(gIdx, sIdx)}
                      className="shrink-0 text-adv-gray hover:text-adv-red transition-colors"
                    >
                      <Trash2 className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => addStepToGroup(gIdx)}
                  className="w-full rounded border border-dashed border-border py-1 text-xs text-adv-gray hover:text-adv-teal hover:border-adv-teal/30 transition-colors"
                >
                  + Add step
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
