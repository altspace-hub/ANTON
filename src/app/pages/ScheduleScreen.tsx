/**
 * ScheduleScreen — Deadlines (read + write).
 *
 * v2: phone-on-the-run write capability:
 *   - Quick-add input at the top (title + due-date today/tomorrow/+7d
 *     fast-pick chips) → POST /api/app/org/:orgId/deadlines
 *   - Checkbox on each row → POST /api/app/org/:orgId/deadlines/:id/complete
 *
 * The morning brief feed already merges overdue + at-risk + upcoming —
 * we re-fetch after every write so the list always reflects truth.
 */

import { useState, useEffect } from 'react';
import { getOrgMorningBrief, createOrgDeadline, completeOrgDeadline } from '../services/api';
import { Btn, Ico, Pill, Spinner, ErrorPill } from '../components/ui';
import { tick, success as hapticSuccess, error as hapticError } from '../services/haptics';

interface Props { orgId: string; }

interface Deadline { id: string; title: string; due_date: string; status: string; priority: string; }

function priorityTone(p: string): 'red' | 'gold' | 'neutral' {
  if (p === 'high' || p === 'critical') return 'red';
  if (p === 'medium' || p === 'normal') return 'gold';
  return 'neutral';
}

function dueDateForChip(chip: 'today' | 'tomorrow' | 'week'): string {
  const d = new Date();
  if (chip === 'tomorrow') d.setDate(d.getDate() + 1);
  if (chip === 'week') d.setDate(d.getDate() + 7);
  d.setHours(17, 0, 0, 0);
  return d.toISOString();
}

export default function ScheduleScreen({ orgId }: Props) {
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [draft, setDraft] = useState('');
  const [draftDue, setDraftDue] = useState<'today' | 'tomorrow' | 'week'>('today');
  const [adding, setAdding] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getOrgMorningBrief(orgId)
      .then(data => {
        if (cancelled) return;
        const all = [
          ...((data.overdue ?? []) as Deadline[]),
          ...((data.atRisk ?? []) as Deadline[]),
          ...((data.upcoming ?? []) as Deadline[]),
        ];
        setDeadlines(all.filter(d => d.status !== 'completed'));
      })
      .catch(() => { if (!cancelled) setError('Couldn\'t load schedule.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [orgId, reloadTick]);

  async function add() {
    if (!draft.trim() || adding) return;
    setAdding(true);
    void tick();
    try {
      await createOrgDeadline(orgId, {
        title: draft.trim(),
        due_date: dueDateForChip(draftDue),
        priority: 'medium',
      });
      void hapticSuccess();
      setDraft('');
      setReloadTick(t => t + 1);
    } catch (e) {
      void hapticError();
      setError(e instanceof Error ? e.message : 'Failed to add deadline');
    }
    setAdding(false);
  }

  async function complete(id: string) {
    setCompletingId(id);
    void tick();
    try {
      await completeOrgDeadline(orgId, id);
      void hapticSuccess();
      // Optimistic remove
      setDeadlines(prev => prev.filter(d => d.id !== id));
      setReloadTick(t => t + 1);
    } catch {
      void hapticError();
    }
    setCompletingId(null);
  }

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="flex flex-1 flex-col overflow-hidden" style={{ background: 'var(--color-bg)', minHeight: 0 }}>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-4 px-4 pb-10 pt-5">
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text)', letterSpacing: '-0.5px', lineHeight: 1.1 }}>
            Schedule
          </h1>

          {/* Quick-add deadline */}
          <div
            className="rounded-[var(--radius-r2)] p-3"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          >
            <div className="flex gap-2">
              <label htmlFor="schedule-add" className="sr-only">New deadline</label>
              <input
                id="schedule-add"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void add(); } }}
                placeholder="What needs to happen?"
                className="flex-1 rounded-[var(--radius-r2)] px-3 text-[14px] focus:outline-none"
                style={{
                  background: 'var(--color-bg)',
                  color: 'var(--color-text)',
                  border: '1px solid var(--color-border)',
                  height: 40,
                }}
              />
              <Btn variant="primary" size="md" onClick={() => void add()} disabled={!draft.trim() || adding}>
                {adding ? '…' : 'Add'}
              </Btn>
            </div>
            <div className="mt-2 flex gap-1.5">
              {(['today', 'tomorrow', 'week'] as const).map(chip => {
                const active = draftDue === chip;
                const label = chip === 'today' ? 'Today' : chip === 'tomorrow' ? 'Tomorrow' : 'This week';
                return (
                  <button
                    key={chip}
                    onClick={() => setDraftDue(chip)}
                    className="rounded-full px-3 py-1 text-[11px] font-semibold transition active:scale-[0.97]"
                    style={{
                      background: active ? 'var(--color-accent)' : 'var(--color-bg)',
                      color: active ? 'var(--color-accent-fg)' : 'var(--color-text-muted)',
                      border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {error && <ErrorPill message={error} onRetry={() => setReloadTick(t => t + 1)} />}

          {loading ? (
            <div className="flex justify-center py-12">
              <Spinner size="lg" />
            </div>
          ) : deadlines.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <span className="mb-3 inline-flex" style={{ color: 'var(--color-text-faint)' }}>
                <Ico name="calendar" size={28} />
              </span>
              <p className="text-[15px] font-semibold" style={{ color: 'var(--color-text)' }}>
                Nothing on the schedule
              </p>
              <p className="mt-1 max-w-[280px] text-[13px]" style={{ color: 'var(--color-text-muted)' }}>
                Add a deadline above or wait for one to sync from your desktop ANTON.
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
                const busy = completingId === d.id;
                return (
                  <div
                    key={d.id}
                    className="flex items-start gap-3 px-3.5 py-3"
                    style={{
                      borderTop: i > 0 ? '1px solid var(--color-border-soft)' : 'none',
                      background: overdue ? 'var(--color-red-dim)' : 'transparent',
                    }}
                  >
                    {/* Complete checkbox */}
                    <button
                      onClick={() => void complete(d.id)}
                      disabled={busy}
                      aria-label={`Mark "${d.title}" complete`}
                      className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-[5px] transition active:scale-95 disabled:opacity-50"
                      style={{
                        background: 'var(--color-surface)',
                        border: `1.5px solid ${overdue ? 'var(--color-red)' : 'var(--color-border)'}`,
                      }}
                    >
                      {busy && <Spinner size="xs" tone="accent" />}
                    </button>
                    <div className="min-w-0 flex-1">
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
