import { useState } from 'react';
import { Plus, X, Loader2 } from 'lucide-react';
import type { DeadlineLabel } from './types';
import { apiPost, apiDelete } from './types';

interface LabelManagerProps {
  deadlineLabels: string[]; // current deadline's label IDs
  allLabels: DeadlineLabel[];
  onToggleLabel: (labelId: string) => void;
  onLabelsChange: () => void; // refresh labels list
}

const PRESET_COLORS = [
  '#2DD4A8', // teal
  '#3498DB', // blue
  '#F5A623', // gold
  '#E74C3C', // red
  '#9B59B6', // purple
];

export default function LabelManager({
  deadlineLabels,
  allLabels,
  onToggleLabel,
  onLabelsChange,
}: LabelManagerProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function createLabel() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await apiPost('/api/deadline-labels', {
        name: newName.trim(),
        color: newColor,
      });
      setNewName('');
      setNewColor(PRESET_COLORS[0]);
      setShowCreate(false);
      onLabelsChange();
    } catch (err) {
      console.error('Failed to create label:', err);
    } finally {
      setCreating(false);
    }
  }

  async function deleteLabel(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setDeletingId(id);
    try {
      await apiDelete(`/api/deadline-labels/${id}`);
      onLabelsChange();
    } catch (err) {
      console.error('Failed to delete label:', err);
    } finally {
      setDeletingId(null);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      createLabel();
    }
    if (e.key === 'Escape') {
      setShowCreate(false);
    }
  }

  return (
    <div>
      {/* Label chips */}
      <div className="flex flex-wrap gap-2">
        {allLabels.map((label) => {
          const isActive = deadlineLabels.includes(label.id);
          return (
            <button
              key={label.id}
              onClick={() => onToggleLabel(label.id)}
              className={`group relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all ${
                isActive
                  ? 'shadow-sm'
                  : 'opacity-60 hover:opacity-100'
              }`}
              style={
                isActive
                  ? {
                      backgroundColor: label.color + '30',
                      color: label.color,
                      border: `1px solid ${label.color}60`,
                    }
                  : {
                      backgroundColor: 'transparent',
                      color: label.color,
                      border: `1px solid ${label.color}30`,
                    }
              }
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: label.color }}
              />
              {label.name}

              {/* Delete button on hover */}
              <span
                onClick={(e) => deleteLabel(label.id, e)}
                className="ml-1 hidden rounded-full p-0.5 transition-colors hover:bg-black/20 group-hover:inline-flex"
              >
                {deletingId === label.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <X className="h-3 w-3" />
                )}
              </span>
            </button>
          );
        })}

        {/* Create label button */}
        {!showCreate && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1 rounded-full border border-dashed border-adv-gray-med px-3 py-1.5 text-sm text-adv-gray transition-colors hover:border-adv-teal hover:text-adv-teal"
          >
            <Plus className="h-3.5 w-3.5" />
            Create Label
          </button>
        )}
      </div>

      {/* Create label form */}
      {showCreate && (
        <div className="mt-3 rounded-lg border border-border bg-adv-dark p-3">
          <div className="flex items-end gap-2">
            {/* Name input */}
            <div className="flex-1">
              <label className="mb-1 block text-xs text-adv-gray">Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Label name"
                autoFocus
                className="w-full rounded-lg border border-border bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
              />
            </div>

            {/* Color picker */}
            <div>
              <label className="mb-1 block text-xs text-adv-gray">Color</label>
              <div className="flex gap-1.5">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setNewColor(color)}
                    className={`h-7 w-7 rounded-full border-2 transition-all ${
                      newColor === color
                        ? 'border-adv-white scale-110'
                        : 'border-transparent hover:scale-105'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={createLabel}
              disabled={!newName.trim() || creating}
              className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-3 py-1.5 text-sm font-medium text-adv-dark transition-colors hover:bg-adv-teal-dark disabled:opacity-40"
            >
              {creating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              Create
            </button>
            <button
              onClick={() => {
                setShowCreate(false);
                setNewName('');
              }}
              className="rounded-lg px-3 py-1.5 text-sm text-adv-gray transition-colors hover:text-adv-off-white"
            >
              Cancel
            </button>
          </div>

          {/* Preview */}
          {newName.trim() && (
            <div className="mt-2">
              <span className="text-xs text-adv-gray">Preview: </span>
              <span
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
                style={{
                  backgroundColor: newColor + '30',
                  color: newColor,
                  border: `1px solid ${newColor}60`,
                }}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: newColor }}
                />
                {newName}
              </span>
            </div>
          )}
        </div>
      )}

      {allLabels.length === 0 && !showCreate && (
        <p className="mt-2 text-center text-xs text-adv-gray">
          No labels created yet.
        </p>
      )}
    </div>
  );
}
