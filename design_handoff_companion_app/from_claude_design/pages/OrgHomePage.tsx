/**
 * OrgHomePage — Org landing page with intent categories, recent sessions, and chat entry.
 * The "smart front door" per the spec.
 */

import { useState, useEffect } from 'react';
import { getOrgProfile, getSessions } from '../services/api';
import { getSessionToken } from '../services/api';

interface Props {
  orgId: string;
  onChat: (sessionId?: string) => void;
  onBack: () => void;
}

interface OrgInfo {
  name: string;
  org_type: string;
  description: string | null;
  welcome_message: string | null;
}

interface Intent {
  id: string;
  name: string;
  description: string | null;
  icon: string;
}

interface Session {
  id: string;
  title: string;
  message_count: number;
  updated_at: string;
  resolved_area_id: string | null;
}

const INTENT_EMOJI: Record<string, string> = {
  MessageSquare: '💬', BookOpen: '📖', HelpCircle: '❓', FileText: '📄',
  Search: '🔍', Calendar: '📅', Users: '👥', Shield: '🛡️', Heart: '❤️',
  Briefcase: '💼', GraduationCap: '🎓', Globe: '🌍',
};

export default function OrgHomePage({ orgId, onChat, onBack }: Props) {
  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [intents, setIntents] = useState<Intent[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    Promise.all([
      getOrgProfile(orgId).then((data: Record<string, unknown>) => {
        const o = data as unknown as OrgInfo;
        setOrg(o);
        // Show welcome message on first visit to this org
        const key = `anton-welcomed-${orgId}`;
        if (o.welcome_message && !localStorage.getItem(key)) {
          setShowWelcome(true);
          localStorage.setItem(key, '1');
        }
      }),
      fetch(`/api/app/org/${orgId}/intents`, {
        headers: { 'x-app-session': getSessionToken() || '' },
      }).then(r => r.ok ? r.json() : []).then(setIntents),
      getSessions(orgId).then(s => setSessions(Array.isArray(s) ? s.slice(0, 5) : [])),
    ]).catch(() => {}).finally(() => setLoading(false));
  }, [orgId]);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-adv-dark">
        <span className="h-7 w-7 animate-spin rounded-full border-2 border-adv-teal border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-adv-dark safe-top safe-bottom">
      {/* Header */}
      <div className="border-b border-border bg-adv-dark-2">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-4">
          <button onClick={onBack} className="flex h-9 w-9 items-center justify-center rounded-lg bg-adv-card text-adv-gray transition hover:text-adv-off-white active:scale-95">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="truncate text-lg font-bold text-adv-off-white">{org?.name || 'Organisation'}</h1>
            <p className="truncate text-xs text-adv-gray">{org?.org_type}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 py-5 space-y-6">
          {/* Welcome message */}
          {showWelcome && org?.welcome_message && (
            <div className="rounded-2xl border border-adv-teal/20 bg-gradient-to-br from-adv-teal/10 to-adv-teal/5 p-5">
              <p className="text-sm text-adv-off-white leading-relaxed">{org.welcome_message}</p>
              <button onClick={() => setShowWelcome(false)} className="mt-3 text-xs text-adv-teal hover:text-adv-teal-dark transition">
                Got it
              </button>
            </div>
          )}

          {/* Description */}
          {org?.description && (
            <p className="text-sm text-adv-gray leading-relaxed">{org.description}</p>
          )}

          {/* Intent categories */}
          {intents.length > 0 && (
            <div>
              <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-adv-gray">How can we help?</h2>
              <div className="grid grid-cols-2 gap-2.5">
                {intents.map(intent => (
                  <button
                    key={intent.id}
                    onClick={() => onChat()}
                    className="flex flex-col items-start gap-2 rounded-xl border border-border bg-adv-card p-4 text-left transition-all hover:border-adv-teal/30 hover:shadow-lg hover:shadow-adv-teal/5 active:scale-[0.97]"
                  >
                    <span className="text-xl">{INTENT_EMOJI[intent.icon] || '💬'}</span>
                    <div>
                      <div className="text-sm font-medium text-adv-off-white">{intent.name}</div>
                      {intent.description && (
                        <div className="mt-0.5 text-[11px] text-adv-gray line-clamp-2">{intent.description}</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quick chat entry */}
          <button
            onClick={() => onChat()}
            className="flex w-full items-center gap-3 rounded-xl border border-adv-teal/30 bg-adv-teal/5 p-4 transition hover:bg-adv-teal/10 active:scale-[0.98]"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-adv-teal/10">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-adv-teal">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <div className="text-left">
              <div className="text-sm font-medium text-adv-teal">Start a conversation</div>
              <div className="text-xs text-adv-gray">Ask anything — the AI will route to the right expertise</div>
            </div>
          </button>

          {/* Recent sessions */}
          {sessions.length > 0 && (
            <div>
              <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-adv-gray">Recent Conversations</h2>
              <div className="space-y-2">
                {sessions.map(session => (
                  <button
                    key={session.id}
                    onClick={() => onChat(session.id)}
                    className="flex w-full items-center gap-3 rounded-xl border border-border bg-adv-card px-4 py-3 text-left transition hover:border-adv-teal/20 active:scale-[0.98]"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-adv-dark-2 text-adv-gray">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-adv-off-white">{session.title || 'Untitled'}</div>
                      <div className="text-[10px] text-adv-gray">
                        {session.message_count} messages &middot; {new Date(session.updated_at).toLocaleDateString()}
                      </div>
                    </div>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-adv-gray/40 shrink-0"><path d="M9 18l6-6-6-6"/></svg>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
