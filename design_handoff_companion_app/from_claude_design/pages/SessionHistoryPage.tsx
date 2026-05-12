/**
 * SessionHistoryPage — Past conversations with an organisation.
 */

import { useState, useEffect } from 'react';
import { getSessions } from '../services/api';

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

export default function SessionHistoryPage({ orgId, orgName, onSelectSession, onBack }: Props) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSessions(orgId)
      .then(data => setSessions(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orgId]);

  return (
    <div className="flex min-h-dvh flex-col bg-adv-dark safe-top safe-bottom">
      {/* Header */}
      <div className="border-b border-border bg-adv-dark-2">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-4">
          <button onClick={onBack} className="flex h-9 w-9 items-center justify-center rounded-lg bg-adv-card text-adv-gray transition hover:text-adv-off-white active:scale-95">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <div>
            <h1 className="text-sm font-semibold text-adv-off-white">Conversation History</h1>
            <p className="text-[10px] text-adv-gray">{orgName}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 py-5">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <span className="h-7 w-7 animate-spin rounded-full border-2 border-adv-teal border-t-transparent" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center py-20 text-center">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-3 text-adv-gray/40">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              <p className="text-sm text-adv-gray">No conversations yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sessions.map(session => (
                <button
                  key={session.id}
                  onClick={() => onSelectSession(session.id)}
                  className="flex w-full items-center gap-3 rounded-xl border border-border bg-adv-card px-4 py-3.5 text-left transition hover:border-adv-teal/20 active:scale-[0.98]"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-adv-dark-2">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-adv-gray">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-adv-off-white">{session.title || 'Untitled conversation'}</div>
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-adv-gray">
                      <span>{session.message_count} messages</span>
                      <span>&middot;</span>
                      <span>{new Date(session.updated_at).toLocaleDateString()}</span>
                      {session.resolved_module_id && (
                        <>
                          <span>&middot;</span>
                          <span className="text-adv-teal/60">{session.resolved_module_id}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-adv-gray/40 shrink-0"><path d="M9 18l6-6-6-6"/></svg>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
