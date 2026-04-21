// ── FriendsHomePage.tsx ────────────────────────────────────────────────────
// /friends — consumer social landing. Contact list + invite button +
// reverse-chrono activity feed (NO algorithmic ordering).

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, UserPlus, Bell, ShieldAlert } from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';
import { useSettingsStore } from '@/stores/useSettingsStore';

interface Contact {
  id: string;
  display_name: string;
  peer_public_key: string;
  contact_status: string;
  activity_share_setting: 'private' | 'me' | 'friends-circle';
  muted: boolean;
}

interface ActivityEvent {
  id: string;
  source_user_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  visibility: string;
  created_at: string;
}

interface PendingApproval {
  id: string;
  subject_kind: string;
  subject_summary: string;
  requested_at: string;
}

export default function FriendsHomePage() {
  const appMode = useSettingsStore(s => s.appMode);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [c, a] = await Promise.all([
      fetchWithAuth('/api/friends/contacts').then(r => r.ok ? r.json() : { contacts: [] }),
      fetchWithAuth('/api/friends/activity').then(r => r.ok ? r.json() : { events: [] }),
    ]);
    setContacts(c.contacts ?? []);
    setActivity(a.events ?? []);
    if (appMode === 'school') {
      const p = await fetchWithAuth('/api/friends/approvals/pending').then(r => r.ok ? r.json() : { approvals: [] });
      setPendingApprovals(p.approvals ?? []);
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, [appMode]);

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users size={22} className="text-adv-teal" />
            <div>
              <h1 className="text-2xl font-semibold">Friends</h1>
              <p className="text-xs text-adv-gray">Social without the surveillance. Reverse-chronological. Yours.</p>
            </div>
          </div>
          <Link
            to="/friends/invite"
            className="inline-flex items-center gap-2 px-4 py-2 bg-adv-teal text-adv-dark rounded text-sm font-medium"
          >
            <UserPlus size={16} /> Invite
          </Link>
        </header>

        {appMode === 'school' && (
          <section className="rounded-lg border border-adv-gold/40 bg-adv-gold/5 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-adv-gold">
              <ShieldAlert size={16} /> Guardian oversight is active
            </div>
            <p className="text-xs text-adv-gray mt-1">
              Friend invites require guardian approval before they're visible to you.
            </p>
            {pendingApprovals.length > 0 && (
              <div className="mt-3">
                <div className="text-xs font-medium text-adv-off-white mb-1">
                  Pending approvals ({pendingApprovals.length})
                </div>
                <ul className="space-y-1">
                  {pendingApprovals.map(a => (
                    <li key={a.id} className="text-xs text-adv-gray">{a.subject_summary}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <section className="md:col-span-1 rounded-lg border border-border bg-adv-card p-4">
            <div className="text-sm font-medium mb-3">Contacts ({contacts.length})</div>
            {loading && <div className="text-xs text-adv-gray">Loading…</div>}
            {!loading && contacts.length === 0 && (
              <div className="text-xs text-adv-gray">No contacts yet. Tap Invite above.</div>
            )}
            <ul className="space-y-1">
              {contacts.map(c => (
                <li key={c.id}>
                  <Link
                    to={`/friends/${c.id}`}
                    className="flex items-center justify-between px-2 py-2 rounded text-sm hover:bg-adv-dark-2 transition"
                  >
                    <span className="truncate">{c.display_name}</span>
                    {c.muted && <Bell size={12} className="text-adv-gray" />}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-4 pt-3 border-t border-border/50">
              <Link to="/friends/groups" className="text-xs text-adv-teal hover:underline">Groups →</Link>
            </div>
          </section>

          <section className="md:col-span-2 rounded-lg border border-border bg-adv-card p-4">
            <div className="text-sm font-medium mb-3">Activity · reverse-chronological</div>
            {activity.length === 0 ? (
              <div className="text-xs text-adv-gray">No activity yet. When your contacts share things, they appear here — newest first, no ranking.</div>
            ) : (
              <ul className="space-y-3">
                {activity.map(e => (
                  <li key={e.id} className="text-sm border-l-2 border-adv-teal/30 pl-3">
                    <div className="text-xs text-adv-gray">{new Date(e.created_at).toLocaleString()}</div>
                    <div>{e.event_type.replace(/-/g, ' ')}</div>
                    <pre className="text-[11px] text-adv-gray overflow-x-auto">{JSON.stringify(e.payload).slice(0, 200)}</pre>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
