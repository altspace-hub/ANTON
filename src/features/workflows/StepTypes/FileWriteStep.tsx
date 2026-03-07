import type { WorkflowStep } from '@/lib/workflow-definitions';

interface Connection {
  id: string;
  label: string;
  type: string;
}

interface FileWriteStepProps {
  step: WorkflowStep;
  onUpdate: (updates: Partial<WorkflowStep['config']>) => void;
  connections?: Connection[];
  availableOutputs?: Array<{ stepId: string; label: string; variable?: string }>;
}

export function FileWriteStep({ step, onUpdate, connections = [], availableOutputs = [] }: FileWriteStepProps) {
  const fsConnections = connections.filter((c) => c.type === 'filesystem');

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-md border border-adv-blue/30 bg-adv-blue/10 px-3 py-1.5">
        <span className="text-xs font-medium text-adv-blue">Connection required: Filesystem</span>
      </div>

      <div>
        <label className="mb-1 block text-[11px] font-medium text-adv-gray">Filesystem Connection</label>
        <select
          value={step.config.connectionId || ''}
          onChange={(e) => onUpdate({ connectionId: e.target.value || undefined })}
          className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
        >
          <option value="">— Select connection —</option>
          {fsConnections.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
          {fsConnections.length === 0 && (
            <option disabled value="">No filesystem connections configured</option>
          )}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-[11px] font-medium text-adv-gray">
          Output Path Template
          <span className="ml-1 text-adv-gray font-normal">Supports {'{{variable}}'}</span>
        </label>
        <input
          type="text"
          value={step.config.outputPath || ''}
          onChange={(e) => onUpdate({ outputPath: e.target.value })}
          placeholder="/reports/{{step_1.client_id}}/report-{{date}}.md"
          className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 font-mono"
        />
      </div>

      <div>
        <label className="mb-1 block text-[11px] font-medium text-adv-gray">Content Source</label>
        <select
          value={step.config.contentSource || ''}
          onChange={(e) => onUpdate({ contentSource: e.target.value || undefined })}
          className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
        >
          <option value="">— Select previous step output —</option>
          {availableOutputs.map((o) => (
            <option key={o.stepId} value={o.variable || o.stepId}>
              {o.label} {o.variable ? `(${o.variable})` : ''}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-adv-gray">
          Select which previous step's output to write as the file content.
        </p>
      </div>
    </div>
  );
}
