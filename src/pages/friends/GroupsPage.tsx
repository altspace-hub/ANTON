// ── GroupsPage.tsx ──────────────────────────────────────────────────────────
// /friends/groups — lightweight group chats ("Beehives"). Reuses the existing
// Beehive star-topology protocol; this page is the consumer-facing surface
// over it. v1 is a simple list of joined groups with a "New beehive" button.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users as UsersIcon, Plus } from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';

interface Beehive {
  id: string;
  title: string;
  member_count: number;
  last_activity_at: string | null;
  role: 'host' | 'member';
}

export default function GroupsPage() {
  const [hives, setHives] = useState<Beehive[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);

  async function load() {
    const res = await fetchWithAuth('/api/friends/groups');
    if (res.ok) {
      const json = await res.json() as { groups: Beehive[] };
      setHives(json.groups ?? []);
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function createHive() {
    if (!newTitle.trim() || creating) return;
    setCreating(true);
    const res = await fetchWithAuth('/api/friends/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle.trim() }),
    });
    if (res.ok) {
      setNewTitle('');
      await load();
    }
    setCreating(false);
  }

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <UsersIcon className="text-adv-teal" size={22} /> Beehives
            </h1>
            <p className="text-xs text-adv-gray mt-1">
              Small group chats over the Beehive protocol. End-to-end encrypted. Host-rotating.
            </p>
          </div>
          <Link to="/friends" className="text-adv-teal text-sm">← Friends</Link>
        </header>

        <section className="rounded-lg border border-border bg-adv-card p-4 space-y-3">
          <div className="text-sm font-medium">Start a new beehive</div>
          <div className="flex items-center gap-2">
            <input
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="e.g. Study group — compliance"
              className="flex-1 bg-adv-dark border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-adv-teal"
            />
            <button
              onClick={() => void createHive()}
              disabled={!newTitle.trim() || creating}
              className="px-4 py-2 bg-adv-teal text-adv-dark rounded text-sm font-medium disabled:opacity-50 inline-flex items-center gap-1"
            >
              <Plus size={14} /> Create
            </button>
          </div>
        </section>

        <section className="space-y-2">
          {loading ? (
            <div className="text-adv-gray text-sm">Loading…</div>
          ) : hives.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-adv-card p-6 text-center text-sm text-adv-gray">
              No beehives yet. Create one above or join via invite.
            </div>
          ) : (
            hives.map(h => (
              <Link
                key={h.id}
                to={`/friends/groups/${h.id}`}
                className="block rounded-lg border border-border bg-adv-card p-4 hover:border-adv-teal/50"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">{h.title}</div>
                    <div className="text-xs text-adv-gray mt-1">
                      {h.member_count} member{h.member_count === 1 ? '' : 's'} ·
                      {h.role === 'host' ? ' host' : ' member'}
                    </div>
                  </div>
                  <div className="text-xs text-adv-gray">
                    {h.last_activity_at ? new Date(h.last_activity_at).toLocaleDateString() : '—'}
                  </div>
                </div>
              </Link>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
