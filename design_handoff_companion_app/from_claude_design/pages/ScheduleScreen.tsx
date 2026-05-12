/**
 * ScheduleScreen — Deadlines, events, and calendar view.
 */

import { useState, useEffect } from 'react';
import { getAuthHeader } from '../services/api';

interface Props { orgId: string; }

interface Deadline { id: string; title: string; due_date: string; status: string; priority: string; }

export default function ScheduleScreen({ orgId }: Props) {
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Try org-scoped deadlines first, fall back to global
    fetch('/api/deadlines/morning-brief', { headers: getAuthHeader() })
      .then(r => r.ok ? r.json() : { overdue: [], atRisk: [], upcoming: [] })
      .then(data => {
        const all = [...(data.overdue || []), ...(data.atRisk || []), ...(data.upcoming || [])];
        setDeadlines(all);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orgId]);

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-2xl px-4 py-5 space-y-5">
        <h1 className="text-lg font-bold text-adv-off-white">Schedule</h1>

        {loading ? (
          <div className="flex justify-center py-12">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-adv-teal border-t-transparent" />
          </div>
        ) : deadlines.length === 0 ? (
          <div className="text-center py-16">
            <span className="text-3xl mb-3 block">📅</span>
            <p className="text-sm text-adv-gray">No upcoming deadlines</p>
            <p className="text-xs text-adv-gray/60 mt-1">Deadlines from your ANTON workspace will appear here</p>
          </div>
        ) : (
          <div className="space-y-2">
            {deadlines.map((d: Deadline) => {
              const overdue = d.due_date && d.due_date < today;
              return (
                <div key={d.id} className={`rounded-xl border px-4 py-3 ${
                  overdue ? 'border-adv-red/30 bg-adv-red/5' : 'border-border bg-adv-card'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-adv-off-white">{d.title}</span>
                    {d.priority && (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        d.priority === 'high' || d.priority === 'critical' ? 'bg-adv-red/10 text-adv-red' :
                        d.priority === 'medium' ? 'bg-adv-gold/10 text-adv-gold' :
                        'bg-adv-gray/10 text-adv-gray'
                      }`}>{d.priority}</span>
                    )}
                  </div>
                  {d.due_date && (
                    <p className={`mt-1 text-xs ${overdue ? 'text-adv-red' : 'text-adv-gray'}`}>
                      {overdue ? 'Overdue — ' : ''}{new Date(d.due_date).toLocaleDateString()}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
