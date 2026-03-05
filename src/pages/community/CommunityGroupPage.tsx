/**
 * CommunityGroupPage.tsx
 *
 * Single group detail page.
 * Shows header, 4 nav cards (Mail / Calendar / Chat / Forum),
 * collapsible members list, share invite button, and admin danger zone.
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Mail, CalendarDays, MessageSquare, Users2,
  ChevronDown, ChevronUp, Copy, Check, Trash2, UserMinus, ChevronRight,
  MessageCircle,
} from 'lucide-react';
import { getAuthHeader } from '../../lib/api';

// ── Types ─────────────────────────────────────────────────────────────────

interface GroupMember {
  id: string;
  contact_hash: string;
  display_name: string;
  role: 'admin' | 'member';
  joined_at: string;
}

interface GroupDetail {
  id: string;
  group_hash: string;
  name: string;
  description: string | null;
  avatar_color: string;
  join_code: string;
  role: 'admin' | 'member';
  members: GroupMember[];
}

// ── Helpers ───────────────────────────────────────────────────────────────

function GroupAvatar({ name, color, size = 52 }: { name: string; color: string; size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-2xl font-bold text-adv-dark"
      style={{ width: size, height: size, backgroundColor: color, fontSize: size * 0.38 }}
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

function NavCard({ icon, label, description, onClick, badge }: {
  icon: React.ReactNode; label: string; description: string; onClick: () => void; badge?: string | number;
}) {
  return (
    <button
      onClick={onClick}
      className="group flex w-full items-center gap-4 rounded-xl border border-border bg-adv-card px-5 py-4 text-left transition hover:border-adv-teal/40 hover:bg-adv-teal-soft"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-adv-teal-dim text-adv-teal">
        {icon}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-adv-white">{label}</p>
          {badge !== undefined && badge !== 0 && (
            <span className="rounded-full bg-adv-teal px-1.5 py-0.5 text-xs font-semibold text-adv-dark">{badge}</span>
          )}
        </div>
        <p className="text-sm text-adv-gray">{description}</p>
      </div>
      <ChevronRight className="h-4 w-4 text-adv-gray transition group-hover:text-adv-teal" />
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

export default function CommunityGroupPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [membersOpen, setMembersOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadGroup = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/community/groups/${id}`, { headers: getAuthHeader() });
      if (!res.ok) throw new Error('Group not found');
      setGroup(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load group');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void loadGroup(); }, [loadGroup]);

  async function handleShareInvite() {
    if (!id) return;
    try {
      const res = await fetch(`/api/community/groups/${id}/invite-token`, { headers: getAuthHeader() });
      if (!res.ok) throw new Error();
      const { url } = await res.json() as { url: string };
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // fallback — just copy group hash
      if (group) {
        await navigator.clipboard.writeText(group.group_hash);
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      }
    }
  }

  async function handleRemoveMember(contactHash: string) {
    if (!id) return;
    await fetch(`/api/community/groups/${id}/members/${contactHash}`, {
      method: 'DELETE', headers: getAuthHeader(),
    });
    void loadGroup();
  }

  async function handleDeleteGroup() {
    if (!id) return;
    setDeleting(true);
    await fetch(`/api/community/groups/${id}`, { method: 'DELETE', headers: getAuthHeader() });
    navigate('/community/groups');
  }

  if (loading) return (
    <div className="flex h-64 items-center justify-center">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-adv-teal border-t-transparent" />
    </div>
  );

  if (error || !group) return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <p className="mb-4 text-adv-red">{error ?? 'Group not found'}</p>
      <button onClick={() => navigate('/community/groups')} className="rounded-lg bg-adv-teal px-4 py-2 text-sm font-semibold text-adv-dark hover:bg-adv-teal-dark">
        Back to Groups
      </button>
    </div>
  );

  const isAdmin = group.role === 'admin';

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex items-start gap-4">
        <GroupAvatar name={group.name} color={group.avatar_color} />
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-adv-white truncate">{group.name}</h1>
          <p className="text-xs text-adv-gray mt-0.5">{group.group_hash} · {group.members.length} member{group.members.length !== 1 ? 's' : ''}</p>
          {group.description && <p className="mt-2 text-sm text-adv-off-white">{group.description}</p>}
        </div>
        <button
          onClick={handleShareInvite}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white transition hover:border-adv-teal/40 hover:text-adv-teal"
          title="Copy invite link"
        >
          {copied ? <Check className="h-4 w-4 text-adv-green" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copied!' : 'Invite'}
        </button>
      </div>

      {/* Nav cards */}
      <div className="mb-6 flex flex-col gap-3">
        <NavCard
          icon={<Mail className="h-5 w-5" />}
          label="Mail"
          description="Group async mail thread"
          onClick={() => navigate(`/community/mail?groupId=${id}`)}
        />
        <NavCard
          icon={<CalendarDays className="h-5 w-5" />}
          label="Calendar"
          description="Group events and deadlines"
          onClick={() => navigate(`/community/calendar?groupId=${id}`)}
        />
        <NavCard
          icon={<MessageCircle className="h-5 w-5" />}
          label="Chat"
          description="Real-time group chat (coming soon)"
          onClick={() => {}}
        />
        <NavCard
          icon={<MessageSquare className="h-5 w-5" />}
          label="Forum"
          description="Chronological group discussion"
          onClick={() => navigate(`/community/forum?groupId=${id}`)}
        />
      </div>

      {/* Members */}
      <div className="mb-6 rounded-xl border border-border bg-adv-card overflow-hidden">
        <button
          onClick={() => setMembersOpen(o => !o)}
          className="flex w-full items-center justify-between px-5 py-4 text-adv-off-white transition hover:text-adv-teal"
        >
          <div className="flex items-center gap-2">
            <Users2 className="h-4 w-4" />
            <span className="font-medium">Members ({group.members.length})</span>
          </div>
          {membersOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {membersOpen && (
          <div className="border-t border-border">
            {group.members.map(m => (
              <div key={m.id} className="flex items-center gap-3 px-5 py-3 border-b border-border/50 last:border-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-adv-teal-dim text-adv-teal text-sm font-semibold">
                  {m.display_name.slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-adv-white truncate">{m.display_name}</p>
                  <p className="text-xs text-adv-gray truncate">{m.contact_hash}</p>
                </div>
                {m.role === 'admin' && (
                  <span className="rounded-full bg-adv-teal-dim px-2 py-0.5 text-xs text-adv-teal">admin</span>
                )}
                {isAdmin && m.role !== 'admin' && (
                  <button
                    onClick={() => handleRemoveMember(m.contact_hash)}
                    className="text-adv-gray transition hover:text-adv-red"
                    title="Remove member"
                    aria-label={`Remove ${m.display_name}`}
                  >
                    <UserMinus className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Admin danger zone */}
      {isAdmin && (
        <div className="rounded-xl border border-adv-red/20 bg-adv-card p-5">
          <h3 className="mb-3 text-sm font-semibold text-adv-red">Danger Zone</h3>
          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-2 rounded-lg border border-adv-red/30 px-4 py-2 text-sm text-adv-red transition hover:bg-adv-red/10"
            >
              <Trash2 className="h-4 w-4" />
              Delete Group
            </button>
          ) : (
            <div>
              <p className="mb-3 text-sm text-adv-off-white">
                This will permanently delete the group and remove all members. This cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="rounded-lg border border-border bg-adv-dark-2 px-4 py-2 text-sm text-adv-off-white transition hover:border-adv-teal/40"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteGroup}
                  disabled={deleting}
                  className="flex items-center gap-2 rounded-lg bg-adv-red px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                  {deleting ? 'Deleting…' : 'Delete forever'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
