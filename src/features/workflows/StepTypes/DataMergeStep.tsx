import { WorkflowStep } from '@/lib/workflow-definitions';

interface DataMergeStepProps {
  step: WorkflowStep;
  onUpdate: (updates: Partial<WorkflowStep['config']>) => void;
}

export default function DataMergeStep({ step, onUpdate }: DataMergeStepProps) {
  const config = step.config;

  return (
    <div className="space-y-3">
      {/* Merge Type */}
      <div>
        <label className="mb-1 block text-[11px] font-medium text-adv-gray">Merge Type</label>
        <select
          value={config.mergeType || 'join'}
          onChange={(e) => onUpdate({ mergeType: e.target.value as 'join' | 'union' | 'concat' })}
          className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
        >
          <option value="join">Join (match by keys)</option>
          <option value="union">Union (stack vertically)</option>
          <option value="concat">Concat (side-by-side)</option>
        </select>
      </div>

      {/* Left Dataset */}
      <div>
        <label className="mb-1 block text-[11px] font-medium text-adv-gray">Left Dataset</label>
        <input
          type="text"
          value={config.leftDatasetId || ''}
          onChange={(e) => onUpdate({ leftDatasetId: e.target.value })}
          placeholder="{{step_1.dataset.id}}"
          className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 font-mono"
        />
      </div>

      {/* Right Dataset */}
      <div>
        <label className="mb-1 block text-[11px] font-medium text-adv-gray">Right Dataset</label>
        <input
          type="text"
          value={config.rightDatasetId || ''}
          onChange={(e) => onUpdate({ rightDatasetId: e.target.value })}
          placeholder="{{step_2.dataset.id}}"
          className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 font-mono"
        />
      </div>

      {/* Join Configuration */}
      {config.mergeType === 'join' && (
        <>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-adv-gray">Join Type</label>
            <select
              value={config.joinType || 'inner'}
              onChange={(e) => onUpdate({ joinType: e.target.value as 'inner' | 'left' | 'right' | 'full' })}
              className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            >
              <option value="inner">Inner Join (only matches)</option>
              <option value="left">Left Join (all from left)</option>
              <option value="right">Right Join (all from right)</option>
              <option value="full">Full Outer Join (all from both)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-adv-gray">Left Key Column</label>
              <input
                type="text"
                value={config.leftKey || ''}
                onChange={(e) => onUpdate({ leftKey: e.target.value })}
                placeholder="customer_id"
                className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-medium text-adv-gray">Right Key Column</label>
              <input
                type="text"
                value={config.rightKey || ''}
                onChange={(e) => onUpdate({ rightKey: e.target.value })}
                placeholder="customerId"
                className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
              />
            </div>
          </div>
        </>
      )}

      {/* Union Configuration */}
      {config.mergeType === 'union' && (
        <div>
          <label className="mb-1 block text-[11px] font-medium text-adv-gray">Column Mapping (Right → Left)</label>
          <textarea
            value={JSON.stringify(config.columnMapping || {}, null, 2)}
            onChange={(e) => {
              try {
                const mapping = JSON.parse(e.target.value);
                onUpdate({ columnMapping: mapping });
              } catch {
                // Invalid JSON, ignore
              }
            }}
            placeholder='{"customer_id": "customerId", "email_address": "email"}'
            rows={4}
            className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 font-mono"
          />
          <p className="mt-1 text-xs text-adv-gray">Map right column names to match left column names</p>
        </div>
      )}

      {/* Deduplication */}
      <div className="rounded-lg border border-border bg-adv-dark-2 p-3">
        <div className="mb-2 flex items-center gap-2">
          <input
            type="checkbox"
            id={`${step.id}-dedupe`}
            checked={!!config.deduplicateBy}
            onChange={(e) => {
              if (e.target.checked) {
                onUpdate({ deduplicateBy: [], deduplicateStrategy: 'keep_first' });
              } else {
                onUpdate({ deduplicateBy: undefined, deduplicateStrategy: undefined });
              }
            }}
            className="h-3.5 w-3.5 rounded border-border bg-adv-dark text-adv-teal focus:ring-2 focus:ring-adv-teal focus:ring-offset-0"
          />
          <label htmlFor={`${step.id}-dedupe`} className="text-[11px] font-medium text-adv-gray">
            Remove duplicates after merge
          </label>
        </div>

        {config.deduplicateBy && (
          <div className="mt-2 space-y-2">
            <input
              type="text"
              value={(config.deduplicateBy || []).join(', ')}
              onChange={(e) => onUpdate({ deduplicateBy: e.target.value.split(',').map((k) => k.trim()) })}
              placeholder="Key columns: id, email"
              className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            />

            <select
              value={config.deduplicateStrategy || 'keep_first'}
              onChange={(e) => onUpdate({ deduplicateStrategy: e.target.value as any })}
              className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            >
              <option value="keep_first">Keep First</option>
              <option value="keep_last">Keep Last</option>
              <option value="merge_values">Merge Values</option>
            </select>
          </div>
        )}
      </div>

      {/* Output Variable */}
      <div>
        <label className="mb-1 block text-[11px] font-medium text-adv-gray">Output Variable Name</label>
        <input
          type="text"
          value={config.outputVariable || 'merged_dataset'}
          onChange={(e) => onUpdate({ outputVariable: e.target.value })}
          placeholder="merged_dataset"
          className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 font-mono"
        />
      </div>
    </div>
  );
}
