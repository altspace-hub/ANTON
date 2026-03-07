import { useState, useEffect, useCallback } from 'react';
import { Check, Plus, Loader2 } from 'lucide-react';
import type { Deadline } from './types';
import { PRIORITY_CONFIG, apiGet, apiPost, formatRelativeDue } from './types';

interface SubtaskListProps {
  parentId: string;
  onSubtaskChange?: () => void;
}

export default function SubtaskList({
  parentId,
  onSubtaskChange,
}: SubtaskListProps) {
  const [subtasks, setSubtasks] = useState<Deadline[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const loadSubtasks = useCallback(async () => {
    try {
      const data = await apiGet<Deadline[]>(
        `/api/deadlines/${parentId}/subtasks`
      );
      setSubtasks(data);
    } catch (err) {
      console.error('Failed to load subtasks:', err);
    } finally {
      setLoading(false);
    }
  }, [parentId]);

  useEffect(() => {
    loadSubtasks();
  }, [loadSubtasks]);

  const completedCount = subtasks.filter(
    (s) => s.status === 'completed'
  ).length;
  const totalCount = subtasks.length;
  const progressPct = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  async function toggleComplete(subtask: Deadline) {
    setTogglingId(subtask.id);
    try {
      if (subtask.status === 'completed') {
        // Un-complete: set back to upcoming
        await apiPost(`/api/deadlines/${subtask.id}/complete`, {
          undo: true,
        });
      } else {
        await apiPost(`/api/deadlines/${subtask.id}/complete`, {});
      }
      await loadSubtasks();
      onSubtaskChange?.();
    } catch (err) {
      console.error('Failed to toggle subtask:', err);
    } finally {
      setTogglingId(null);
    }
  }

  async function addSubtask() {
    if (!newTitle.trim()) return;
    setAdding(true);
    try {
      await apiPost('/api/deadlines', {
        title: newTitle.trim(),
        parent_id: parentId,
        priority: 'medium',
        category: 'task',
        source_type: 'manual',
        due_date: new Date().toISOString().slice(0, 10),
      });
      setNewTitle('');
      await loadSubtasks();
      onSubtaskChange?.();
    } catch (err) {
      console.error('Failed to add subtask:', err);
    } finally {
      setAdding(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addSubtask();
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-adv-gray" />
      </div>
    );
  }

  return (
    <div>
      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs text-adv-gray">
            <span>
              {completedCount}/{totalCount} subtasks done
            </span>
            <span>{Math.round(progressPct)}%</span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-adv-dark">
            <div
              className={`h-full rounded-full transition-all ${
                progressPct === 100
                  ? 'bg-adv-green'
                  : progressPct > 50
                  ? 'bg-adv-teal'
                  : 'bg-adv-blue'
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Subtask list */}
      <div className="flex flex-col gap-1">
        {subtasks.map((st) => {
          const prio = PRIORITY_CONFIG[st.priority];
          const isCompleted = st.status === 'completed';
          const isToggling = togglingId === st.id;

          return (
            <div
              key={st.id}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-adv-dark-2"
            >
              {/* Checkbox */}
              <button
                onClick={() => toggleComplete(st)}
                disabled={isToggling}
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                  isCompleted
                    ? 'border-adv-green bg-adv-green/20 text-adv-green'
                    : 'border-adv-gray-med text-transparent hover:border-adv-teal hover:text-adv-teal'
                }`}
              >
                {isToggling ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Check className="h-3 w-3" />
                )}
              </button>

              {/* Title */}
              <span
                className={`flex-1 text-sm ${
                  isCompleted
                    ? 'text-adv-gray line-through'
                    : 'text-adv-off-white'
                }`}
              >
                {st.title}
              </span>

              {/* Priority dot */}
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${prio.dot}`}
                title={prio.label}
              />

              {/* Due date */}
              {st.due_date && (
                <span className="shrink-0 text-xs text-adv-gray">
                  {formatRelativeDue(st.due_date)}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Add subtask */}
      <div className="mt-2 flex items-center gap-2">
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add subtask..."
          className="flex-1 rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
        />
        <button
          onClick={addSubtask}
          disabled={!newTitle.trim() || adding}
          className="flex items-center gap-1 rounded-lg bg-adv-teal/10 px-3 py-2 text-sm font-medium text-adv-teal transition-colors hover:bg-adv-teal/20 disabled:opacity-40"
        >
          {adding ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Add
        </button>
      </div>

      {totalCount === 0 && (
        <p className="mt-2 text-center text-xs text-adv-gray">
          No subtasks yet. Add one above.
        </p>
      )}
    </div>
  );
}
