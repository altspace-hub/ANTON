/**
 * TaskScreen — Action items with quick-add (Evolution light theme).
 *
 * May-3 IRE pass: full migration off legacy adv-* classes, standardized
 * empty state, replaced ✅ emoji with Ico, replaced ✓ checkmark with Ico.
 */

import { useState, useEffect } from 'react';
import { getOrgTasks, createOrgTask } from '../services/api';
import { Ico, Pill, Spinner } from '../components/ui';

interface Props { orgId: string; }

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  created_at: string;
}

export default function TaskScreen({ orgId }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newTask, setNewTask] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getOrgTasks(orgId, { limit: 50 })
      .then(data => {
        if (cancelled) return;
        setTasks(Array.isArray(data.tasks) ? (data.tasks as unknown as Task[]) : []);
        setError(null);
      })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load tasks'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [orgId]);

  async function handleAdd() {
    if (!newTask.trim()) return;
    setAdding(true);
    try {
      await createOrgTask(orgId, { title: newTask.trim(), priority: 'normal' });
      setNewTask('');
      const data = await getOrgTasks(orgId, { limit: 50 });
      setTasks(Array.isArray(data.tasks) ? (data.tasks as unknown as Task[]) : []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add task');
    }
    setAdding(false);
  }

  function priorityTone(p: string): 'red' | 'gold' | 'neutral' {
    if (p === 'high' || p === 'critical') return 'red';
    if (p === 'normal') return 'gold';
    return 'neutral';
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden" style={{ background: 'var(--color-bg)', minHeight: 0 }}>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-5 px-4 pb-10 pt-5">
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text)', letterSpacing: '-0.5px', lineHeight: 1.1 }}>
            Tasks
          </h1>

          {/* Quick add */}
          <div className="flex gap-2">
            <label htmlFor="task-quick-add" className="sr-only">Quick add task</label>
            <input
              id="task-quick-add"
              value={newTask}
              onChange={e => setNewTask(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder="Quick add task…"
              className="flex-1 rounded-[var(--radius-r2)] px-4 text-[14px] focus:outline-none"
              style={{
                background: 'var(--color-surface)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border)',
                height: 44,
              }}
            />
            <button
              onClick={handleAdd}
              disabled={adding || !newTask.trim()}
              className="rounded-[var(--radius-r2)] px-4 text-[13px] font-semibold transition active:scale-[0.97] disabled:opacity-40"
              style={{
                background: 'var(--color-accent)',
                color: 'var(--color-accent-fg)',
                height: 44,
              }}
            >
              {adding ? '…' : 'Add'}
            </button>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-[var(--radius-r2)] px-3 py-2 text-[12px]"
              style={{
                background: 'var(--color-red-dim)',
                color: 'var(--color-red)',
                border: '1px solid var(--color-red)',
              }}
            >
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-12">
              <Spinner size="lg" />
            </div>
          ) : tasks.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <span
                className="mb-3 inline-flex"
                style={{ color: 'var(--color-text-faint)' }}
              >
                <Ico name="checkSquare" size={28} />
              </span>
              <p className="text-[15px] font-semibold" style={{ color: 'var(--color-text)' }}>
                No tasks yet
              </p>
              <p
                className="mt-1 max-w-[280px] text-[13px]"
                style={{ color: 'var(--color-text-muted)' }}
              >
                Add tasks above or ask ANTON in chat.
              </p>
            </div>
          ) : (
            <div
              className="overflow-hidden rounded-[var(--radius-r2)]"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
              }}
            >
              {tasks.map((t, i) => {
                const done = t.status === 'completed';
                return (
                  <div
                    key={t.id}
                    className="flex items-start gap-3 px-3.5 py-3"
                    style={{
                      borderTop: i > 0 ? '1px solid var(--color-border-soft)' : 'none',
                      opacity: done ? 0.55 : 1,
                    }}
                  >
                    <span
                      className="mt-0.5 flex flex-shrink-0 items-center justify-center rounded-full"
                      style={{
                        width: 20, height: 20,
                        background: done ? 'var(--color-green)' : 'transparent',
                        border: done ? 'none' : '1.5px solid var(--color-border)',
                        color: 'var(--color-accent-fg)',
                      }}
                    >
                      {done && <Ico name="check" size={12} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        className="text-[14px] leading-tight"
                        style={{
                          color: 'var(--color-text)',
                          fontWeight: 500,
                          textDecoration: done ? 'line-through' : 'none',
                        }}
                      >
                        {t.title}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <Pill tone={priorityTone(t.priority)} mono>
                          {t.priority.toUpperCase()}
                        </Pill>
                        {t.due_date && (
                          <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                            Due {new Date(t.due_date).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
