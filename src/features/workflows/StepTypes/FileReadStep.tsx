import type { WorkflowStep } from '@/lib/workflow-definitions';

interface Connection {
  id: string;
  label: string;
  type: string;
}

interface FileReadStepProps {
  step: WorkflowStep;
  onUpdate: (updates: Partial<WorkflowStep['config']>) => void;
  connections?: Connection[];
}

export function FileReadStep({ step, onUpdate, connections = [] }: FileReadStepProps) {
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
          Path Pattern
          <span className="ml-1 text-adv-gray font-normal">Glob pattern, supports {'{{variable}}'}</span>
        </label>
        <input
          type="text"
          value={step.config.pathPattern || ''}
          onChange={(e) => onUpdate({ pathPattern: e.target.value })}
          placeholder="/reports/{{step_1.client_id}}/*.pdf"
          className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 font-mono"
        />
      </div>

      <div>
        <label className="mb-1 block text-[11px] font-medium text-adv-gray">
          File Filter (optional)
          <span className="ml-1 text-adv-gray font-normal">Comma-separated extensions</span>
        </label>
        <input
          type="text"
          value={step.config.fileFilter || ''}
          onChange={(e) => onUpdate({ fileFilter: e.target.value })}
          placeholder=".pdf, .docx, .xlsx"
          className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
        />
      </div>

      <div>
        <label className="mb-1 block text-[11px] font-medium text-adv-gray">
          Output Variable Name
          <span className="ml-1 text-adv-gray font-normal">Reference as {'{{<name>.files[0].content}}'}</span>
        </label>
        <input
          type="text"
          value={step.config.outputVariable || ''}
          onChange={(e) => onUpdate({ outputVariable: e.target.value })}
          placeholder="file_content"
          className="w-48 rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 font-mono"
        />
      </div>
    </div>
  );
}
