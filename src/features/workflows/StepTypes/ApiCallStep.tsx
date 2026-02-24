import type { WorkflowStep } from '@/lib/workflow-definitions';

interface Connection {
  id: string;
  label: string;
  type: string;
}

interface ApiCallStepProps {
  step: WorkflowStep;
  onUpdate: (updates: Partial<WorkflowStep['config']>) => void;
  connections?: Connection[];
}

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const;

export function ApiCallStep({ step, onUpdate, connections = [] }: ApiCallStepProps) {
  const apiConnections = connections.filter((c) => c.type === 'api');

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-md border border-adv-blue/30 bg-adv-blue/10 px-3 py-1.5">
        <span className="text-[10px] font-medium text-adv-blue">Connection required: API</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-adv-gray">API Connection</label>
          <select
            value={step.config.connectionId || ''}
            onChange={(e) => onUpdate({ connectionId: e.target.value || undefined })}
            className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none"
          >
            <option value="">— Select connection —</option>
            {apiConnections.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
            {apiConnections.length === 0 && (
              <option disabled value="">No API connections configured</option>
            )}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-adv-gray">HTTP Method</label>
          <select
            value={step.config.method || 'GET'}
            onChange={(e) => onUpdate({ method: e.target.value as typeof HTTP_METHODS[number] })}
            className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none"
          >
            {HTTP_METHODS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-[11px] font-medium text-adv-gray">
          Endpoint Path
          <span className="ml-1 text-adv-gray-med font-normal">Supports {'{{variable}}'} references</span>
        </label>
        <input
          type="text"
          value={step.config.endpointPath || ''}
          onChange={(e) => onUpdate({ endpointPath: e.target.value })}
          placeholder="/api/v1/customers/{{step_1.customer_id}}"
          className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none font-mono"
        />
      </div>

      {(step.config.method === 'POST' || step.config.method === 'PUT' || step.config.method === 'PATCH') && (
        <div>
          <label className="mb-1 block text-[11px] font-medium text-adv-gray">
            Request Body Template (JSON)
            <span className="ml-1 text-adv-gray-med font-normal">Supports {'{{variable}}'}</span>
          </label>
          <textarea
            value={step.config.requestBodyTemplate || ''}
            onChange={(e) => onUpdate({ requestBodyTemplate: e.target.value })}
            placeholder={'{\n  "customerId": "{{step_1.customer_id}}",\n  "riskScore": "{{step_2.risk_score}}"\n}'}
            className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none font-mono"
            rows={6}
          />
        </div>
      )}

      <div>
        <label className="mb-1 block text-[11px] font-medium text-adv-gray">
          Output Variable Name
          <span className="ml-1 text-adv-gray-med font-normal">Reference as {'{{<name>.field}}'} in later steps</span>
        </label>
        <input
          type="text"
          value={step.config.outputVariable || ''}
          onChange={(e) => onUpdate({ outputVariable: e.target.value })}
          placeholder="api_response"
          className="w-48 rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none font-mono"
        />
      </div>
    </div>
  );
}
