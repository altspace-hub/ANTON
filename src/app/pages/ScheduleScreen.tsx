/**
 * ScheduleScreen — Deadlines (Evolution light theme).
 *
 * May-3 IRE pass: light token migration; deadline rows now in a single
 * grouped card with proper severity treatment.
 */

import { useState, useEffect } from 'react';
import { getOrgMorningBrief } from '../services/api';
import { Ico, Pill, Spinner } from '../components/ui';

interface Props { orgId: string; }

interface Deadline { id: string; title: string; due_date: string; status: string; priority: string; }

function priorityTone(p: string): 'red' | 'gold' | 'neutral' {
  if (p === 'high' || p === 'critical') return 'red';
  if (p === 'medium' || p === 'normal') return 'gold';
  return 'neutral';
}

export default function ScheduleScreen({ orgId }: Props) {
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getOrgMorningBrief(orgId)
      .then(data => {
        if (cancelled) return;
        const all = [
          ...((data.overdue ?? []) as Deadline[]),
          ...((data.atRisk ?? []) as Deadline[]),
          ...((data.upcoming ?? []) as Deadline[]),
        ];
        setDeadlines(all);
        setError(null);
      })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load schedule'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [orgId]);

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="flex flex-1 flex-col overflow-hidden" style={{ background: 'var(--color-bg)', minHeight: 0 }}>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-5 px-4 pb-10 pt-5">
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text)', letterSpacing: '-0.5px', lineHeight: 1.1 }}>
            Schedule
          </h1>

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
          ) : deadlines.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <span className="mb-3 inline-flex" style={{ color: 'var(--color-text-faint)' }}>
                <Ico name="calendar" size={28} />
              </span>
              <p className="text-[15px] font-semibold" style={{ color: 'var(--color-text)' }}>
                No upcoming deadlines
              </p>
              <p
                className="mt-1 max-w-[280px] text-[13px]"
                style={{ color: 'var(--color-text-muted)' }}
              >
                Deadlines from your ANTON workspace will appear here.
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
              {deadlines.map((d, i) => {
                const overdue = d.due_date && d.due_date < today;
                return (
                  <div
                    key={d.id}
                    className="px-3.5 py-3"
                    style={{
                      borderTop: i > 0 ? '1px solid var(--color-border-soft)' : 'none',
                      background: overdue ? 'var(--color-red-dim)' : 'transparent',
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className="text-[14px] font-semibold leading-tight"
                        style={{ color: overdue ? 'var(--color-red)' : 'var(--color-text)' }}
                      >
                        {d.title}
                      </span>
                      {d.priority && <Pill tone={priorityTone(d.priority)} mono>{d.priority.toUpperCase()}</Pill>}
                    </div>
                    {d.due_date && (
                      <p
                        className="mt-1 text-[11.5px]"
                        style={{ color: overdue ? 'var(--color-red)' : 'var(--color-text-muted)' }}
                      >
                        {overdue ? 'Overdue · ' : ''}{new Date(d.due_date).toLocaleDateString()}
                      </p>
                    )}
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
