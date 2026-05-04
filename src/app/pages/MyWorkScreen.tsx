/**
 * MyWorkScreen — companion-app "browse what I've done" tile.
 *
 * Mirrors the desktop MyWorkPage's purpose: see all sessions you've
 * completed across modules, with search + module + time filter — so
 * you can pull up something you ran on your desktop while you're on
 * the run, or show it to someone in person.
 *
 * Tap a session → opens that session in the Chat tab so you can
 * read the full conversation + outputs.
 *
 * Data: GET /api/app/org/:orgId/work?q=<text>&module=<id>&since=<period>
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Ico, PageHeader, Pill, Spinner, ErrorPill, SectionLabel,
} from '../components/ui';
import { getOrgWork, type WorkSession } from '../services/api';

interface Props {
  orgId: string;
  onBack: () => void;
  onOpenSession: (sessionId: string) => void;
}

const SINCE_OPTIONS: Array<{ id: 'all' | 'today' | 'week' | 'month'; label: string }> = [
  { id: 'all',   label: 'All' },
  { id: 'today', label: 'Today' },
  { id: 'week',  label: 'This week' },
  { id: 'month', label: 'This month' },
];

function relativeTime(iso?: string): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export default function MyWorkScreen({ orgId, onBack, onOpenSession }: Props): JSX.Element {
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [since, setSince] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [moduleFilter, setModuleFilter] = useState<string>('');
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getOrgWork(orgId, { q: query, module: moduleFilter, since, limit: 100 })
      .then(d => { if (!cancelled) setSessions(Array.isArray(d.sessions) ? d.sessions : []); })
      .catch(() => { if (!cancelled) setError('Couldn\'t load your work history.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [orgId, query, moduleFilter, since, reloadTick]);

  const submitSearch = () => setQuery(draft.trim());

  // Module list from current results so the chip row stays relevant
  // to what's actually in the user's history.
  const moduleIds = useMemo(() => {
    return Array.from(new Set(sessions.map(s => s.module_id).filter((id): id is string => Boolean(id))));
  }, [sessions]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden" style={{ background: 'var(--color-bg)', minHeight: 0 }}>
      <PageHeader title="My Work" subtitle="Everything you've run on your ANTON" onBack={onBack} />

      {/* Search + time filter */}
      <div className="flex-shrink-0 space-y-2.5 px-4 pt-3">
        <div
          className="flex items-center gap-2 rounded-[var(--radius-r2)] px-3 py-2"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          <Ico name="search" color="var(--color-text-muted)" size={16} />
          <label htmlFor="work-search" className="sr-only">Search work</label>
          <input
            id="work-search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitSearch(); } }}
            placeholder="Search by title or note…"
            className="flex-1 bg-transparent text-[14px] focus:outline-none"
            style={{ color: 'var(--color-text)', minWidth: 0 }}
          />
          {draft && (
            <button
              onClick={() => { setDraft(''); setQuery(''); }}
              aria-label="Clear search"
              className="flex h-8 w-8 items-center justify-center"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <Ico name="x" size={14} />
            </button>
          )}
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          {SINCE_OPTIONS.map(o => {
            const active = since === o.id;
            return (
              <button
                key={o.id}
                onClick={() => setSince(o.id)}
                className="flex-shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold transition active:scale-[0.97]"
                style={{
                  background: active ? 'var(--color-accent)' : 'var(--color-surface)',
                  color: active ? 'var(--color-accent-fg)' : 'var(--color-text-body)',
                  border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
                }}
              >
                {o.label}
              </button>
            );
          })}
          {moduleFilter && (
            <button
              onClick={() => setModuleFilter('')}
              className="flex-shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold"
              style={{
                background: 'var(--color-accent-soft)',
                color: 'var(--color-accent)',
                border: '1px solid var(--color-accent-dim)',
              }}
            >
              <Ico name="x" size={11} color="currentColor" /> {moduleFilter}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-2 px-4 pb-10 pt-3">
          {error && (
            <ErrorPill message={error} onRetry={() => setReloadTick(t => t + 1)} />
          )}

          {loading ? (
            <div className="flex justify-center py-12">
              <Spinner size="lg" />
            </div>
          ) : sessions.length === 0 ? (
            <div
              className="rounded-[var(--radius-r3)] px-5 py-12 text-center"
              style={{
                background: 'var(--color-surface)',
                border: '1px dashed var(--color-border)',
              }}
            >
              <span className="mb-3 inline-flex" style={{ color: 'var(--color-text-faint)' }}>
                <Ico name="briefcase" size={28} />
              </span>
              <p className="text-[15px] font-semibold" style={{ color: 'var(--color-text)' }}>
                {query ? `Nothing matched "${query}"` : 'Nothing here yet'}
              </p>
              <p
                className="mx-auto mt-1 max-w-[280px] text-[13px] leading-relaxed"
                style={{ color: 'var(--color-text-muted)' }}
              >
                Sessions you complete on your desktop ANTON show up here — pull
                them up on the run or share them in person.
              </p>
            </div>
          ) : (
            <>
              <SectionLabel className="px-1">
                {sessions.length} session{sessions.length === 1 ? '' : 's'}
                {since !== 'all' && ` · ${SINCE_OPTIONS.find(o => o.id === since)?.label.toLowerCase()}`}
              </SectionLabel>

              {/* Quick module filter pills (from loaded results) */}
              {!moduleFilter && moduleIds.length > 1 && (
                <div className="flex flex-wrap gap-1.5 pb-1">
                  {moduleIds.slice(0, 6).map(id => (
                    <button
                      key={id}
                      onClick={() => setModuleFilter(id)}
                      className="rounded-full px-2.5 py-1 text-[11px] font-medium"
                      style={{
                        background: 'var(--color-surface)',
                        color: 'var(--color-text-muted)',
                        border: '1px solid var(--color-border)',
                      }}
                    >
                      {id}
                    </button>
                  ))}
                </div>
              )}

              {sessions.map(s => (
                <SessionRow key={s.id} s={s} onTap={() => onOpenSession(s.id)} />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SessionRow({ s, onTap }: { s: WorkSession; onTap: () => void }): JSX.Element {
  const meta: string[] = [];
  if (s.module_id) meta.push(s.module_id);
  if (s.message_count) meta.push(`${s.message_count} msg`);
  if (s.total_tokens && s.total_tokens > 0) {
    meta.push(s.total_tokens >= 1000 ? `${(s.total_tokens / 1000).toFixed(1)}k tok` : `${s.total_tokens} tok`);
  }
  return (
    <button
      onClick={onTap}
      className="flex w-full items-start gap-3 rounded-[var(--radius-r2)] p-3 text-left transition active:scale-[0.99]"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
      }}
    >
      <div className="min-w-0 flex-1">
        <div
          className="truncate text-[14px] font-semibold"
          style={{ color: 'var(--color-text)' }}
        >
          {s.title || 'Untitled session'}
        </div>
        {s.note && (
          <p
            className="mt-0.5 line-clamp-1 text-[12px]"
            style={{ color: 'var(--color-text-body)' }}
          >
            {s.note}
          </p>
        )}
        <div
          className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[11px]"
          style={{ color: 'var(--color-text-muted)' }}
        >
          <span>{relativeTime(s.updated_at || s.created_at)}</span>
          {meta.length > 0 && <span>·</span>}
          {meta.map((m, i) => (
            <span key={i}>{m}{i < meta.length - 1 ? ' ·' : ''}</span>
          ))}
        </div>
      </div>
      <Ico name="chevronRight" color="var(--color-text-faint)" size={18} />
    </button>
  );
}
