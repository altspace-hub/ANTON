import type { WorkflowStep } from '@/lib/workflow-definitions';

interface CheckpointStepProps {
  step: WorkflowStep;
  onUpdate: (updates: Partial<WorkflowStep['config']>) => void;
  availableContextFields?: string[];
}

export function CheckpointStep({ step, onUpdate, availableContextFields = [] }: CheckpointStepProps) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-adv-gold/30 bg-adv-gold/10 p-3">
        <p className="text-xs font-medium text-adv-gold">Human Review Checkpoint</p>
        <p className="mt-0.5 text-xs text-adv-gray">
          Workflow pauses here in ALL execution modes (including Automatic).
          A reviewer must approve, modify, or reject before execution continues.
          This is the only step type that overrides automatic mode.
        </p>
      </div>

      <div>
        <label className="mb-1 block text-[11px] font-medium text-adv-gray">Review Message</label>
        <textarea
          value={step.config.checkpointMessage || ''}
          onChange={(e) => onUpdate({ checkpointMessage: e.target.value })}
          placeholder="Please review the risk assessment output before proceeding to client communication. Verify: (1) Risk rating is appropriate, (2) Action items are correctly prioritized, (3) No sensitive information is exposed."
          className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
          rows={4}
        />
        <p className="mt-1 text-xs text-adv-gray">
          This message is shown to the reviewer alongside the workflow output.
        </p>
      </div>

      {availableContextFields.length > 0 && (
        <div>
          <label className="mb-1 block text-[11px] font-medium text-adv-gray">
            Context Fields to Display
            <span className="ml-1 text-adv-gray font-normal">Which step outputs to show in the review panel</span>
          </label>
          <textarea
            value={step.config.checkpointContext || ''}
            onChange={(e) => onUpdate({ checkpointContext: e.target.value })}
            placeholder="step_1.client_name, step_2.risk_score, step_3.summary"
            className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 font-mono"
            rows={2}
          />
          <div className="mt-2">
            <p className="mb-1 text-xs text-adv-gray">Available fields:</p>
            <div className="flex flex-wrap gap-1">
              {availableContextFields.map((field) => (
                <button
                  key={field}
                  onClick={() => {
                    const current = step.config.checkpointContext || '';
                    const fields = current ? current + ', ' + field : field;
                    onUpdate({ checkpointContext: fields });
                  }}
                  className="rounded bg-adv-dark-2 px-1.5 py-0.5 font-mono text-xs text-adv-teal hover:bg-adv-teal/10 transition-colors"
                >
                  {field}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
