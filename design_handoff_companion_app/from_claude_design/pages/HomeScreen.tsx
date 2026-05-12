/**
 * HomeScreen — Daily digest, announcements, quick stats.
 * Adapts content based on org type.
 */

import { useState, useEffect } from 'react';
import { getSessionToken } from '../services/api';

interface Props {
  orgId: string;
  orgName: string;
  orgType: string;
  onNavigate: (tab: string) => void;
}

interface Announcement { id: string; title: string; content: string; priority: string; is_pinned: boolean; created_at: string; }

const ORG_GREETING: Record<string, string> = {
  school: 'Ready to learn?', ngo: 'How can we help today?', sports_club: 'Game on!',
  consulting: 'Your project at a glance', company: 'Good morning',
  default: 'Welcome back',
};

export default function HomeScreen({ orgId, orgName, orgType, onNavigate }: Props) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getSessionToken();
    Promise.all([
      fetch(`/api/app/org/${orgId}/announcements`, { headers: { 'x-app-session': token || '' } })
        .then(r => r.ok ? r.json() : []).then(d => setAnnouncements(Array.isArray(d) ? d : [])),
    ]).catch(() => {}).finally(() => setLoading(false));
  }, [orgId]);

  const greeting = ORG_GREETING[orgType] || ORG_GREETING.default;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-2xl px-4 py-5 space-y-5">
        {/* Greeting */}
        <div>
          <h1 className="text-xl font-bold text-adv-off-white">{orgName}</h1>
          <p className="text-sm text-adv-gray">{greeting}</p>
        </div>

        {/* Quick actions grid */}
        <div className="grid grid-cols-2 gap-2.5">
          <QuickAction icon="💬" label="Ask anything" desc="AI-powered chat" onClick={() => onNavigate('chat')} />
          <QuickAction icon="📅" label="Schedule" desc="Deadlines & events" onClick={() => onNavigate('schedule')} />
          <QuickAction icon="✅" label="Tasks" desc="Action items" onClick={() => onNavigate('tasks')} />
          <QuickAction icon="🔍" label="Research" desc="Pathfinder search" onClick={() => onNavigate('search')} />
        </div>

        {/* Announcements */}
        {announcements.length > 0 && (
          <div>
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-adv-gray">Announcements</h2>
            <div className="space-y-2">
              {announcements.slice(0, 5).map(a => (
                <div key={a.id} className={`rounded-xl border p-4 ${
                  a.priority === 'urgent' ? 'border-adv-red/30 bg-adv-red/5' :
                  a.priority === 'high' ? 'border-adv-gold/30 bg-adv-gold/5' :
                  'border-border bg-adv-card'
                }`}>
                  <div className="flex items-center gap-2 mb-1">
                    {a.is_pinned && <span className="text-xs">📌</span>}
                    <h3 className="text-sm font-medium text-adv-off-white">{a.title}</h3>
                  </div>
                  <p className="text-xs text-adv-gray leading-relaxed line-clamp-3">{a.content}</p>
                  <p className="mt-2 text-[10px] text-adv-gray/50">{new Date(a.created_at).toLocaleDateString()}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Feature cards based on org type */}
        <div>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-adv-gray">Explore</h2>
          <div className="space-y-2">
            <FeatureCard icon="📊" title="Markets Intelligence" desc="ANTON 100 index, predictions, analysis" onClick={() => onNavigate('markets')} />
            <FeatureCard icon="📡" title="Horizon Radar" desc="Regulatory signals & compliance alerts" onClick={() => onNavigate('radar')} />
            <FeatureCard icon="📄" title="Documents" desc="Track required documents & status" onClick={() => onNavigate('docs')} />
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickAction({ icon, label, desc, onClick }: { icon: string; label: string; desc: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-adv-card p-4 transition hover:border-adv-teal/30 active:scale-[0.97]">
      <span className="text-2xl">{icon}</span>
      <span className="text-xs font-medium text-adv-off-white">{label}</span>
      <span className="text-[10px] text-adv-gray">{desc}</span>
    </button>
  );
}

function FeatureCard({ icon, title, desc, onClick }: { icon: string; title: string; desc: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-xl border border-border bg-adv-card px-4 py-3 text-left transition hover:border-adv-teal/20 active:scale-[0.98]">
      <span className="text-xl">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-adv-off-white">{title}</div>
        <div className="text-[10px] text-adv-gray">{desc}</div>
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-adv-gray/40"><path d="M9 18l6-6-6-6"/></svg>
    </button>
  );
}
