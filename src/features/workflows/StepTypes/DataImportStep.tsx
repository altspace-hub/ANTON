import { WorkflowStep } from '@/lib/workflow-definitions';

interface Connection {
  id: string;
  label: string;
  type: string;
}

interface DataImportStepProps {
  step: WorkflowStep;
  onUpdate: (updates: Partial<WorkflowStep['config']>) => void;
  connections?: Connection[];
}

export default function DataImportStep({ step, onUpdate, connections = [] }: DataImportStepProps) {
  const config = step.config;

  return (
    <div className="space-y-3">
      {/* Source Type */}
      <div>
        <label className="mb-1 block text-[11px] font-medium text-adv-gray">Data Source</label>
        <select
          value={config.importSource || 'file'}
          onChange={(e) => onUpdate({ importSource: e.target.value as 'file' | 'database' | 'api' | 'saved_dataset' })}
          className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
        >
          <option value="file">File (CSV, Excel, JSON)</option>
          <option value="database">Database Query</option>
          <option value="api">API Endpoint</option>
          <option value="saved_dataset">Saved Dataset</option>
        </select>
      </div>

      {/* Saved Dataset Source */}
      {config.importSource === 'saved_dataset' && (
        <div>
          <label className="mb-1 block text-[11px] font-medium text-adv-gray">Select Dataset</label>
          <input
            type="text"
            value={config.savedDatasetId || ''}
            onChange={(e) => onUpdate({ savedDatasetId: e.target.value })}
            placeholder="Dataset ID or name"
            className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
          />
          <p className="mt-1 text-xs text-adv-gray">Enter the name of a previously saved dataset</p>
        </div>
      )}

      {/* File Source */}
      {config.importSource === 'file' && (
        <>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-adv-gray">File Path</label>
            <input
              type="text"
              value={config.filePath || ''}
              onChange={(e) => onUpdate({ filePath: e.target.value })}
              placeholder="./data/input.csv or {{step_1.output_path}}"
              className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            />
            <p className="mt-1 text-xs text-adv-gray">Use templates like {`{{step_1.file_path}}`} to reference previous steps</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-adv-gray">File Type</label>
              <select
                value={config.fileType || 'csv'}
                onChange={(e) => onUpdate({ fileType: e.target.value as 'csv' | 'excel' | 'json' })}
                className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
              >
                <option value="csv">CSV</option>
                <option value="excel">Excel (.xlsx)</option>
                <option value="json">JSON</option>
              </select>
            </div>

            {config.fileType === 'excel' && (
              <div>
                <label className="mb-1 block text-[11px] font-medium text-adv-gray">Sheet Name</label>
                <input
                  type="text"
                  value={config.sheetName || ''}
                  onChange={(e) => onUpdate({ sheetName: e.target.value })}
                  placeholder="Sheet1 (optional)"
                  className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                />
              </div>
            )}

            {config.fileType === 'csv' && (
              <div>
                <label className="mb-1 block text-[11px] font-medium text-adv-gray">Delimiter</label>
                <input
                  type="text"
                  value={config.delimiter || ','}
                  onChange={(e) => onUpdate({ delimiter: e.target.value })}
                  placeholder=","
                  maxLength={1}
                  className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`${step.id}-has-header`}
              checked={config.hasHeader !== false}
              onChange={(e) => onUpdate({ hasHeader: e.target.checked })}
              className="h-3.5 w-3.5 rounded border-border bg-adv-dark text-adv-teal focus:ring-2 focus:ring-adv-teal focus:ring-offset-0"
            />
            <label htmlFor={`${step.id}-has-header`} className="text-[11px] text-adv-gray">
              First row contains column headers
            </label>
          </div>
        </>
      )}

      {/* Database Source */}
      {config.importSource === 'database' && (
        <>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-adv-gray">Database Connection</label>
            <select
              value={config.dataConnectionId || ''}
              onChange={(e) => onUpdate({ dataConnectionId: e.target.value })}
              className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            >
              <option value="">— Select connection —</option>
              {connections.filter(c => c.type === 'database').map(c => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
              {connections.filter(c => c.type === 'database').length === 0 && (
                <option disabled value="">No database connections configured</option>
              )}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-medium text-adv-gray">SQL Query</label>
            <textarea
              value={config.importQuery || ''}
              onChange={(e) => onUpdate({ importQuery: e.target.value })}
              placeholder="SELECT * FROM customers WHERE created_at > {{step_1.start_date}}"
              rows={4}
              className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 font-mono"
            />
          </div>
        </>
      )}

      {/* API Source */}
      {config.importSource === 'api' && (
        <div className="rounded-lg border border-border bg-adv-dark-2 p-3">
          <p className="text-[11px] text-adv-gray">
            API import coming soon. Use <code className="rounded bg-adv-dark px-1 py-0.5 text-adv-teal">api_call</code> step type for now.
          </p>
        </div>
      )}

      {/* Preview Option */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id={`${step.id}-preview`}
          checked={config.preview || false}
          onChange={(e) => onUpdate({ preview: e.target.checked })}
          className="h-3.5 w-3.5 rounded border-border bg-adv-dark text-adv-teal focus:ring-2 focus:ring-adv-teal focus:ring-offset-0"
        />
        <label htmlFor={`${step.id}-preview`} className="text-[11px] text-adv-gray">
          Preview only (first 100 rows)
        </label>
      </div>

      {/* Save Dataset for Reuse */}
      <div className="rounded-lg border border-border bg-adv-card p-3">
        <label className="flex items-center gap-2 text-xs font-medium text-adv-off-white">
          <input
            type="checkbox"
            checked={config.saveDataset === true}
            onChange={(e) => onUpdate({ saveDataset: e.target.checked })}
            className="h-3.5 w-3.5 rounded border-border bg-adv-dark text-adv-teal focus:ring-2 focus:ring-adv-teal focus:ring-offset-0"
          />
          Save dataset for reuse in other workflows
        </label>

        {config.saveDataset && (
          <div className="mt-2 space-y-2">
            <input
              type="text"
              value={config.datasetName || ''}
              onChange={(e) => onUpdate({ datasetName: e.target.value })}
              placeholder="Dataset name (e.g., Q1_Sales_2026)"
              className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            />
            <select
              value={config.datasetScope || 'session'}
              onChange={(e) => onUpdate({ datasetScope: e.target.value })}
              className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            >
              <option value="session">This session only (auto-delete with session)</option>
              <option value="global">Global (available to all users, expires in 30 days)</option>
            </select>
          </div>
        )}
      </div>

      {/* Output Variable */}
      <div>
        <label className="mb-1 block text-[11px] font-medium text-adv-gray">Output Variable Name</label>
        <input
          type="text"
          value={config.outputVariable || 'dataset'}
          onChange={(e) => onUpdate({ outputVariable: e.target.value })}
          placeholder="dataset"
          className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 font-mono"
        />
        <p className="mt-1 text-xs text-adv-gray">Access in next step: {`{{${step.id}.${config.outputVariable || 'dataset'}}}`}</p>
      </div>
    </div>
  );
}
