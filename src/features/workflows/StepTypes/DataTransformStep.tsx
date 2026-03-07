import { WorkflowStep } from '@/lib/workflow-definitions';
import { Plus, Trash2 } from 'lucide-react';

interface DataTransformStepProps {
  step: WorkflowStep;
  onUpdate: (updates: Partial<WorkflowStep['config']>) => void;
}

export default function DataTransformStep({ step, onUpdate }: DataTransformStepProps) {
  const config = step.config;
  const operations = (config.transformOperations || []) as Array<{ type: string; [key: string]: any }>;

  const addOperation = (type: string) => {
    const newOp: any = { type };

    // Set default values based on operation type
    switch (type) {
      case 'rename_column':
        newOp.oldName = '';
        newOp.newName = '';
        break;
      case 'select_columns':
        newOp.columns = [];
        break;
      case 'convert_type':
        newOp.column = '';
        newOp.toType = 'string';
        break;
      case 'filter_rows':
        newOp.condition = { column: '', operator: 'equals', value: '' };
        break;
      case 'add_column':
        newOp.name = '';
        newOp.formula = '';
        break;
      case 'sort':
        newOp.column = '';
        newOp.order = 'asc';
        break;
      case 'deduplicate':
        newOp.keys = [];
        newOp.strategy = 'keep_first';
        break;
    }

    onUpdate({ transformOperations: [...operations, newOp] });
  };

  const updateOperation = (index: number, updates: any) => {
    const newOps = [...operations];
    newOps[index] = { ...newOps[index], ...updates };
    onUpdate({ transformOperations: newOps });
  };

  const removeOperation = (index: number) => {
    onUpdate({ transformOperations: operations.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-3">
      {/* Input Dataset */}
      <div>
        <label className="mb-1 block text-[11px] font-medium text-adv-gray">Input Dataset</label>
        <input
          type="text"
          value={config.inputDatasetId || ''}
          onChange={(e) => onUpdate({ inputDatasetId: e.target.value })}
          placeholder="{{step_1.dataset.id}}"
          className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 font-mono"
        />
        <p className="mt-1 text-xs text-adv-gray">Reference dataset from previous import step</p>
      </div>

      {/* Operations List */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-[11px] font-medium text-adv-gray">Transformations</label>
          <div className="relative">
            <select
              onChange={(e) => {
                if (e.target.value) {
                  addOperation(e.target.value);
                  e.target.value = '';
                }
              }}
              className="rounded-lg border border-border bg-adv-dark px-2 py-1 pr-6 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            >
              <option value="">+ Add Operation</option>
              <option value="rename_column">Rename Column</option>
              <option value="select_columns">Select Columns</option>
              <option value="convert_type">Convert Type</option>
              <option value="filter_rows">Filter Rows</option>
              <option value="add_column">Add Column</option>
              <option value="sort">Sort</option>
              <option value="deduplicate">Deduplicate</option>
            </select>
          </div>
        </div>

        {operations.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-adv-dark-2 p-4 text-center">
            <p className="text-[11px] text-adv-gray">No transformations yet. Add operations above.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {operations.map((op, idx) => (
              <div key={idx} className="rounded-lg border border-border bg-adv-dark-2 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-medium text-adv-teal">{op.type.replace(/_/g, ' ').toUpperCase()}</span>
                  <button
                    onClick={() => removeOperation(idx)}
                    className="text-adv-gray hover:text-adv-red transition-colors"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>

                {/* Rename Column */}
                {op.type === 'rename_column' && (
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={op.oldName || ''}
                      onChange={(e) => updateOperation(idx, { oldName: e.target.value })}
                      placeholder="Old name"
                      className="w-full rounded border border-border bg-adv-dark px-2 py-1 text-[11px] text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                    />
                    <input
                      type="text"
                      value={op.newName || ''}
                      onChange={(e) => updateOperation(idx, { newName: e.target.value })}
                      placeholder="New name"
                      className="w-full rounded border border-border bg-adv-dark px-2 py-1 text-[11px] text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                    />
                  </div>
                )}

                {/* Select Columns */}
                {op.type === 'select_columns' && (
                  <input
                    type="text"
                    value={(op.columns || []).join(', ')}
                    onChange={(e) => updateOperation(idx, { columns: e.target.value.split(',').map((c) => c.trim()) })}
                    placeholder="col1, col2, col3"
                    className="w-full rounded border border-border bg-adv-dark px-2 py-1 text-[11px] text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                  />
                )}

                {/* Convert Type */}
                {op.type === 'convert_type' && (
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={op.column || ''}
                      onChange={(e) => updateOperation(idx, { column: e.target.value })}
                      placeholder="Column name"
                      className="w-full rounded border border-border bg-adv-dark px-2 py-1 text-[11px] text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                    />
                    <select
                      value={op.toType || 'string'}
                      onChange={(e) => updateOperation(idx, { toType: e.target.value })}
                      className="w-full rounded border border-border bg-adv-dark px-2 py-1 text-[11px] text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                    >
                      <option value="string">String</option>
                      <option value="number">Number</option>
                      <option value="boolean">Boolean</option>
                      <option value="date">Date</option>
                    </select>
                  </div>
                )}

                {/* Filter Rows */}
                {op.type === 'filter_rows' && (
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="text"
                      value={op.condition?.column || ''}
                      onChange={(e) => updateOperation(idx, { condition: { ...op.condition, column: e.target.value } })}
                      placeholder="Column"
                      className="w-full rounded border border-border bg-adv-dark px-2 py-1 text-[11px] text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                    />
                    <select
                      value={op.condition?.operator || 'equals'}
                      onChange={(e) => updateOperation(idx, { condition: { ...op.condition, operator: e.target.value } })}
                      className="w-full rounded border border-border bg-adv-dark px-2 py-1 text-[11px] text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                    >
                      <option value="equals">=</option>
                      <option value="not_equals">≠</option>
                      <option value="greater_than">&gt;</option>
                      <option value="less_than">&lt;</option>
                      <option value="contains">contains</option>
                    </select>
                    <input
                      type="text"
                      value={op.condition?.value || ''}
                      onChange={(e) => updateOperation(idx, { condition: { ...op.condition, value: e.target.value } })}
                      placeholder="Value"
                      className="w-full rounded border border-border bg-adv-dark px-2 py-1 text-[11px] text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                    />
                  </div>
                )}

                {/* Add Column */}
                {op.type === 'add_column' && (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={op.name || ''}
                      onChange={(e) => updateOperation(idx, { name: e.target.value })}
                      placeholder="New column name"
                      className="w-full rounded border border-border bg-adv-dark px-2 py-1 text-[11px] text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                    />
                    <input
                      type="text"
                      value={op.formula || ''}
                      onChange={(e) => updateOperation(idx, { formula: e.target.value })}
                      placeholder="Formula: amount * 1.25 or if(amount > 1000, 'high', 'low')"
                      className="w-full rounded border border-border bg-adv-dark px-2 py-1 text-[11px] text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 font-mono"
                    />
                  </div>
                )}

                {/* Sort */}
                {op.type === 'sort' && (
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={op.column || ''}
                      onChange={(e) => updateOperation(idx, { column: e.target.value })}
                      placeholder="Column name"
                      className="w-full rounded border border-border bg-adv-dark px-2 py-1 text-[11px] text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                    />
                    <select
                      value={op.order || 'asc'}
                      onChange={(e) => updateOperation(idx, { order: e.target.value })}
                      className="w-full rounded border border-border bg-adv-dark px-2 py-1 text-[11px] text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                    >
                      <option value="asc">Ascending</option>
                      <option value="desc">Descending</option>
                    </select>
                  </div>
                )}

                {/* Deduplicate */}
                {op.type === 'deduplicate' && (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={(op.keys || []).join(', ')}
                      onChange={(e) => updateOperation(idx, { keys: e.target.value.split(',').map((k) => k.trim()) })}
                      placeholder="Key columns: id, email"
                      className="w-full rounded border border-border bg-adv-dark px-2 py-1 text-[11px] text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                    />
                    <select
                      value={op.strategy || 'keep_first'}
                      onChange={(e) => updateOperation(idx, { strategy: e.target.value })}
                      className="w-full rounded border border-border bg-adv-dark px-2 py-1 text-[11px] text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                    >
                      <option value="keep_first">Keep First</option>
                      <option value="keep_last">Keep Last</option>
                    </select>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Output Variable */}
      <div>
        <label className="mb-1 block text-[11px] font-medium text-adv-gray">Output Variable Name</label>
        <input
          type="text"
          value={config.outputVariable || 'transformed_dataset'}
          onChange={(e) => onUpdate({ outputVariable: e.target.value })}
          placeholder="transformed_dataset"
          className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 font-mono"
        />
      </div>
    </div>
  );
}
