import type { WorkflowStep } from '@/lib/workflow-definitions';

interface Connection {
  id: string;
  label: string;
  type: string;
}

interface DatabaseStepProps {
  step: WorkflowStep;
  onUpdate: (updates: Partial<WorkflowStep['config']>) => void;
  connections?: Connection[];
}

export function DatabaseStep({ step, onUpdate, connections = [] }: DatabaseStepProps) {
  const dbConnections = connections.filter((c) => c.type === 'database');

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-md border border-adv-blue/30 bg-adv-blue/10 px-3 py-1.5">
        <span className="text-xs font-medium text-adv-blue">Connection required: Database</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-adv-gray">Database Connection</label>
          <select
            value={step.config.connectionId || ''}
            onChange={(e) => onUpdate({ connectionId: e.target.value || undefined })}
            className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
          >
            <option value="">— Select connection —</option>
            {dbConnections.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
            {dbConnections.length === 0 && (
              <option disabled value="">No database connections configured</option>
            )}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-adv-gray">Max Rows</label>
          <input
            type="number"
            min={1}
            max={10000}
            value={step.config.maxRows ?? 100}
            onChange={(e) => onUpdate({ maxRows: parseInt(e.target.value, 10) || 100 })}
            className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-[11px] font-medium text-adv-gray">
          SQL Query Template
          <span className="ml-1 text-adv-gray font-normal">Use {'{{variable}}'} for step data references</span>
        </label>
        <textarea
          value={step.config.queryTemplate || ''}
          onChange={(e) => onUpdate({ queryTemplate: e.target.value })}
          placeholder={"SELECT * FROM customers WHERE id = '{{step_1.customer_id}}' LIMIT {{maxRows}}"}
          className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 font-mono"
          rows={6}
        />
        <p className="mt-1 text-xs text-adv-gray">
          Parameterized references are automatically escaped to prevent SQL injection.
        </p>
      </div>

      <div>
        <label className="mb-1 block text-[11px] font-medium text-adv-gray">
          Output Variable Name
          <span className="ml-1 text-adv-gray font-normal">Reference as {'{{<name>.rows[0].field}}'} in later steps</span>
        </label>
        <input
          type="text"
          value={step.config.outputVariable || ''}
          onChange={(e) => onUpdate({ outputVariable: e.target.value })}
          placeholder="query_result"
          className="w-48 rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 font-mono"
        />
      </div>
    </div>
  );
}
