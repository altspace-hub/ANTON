import type { WorkflowStep } from '@/lib/workflow-definitions';

interface EmailSendStepProps {
  step: WorkflowStep;
  onUpdate: (updates: Partial<WorkflowStep['config']>) => void;
}

export function EmailSendStep({ step, onUpdate }: EmailSendStepProps) {
  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-[11px] font-medium text-adv-gray">
          To
          <span className="ml-1 text-adv-gray-med font-normal">Supports {'{{variable}}'}, comma-separated for multiple</span>
        </label>
        <input
          type="text"
          value={step.config.toTemplate || ''}
          onChange={(e) => onUpdate({ toTemplate: e.target.value })}
          placeholder="{{step_1.email}}, compliance@example.com"
          className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-[11px] font-medium text-adv-gray">
          Subject
          <span className="ml-1 text-adv-gray-med font-normal">Supports {'{{variable}}'}</span>
        </label>
        <input
          type="text"
          value={step.config.subjectTemplate || ''}
          onChange={(e) => onUpdate({ subjectTemplate: e.target.value })}
          placeholder="Compliance Alert: {{step_2.alert_type}} — {{step_1.client_name}}"
          className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-[11px] font-medium text-adv-gray">
          Body Template
          <span className="ml-1 text-adv-gray-med font-normal">Markdown supported. Supports {'{{variable}}'}</span>
        </label>
        <textarea
          value={step.config.bodyTemplate || ''}
          onChange={(e) => onUpdate({ bodyTemplate: e.target.value })}
          placeholder={"Dear Compliance Team,\n\nThis is an automated alert regarding {{step_1.client_name}}.\n\n**Finding:** {{step_2.summary}}\n\n**Risk Score:** {{step_2.risk_score}}\n\nPlease review immediately."}
          className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
          rows={8}
        />
      </div>
    </div>
  );
}
