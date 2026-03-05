/**
 * CommunityGroupsPage.tsx
 *
 * Lists all groups the user belongs to or has created.
 * Create Group modal with name, description, 5-swatch color picker.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users2, Plus, LogIn, ChevronRight } from 'lucide-react';
import { getAuthHeader } from '../../lib/api';

// ── Types ─────────────────────────────────────────────────────────────────

interface GroupNode {
  id: string;
  group_hash: string;
  name: string;
  description: string | null;
  avatar_color: string;
  join_code: string;
  role: 'admin' | 'member';
  memberCount: number;
  created_at: string;
}

// ── Color swatches ────────────────────────────────────────────────────────

const SWATCHES = ['#2DD4A8', '#3498DB', '#F5A623', '#E74C3C', '#9B59B6'];

// ── GroupAvatar ───────────────────────────────────────────────────────────

function GroupAvatar({ name, color, size = 44 }: { name: string; color: string; size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-xl font-bold text-adv-dark"
      style={{ width: size, height: size, backgroundColor: color, fontSize: size * 0.38 }}
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

// ── Create Group Modal ────────────────────────────────────────────────────

function CreateGroupModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(SWATCHES[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!name.trim()) { setError('Group name required'); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/community/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || undefined, avatarColor: color }),
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error ?? 'Failed to create group'); }
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create group');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-border bg-adv-card p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h2 className="mb-5 text-lg font-bold text-adv-white">Create Group</h2>

        <label className="mb-1 block text-sm text-adv-gray">Group name *</label>
        <input
          autoFocus
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          placeholder="e.g. Futurechain FCP Team"
          maxLength={60}
          className="mb-4 w-full rounded-lg border border-border bg-adv-dark-2 px-4 py-2.5 text-adv-white placeholder-adv-gray focus:border-adv-teal focus:outline-none"
        />

        <label className="mb-1 block text-sm text-adv-gray">Description (optional)</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="What is this group for?"
          rows={2}
          maxLength={200}
          className="mb-4 w-full resize-none rounded-lg border border-border bg-adv-dark-2 px-4 py-2.5 text-adv-white placeholder-adv-gray focus:border-adv-teal focus:outline-none"
        />

        <label className="mb-2 block text-sm text-adv-gray">Group color</label>
        <div className="mb-5 flex gap-3">
          {SWATCHES.map(s => (
            <button
              key={s}
              onClick={() => setColor(s)}
              className="h-8 w-8 rounded-full border-2 transition"
              style={{ backgroundColor: s, borderColor: color === s ? '#fff' : 'transparent' }}
              aria-label={s}
            />
          ))}
        </div>

        {error && <p className="mb-3 text-sm text-adv-red">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-border bg-adv-dark-2 px-4 py-2.5 text-sm text-adv-off-white transition hover:border-adv-teal/40"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={loading || !name.trim()}
            className="flex-1 rounded-lg bg-adv-teal px-4 py-2.5 text-sm font-semibold text-adv-dark transition hover:bg-adv-teal-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Creating…' : 'Create Group'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

export default function CommunityGroupsPage() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<GroupNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  async function loadGroups() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/community/groups', { headers: getAuthHeader() });
      if (!res.ok) throw new Error('Failed to load groups');
      setGroups(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load groups');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadGroups(); }, []);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-adv-white">Groups</h1>
          <p className="text-sm text-adv-gray">Private, invite-only spaces</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/community/join')}
            className="flex items-center gap-2 rounded-lg border border-border bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white transition hover:border-adv-teal/40 hover:text-adv-teal"
          >
            <LogIn className="h-4 w-4" />
            Join
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-lg bg-adv-teal px-3 py-2 text-sm font-semibold text-adv-dark transition hover:bg-adv-teal-dark"
          >
            <Plus className="h-4 w-4" />
            Create
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-adv-teal border-t-transparent" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-adv-red/30 bg-adv-card p-6 text-center">
          <p className="mb-3 text-adv-red">{error}</p>
          <button onClick={loadGroups} className="rounded-lg bg-adv-teal px-4 py-2 text-sm font-semibold text-adv-dark hover:bg-adv-teal-dark">
            Retry
          </button>
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-adv-card py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-adv-teal-dim">
            <Users2 className="h-8 w-8 text-adv-teal" />
          </div>
          <div>
            <p className="font-semibold text-adv-white">No groups yet</p>
            <p className="mt-1 text-sm text-adv-gray">Create your first group or join one with an invite link</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => navigate('/community/join')}
              className="flex items-center gap-2 rounded-lg border border-border bg-adv-dark-2 px-4 py-2 text-sm text-adv-off-white transition hover:border-adv-teal/40"
            >
              <LogIn className="h-4 w-4" /> Join a group
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-semibold text-adv-dark hover:bg-adv-teal-dark"
            >
              <Plus className="h-4 w-4" /> Create group
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map(g => (
            <button
              key={g.id}
              onClick={() => navigate(`/community/groups/${g.id}`)}
              className="group flex w-full items-center gap-4 rounded-xl border border-border bg-adv-card px-5 py-4 text-left transition hover:border-adv-teal/40 hover:bg-adv-teal-soft"
            >
              <GroupAvatar name={g.name} color={g.avatar_color} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-adv-white truncate">{g.name}</p>
                  {g.role === 'admin' && (
                    <span className="rounded-full bg-adv-teal-dim px-2 py-0.5 text-xs text-adv-teal">admin</span>
                  )}
                </div>
                <p className="text-xs text-adv-gray mt-0.5">{g.group_hash} · {g.memberCount} member{g.memberCount !== 1 ? 's' : ''}</p>
                {g.description && <p className="text-sm text-adv-gray mt-1 truncate">{g.description}</p>}
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-adv-gray transition group-hover:text-adv-teal" />
            </button>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateGroupModal onClose={() => setShowCreate(false)} onCreated={loadGroups} />
      )}
    </div>
  );
}
