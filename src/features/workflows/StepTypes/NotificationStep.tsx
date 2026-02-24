import type { WorkflowStep } from '@/lib/workflow-definitions';

interface Connection {
  id: string;
  label: string;
  type: string;
}

interface NotificationStepProps {
  step: WorkflowStep;
  onUpdate: (updates: Partial<WorkflowStep['config']>) => void;
  connections?: Connection[];
}

export function NotificationStep({ step, onUpdate, connections = [] }: NotificationStepProps) {
  const webhookConnections = connections.filter((c) => c.type === 'webhook');
  const useConnection = !!step.config.connectionId;

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-2 block text-[11px] font-medium text-adv-gray">Webhook Source</label>
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => onUpdate({ connectionId: undefined })}
            className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${
              !useConnection
                ? 'bg-adv-teal text-adv-dark font-medium'
                : 'border border-border text-adv-gray hover:text-adv-off-white'
            }`}
          >
            Direct URL
          </button>
          <button
            onClick={() => onUpdate({ webhookUrl: undefined })}
            className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${
              useConnection
                ? 'bg-adv-teal text-adv-dark font-medium'
                : 'border border-border text-adv-gray hover:text-adv-off-white'
            }`}
          >
            Connection
          </button>
        </div>

        {useConnection ? (
          <div>
            <label className="mb-1 block text-[11px] font-medium text-adv-gray">Webhook Connection</label>
            <select
              value={step.config.connectionId || ''}
              onChange={(e) => onUpdate({ connectionId: e.target.value || undefined })}
              className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none"
            >
              <option value="">— Select connection —</option>
              {webhookConnections.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
              {webhookConnections.length === 0 && (
                <option disabled value="">No webhook connections configured</option>
              )}
            </select>
          </div>
        ) : (
          <div>
            <label className="mb-1 block text-[11px] font-medium text-adv-gray">
              Webhook URL
              <span className="ml-1 text-adv-gray-med font-normal">Slack/Teams/custom webhook</span>
            </label>
            <input
              type="url"
              value={step.config.webhookUrl || ''}
              onChange={(e) => onUpdate({ webhookUrl: e.target.value })}
              placeholder="https://hooks.slack.com/services/..."
              className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
            />
          </div>
        )}
      </div>

      <div>
        <label className="mb-1 block text-[11px] font-medium text-adv-gray">
          Message Template
          <span className="ml-1 text-adv-gray-med font-normal">Supports {'{{variable}}'} substitution</span>
        </label>
        <textarea
          value={step.config.messageTemplate || ''}
          onChange={(e) => onUpdate({ messageTemplate: e.target.value })}
          placeholder={"Workflow alert: {{workflow.label}} completed\n\nClient: {{step_1.client_name}}\nRisk Score: {{step_3.risk_score}}\n\nView details: {{context.url}}"}
          className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
          rows={6}
        />
        <p className="mt-1 text-[10px] text-adv-gray-med">
          Use {'{{workflow.label}}'}, {'{{context.*}}'}, and {'{{step_N.*}}'} for dynamic content.
        </p>
      </div>
    </div>
  );
}
