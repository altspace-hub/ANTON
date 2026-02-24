import { WorkflowStep } from '@/lib/workflow-definitions';

interface DataExportStepProps {
  step: WorkflowStep;
  onUpdate: (updates: Partial<WorkflowStep['config']>) => void;
}

export default function DataExportStep({ step, onUpdate }: DataExportStepProps) {
  const config = step.config;

  return (
    <div className="space-y-3">
      {/* Input Dataset */}
      <div>
        <label className="mb-1 block text-[11px] font-medium text-adv-gray">Dataset to Export</label>
        <input
          type="text"
          value={config.exportDatasetId || ''}
          onChange={(e) => onUpdate({ exportDatasetId: e.target.value })}
          placeholder="{{step_3.merged_dataset.id}}"
          className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none font-mono"
        />
        <p className="mt-1 text-[10px] text-adv-gray-med">Reference dataset from previous step</p>
      </div>

      {/* Destination Type */}
      <div>
        <label className="mb-1 block text-[11px] font-medium text-adv-gray">Export Destination</label>
        <select
          value={config.exportDestination || 'file'}
          onChange={(e) => onUpdate({ exportDestination: e.target.value as 'file' | 'database' | 'api' })}
          className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none"
        >
          <option value="file">File (CSV, Excel, JSON)</option>
          <option value="database">Database Table</option>
          <option value="api">API Endpoint</option>
        </select>
      </div>

      {/* File Export */}
      {config.exportDestination === 'file' && (
        <>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-adv-gray">Export File Path</label>
            <input
              type="text"
              value={config.exportFilePath || ''}
              onChange={(e) => onUpdate({ exportFilePath: e.target.value })}
              placeholder="./output/results.xlsx"
              className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-medium text-adv-gray">File Type</label>
            <select
              value={config.exportFileType || 'excel'}
              onChange={(e) => onUpdate({ exportFileType: e.target.value as 'csv' | 'excel' | 'json' })}
              className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none"
            >
              <option value="csv">CSV</option>
              <option value="excel">Excel (.xlsx)</option>
              <option value="json">JSON</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`${step.id}-overwrite`}
              checked={config.overwrite || false}
              onChange={(e) => onUpdate({ overwrite: e.target.checked })}
              className="h-3.5 w-3.5 rounded border-border bg-adv-dark text-adv-teal focus:ring-2 focus:ring-adv-teal focus:ring-offset-0"
            />
            <label htmlFor={`${step.id}-overwrite`} className="text-[11px] text-adv-gray">
              Overwrite if file exists
            </label>
          </div>
        </>
      )}

      {/* Database Export */}
      {config.exportDestination === 'database' && (
        <>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-adv-gray">Database Connection</label>
            <select
              value={config.dataConnectionId || ''}
              onChange={(e) => onUpdate({ dataConnectionId: e.target.value })}
              className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none"
            >
              <option value="">Select connection...</option>
              {/* TODO: Load from ConnectionManager */}
              <option value="conn-1">Production DB</option>
              <option value="conn-2">Analytics DB</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-medium text-adv-gray">Table Name</label>
            <input
              type="text"
              value={config.exportTableName || ''}
              onChange={(e) => onUpdate({ exportTableName: e.target.value })}
              placeholder="customer_data"
              className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-medium text-adv-gray">Insert Mode</label>
            <select
              value={config.exportInsertMode || 'insert'}
              onChange={(e) => onUpdate({ exportInsertMode: e.target.value as 'insert' | 'upsert' | 'replace' })}
              className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none"
            >
              <option value="insert">Insert (fail if exists)</option>
              <option value="upsert">Upsert (insert or update)</option>
              <option value="replace">Replace (delete + insert)</option>
            </select>
          </div>
        </>
      )}

      {/* API Export */}
      {config.exportDestination === 'api' && (
        <div className="rounded-lg border border-border bg-adv-dark-2 p-3">
          <p className="text-[11px] text-adv-gray-med">
            API export coming soon. Use <code className="rounded bg-adv-dark px-1 py-0.5 text-adv-teal">api_call</code> step type for now.
          </p>
        </div>
      )}

      {/* Output Variable */}
      <div>
        <label className="mb-1 block text-[11px] font-medium text-adv-gray">Output Variable Name</label>
        <input
          type="text"
          value={config.outputVariable || 'export_result'}
          onChange={(e) => onUpdate({ outputVariable: e.target.value })}
          placeholder="export_result"
          className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none font-mono"
        />
      </div>
    </div>
  );
}
