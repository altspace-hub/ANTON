/**
 * ConnectionsPage — List of connected organisations.
 * Premium ANTON dark design.
 */

import { useState, useEffect } from 'react';
import { getConnections } from '../services/api';
import { getIdentity } from '../services/identity';

interface Props {
  onSelectOrg: (orgId: string, orgName?: string) => void;
  onJoinNew: () => void;
  onProfile: () => void;
}

interface Connection {
  id: string; name: string; org_type: string; description: string | null;
  welcome_message: string | null; role: string; joined_at: string;
}

const ORG_EMOJI: Record<string, string> = {
  school: '🎓', ngo: '🌍', sports_club: '⚽', consulting: '💼', consulting_firm: '💼',
  company: '🏢', community: '🤝', government: '🏛️', healthcare: '🏥', other: '📋',
};

export default function ConnectionsPage({ onSelectOrg, onJoinNew, onProfile }: Props) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const identity = getIdentity();

  useEffect(() => {
    getConnections().then(setConnections).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex min-h-dvh flex-col bg-adv-dark safe-top safe-bottom">
      {/* Header */}
      <div className="border-b border-border">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-adv-teal/10">
              <span className="text-sm font-black text-adv-teal">A</span>
            </div>
            <h1 className="text-lg font-bold text-adv-off-white">ANTON</h1>
          </div>
          <p className="mt-0.5 text-xs text-adv-gray">Hello, {identity?.displayName || 'User'}</p>
        </div>
        <button
          onClick={onProfile}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-adv-teal/20 to-adv-teal/5 border border-adv-teal/20 text-sm font-bold text-adv-teal transition hover:border-adv-teal/40"
        >
          {(identity?.displayName || '?')[0].toUpperCase()}
        </button>
      </div>

      {/* Content */}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-2xl px-5 py-5">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xs font-medium uppercase tracking-wider text-adv-gray">Your Organisations</h2>
          <button
            onClick={onJoinNew}
            className="flex items-center gap-1.5 rounded-lg bg-adv-teal/10 px-3 py-1.5 text-xs font-medium text-adv-teal transition hover:bg-adv-teal/20 active:scale-95"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Join
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <span className="h-7 w-7 animate-spin rounded-full border-2 border-adv-teal border-t-transparent" />
          </div>
        ) : connections.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-adv-card/20 py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-adv-teal/10">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-adv-teal">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
              </svg>
            </div>
            <p className="mb-1 text-sm font-medium text-adv-off-white">No organisations yet</p>
            <p className="mb-5 text-xs text-adv-gray">Scan a QR code or enter an invitation token</p>
            <button
              onClick={onJoinNew}
              className="rounded-xl bg-adv-teal px-8 py-3 text-sm font-semibold text-adv-dark transition hover:bg-adv-teal-dark active:scale-[0.98]"
            >
              Join Organisation
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {connections.map(conn => (
              <button
                key={conn.id}
                onClick={() => onSelectOrg(conn.id, conn.name)}
                className="flex w-full items-center gap-4 rounded-2xl border border-border bg-adv-card p-4 text-left transition-all hover:border-adv-teal/30 hover:shadow-lg hover:shadow-adv-teal/5 active:scale-[0.98]"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-adv-dark-2 text-2xl">
                  {ORG_EMOJI[conn.org_type] || '📋'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-adv-off-white">{conn.name}</div>
                  {conn.description && (
                    <div className="mt-0.5 truncate text-xs text-adv-gray">{conn.description}</div>
                  )}
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="rounded-full bg-adv-dark-2 px-2 py-0.5 text-[10px] text-adv-gray">{conn.org_type}</span>
                    <span className="rounded-full bg-adv-teal/10 px-2 py-0.5 text-[10px] text-adv-teal">{conn.role}</span>
                  </div>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-adv-gray/40 shrink-0"><path d="M9 18l6-6-6-6"/></svg>
              </button>
            ))}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
