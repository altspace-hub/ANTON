/**
 * SessionHistoryPage — Past conversations (Claude-style flat rows).
 *
 * May-3 IRE pass: stripped icon tile + card border + chevron from each row.
 * Title + meta line + 1px divider, ~54px row height. Light theme tokens.
 */

import { useState, useEffect } from 'react';
import { getSessions } from '../services/api';
import { Ico, PageHeader, Spinner, ErrorPill } from '../components/ui';

interface Props {
  orgId: string;
  orgName: string;
  onSelectSession: (sessionId: string) => void;
  onBack: () => void;
}

interface Session {
  id: string;
  title: string;
  message_count: number;
  status: string;
  resolved_area_id: string | null;
  resolved_module_id: string | null;
  created_at: string;
  updated_at: string;
}

function relativeDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function SessionHistoryPage({ orgId, orgName, onSelectSession, onBack }: Props) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getSessions(orgId)
      .then(data => { if (!cancelled) setSessions(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setError('Couldn\'t load history.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [orgId, reloadTick]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden" style={{ background: 'var(--color-bg)', minHeight: 0 }}>
      <PageHeader title="History" subtitle={orgName} onBack={onBack} />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl">
          {error && (
            <div className="px-4 pt-4">
              <ErrorPill message={error} onRetry={() => setReloadTick(t => t + 1)} />
            </div>
          )}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Spinner size="lg" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center py-24 text-center">
              <span className="mb-3 inline-flex" style={{ color: 'var(--color-text-faint)' }}>
                <Ico name="message" size={28} />
              </span>
              <p className="text-[0.9375rem] font-semibold" style={{ color: 'var(--color-text)' }}>
                No conversations yet
              </p>
              <p
                className="mt-1 max-w-[260px] text-[0.8125rem]"
                style={{ color: 'var(--color-text-muted)' }}
              >
                Start a chat from the Chat tab and it'll appear here.
              </p>
            </div>
          ) : (
            <div>
              {sessions.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => onSelectSession(s.id)}
                  className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition active:bg-[var(--color-surface-alt)]"
                  style={{
                    borderTop: i > 0 ? '1px solid var(--color-border-soft)' : 'none',
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <div
                      className="truncate text-[14.5px] font-semibold"
                      style={{ color: 'var(--color-text)', lineHeight: 1.3 }}
                    >
                      {s.title || 'Untitled conversation'}
                    </div>
                    <div
                      className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px]"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      <span>{s.message_count} {s.message_count === 1 ? 'message' : 'messages'}</span>
                      {s.resolved_module_id && (
                        <>
                          <span style={{ color: 'var(--color-text-faint)' }}>·</span>
                          <span style={{ color: 'var(--color-accent)' }}>{s.resolved_module_id}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <span
                    className="flex-shrink-0 font-mono text-[0.6875rem]"
                    style={{ color: 'var(--color-text-faint)', paddingTop: 2 }}
                  >
                    {relativeDate(s.updated_at)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
