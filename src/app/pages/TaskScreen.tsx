/**
 * TaskScreen — Action items with quick-add.
 */

import { useState, useEffect } from 'react';
import { getAuthHeader, fetchWithAuth } from '../services/api';

interface Props { orgId: string; }

interface Task { id: string; title: string; status: string; priority: string; due_date: string | null; created_at: string; }

export default function TaskScreen({ orgId }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTask, setNewTask] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetch('/api/task-agent/tasks', { headers: getAuthHeader() })
      .then(r => r.ok ? r.json() : { tasks: [] })
      .then(data => setTasks(Array.isArray(data.tasks) ? data.tasks : Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orgId]);

  async function handleAdd() {
    if (!newTask.trim()) return;
    setAdding(true);
    try {
      await fetchWithAuth('/api/task-agent/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTask.trim(),
          description: newTask.trim(),
          source: 'companion-app',
          priority: 'normal',
          tags: ['companion'],
        }),
      });
      setNewTask('');
      // Reload
      const r = await fetch('/api/task-agent/tasks', { headers: getAuthHeader() });
      if (r.ok) { const d = await r.json(); setTasks(d.tasks || d || []); }
    } catch {}
    setAdding(false);
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-2xl px-4 py-5 space-y-5">
        <h1 className="text-lg font-bold text-adv-off-white">Tasks</h1>

        {/* Quick add */}
        <div className="flex gap-2">
          <input
            value={newTask}
            onChange={e => setNewTask(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="Quick add task..."
            className="flex-1 rounded-lg border border-border bg-adv-card px-4 py-3 text-sm text-adv-off-white placeholder-adv-gray/50 focus:border-adv-teal focus:outline-none"
          />
          <button onClick={handleAdd} disabled={adding || !newTask.trim()} className="rounded-lg bg-adv-teal px-4 py-3 text-sm font-medium text-adv-dark disabled:opacity-40">
            {adding ? '...' : 'Add'}
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-adv-teal border-t-transparent" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-16">
            <span className="text-3xl mb-3 block">✅</span>
            <p className="text-sm text-adv-gray">No tasks yet</p>
            <p className="text-xs text-adv-gray/60 mt-1">Add tasks above or use the AI chat to create them</p>
          </div>
        ) : (
          <div className="space-y-2">
            {tasks.map(t => (
              <div key={t.id} className={`rounded-xl border px-4 py-3 ${
                t.status === 'completed' ? 'border-adv-green/20 bg-adv-green/5 opacity-60' : 'border-border bg-adv-card'
              }`}>
                <div className="flex items-center gap-3">
                  <span className={`h-5 w-5 rounded-full border-2 flex items-center justify-center text-[10px] ${
                    t.status === 'completed' ? 'border-adv-green bg-adv-green text-adv-dark' : 'border-adv-gray/40'
                  }`}>
                    {t.status === 'completed' && '✓'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${t.status === 'completed' ? 'line-through text-adv-gray' : 'text-adv-off-white'}`}>{t.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[10px] ${
                        t.priority === 'high' || t.priority === 'critical' ? 'text-adv-red' :
                        t.priority === 'normal' ? 'text-adv-gray' : 'text-adv-gray/60'
                      }`}>{t.priority}</span>
                      {t.due_date && <span className="text-[10px] text-adv-gray">{new Date(t.due_date).toLocaleDateString()}</span>}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
