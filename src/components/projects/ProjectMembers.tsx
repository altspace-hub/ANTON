import { useEffect, useState, useCallback } from 'react';
import { Users, UserPlus, Mail, Trash2, ChevronDown, X, Shield, Eye, Crown } from 'lucide-react';

interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  role: string;
  username: string;
  display_name: string;
  email: string;
  created_at: string;
}

interface ProjectInvitation {
  id: string;
  email: string;
  role: string;
  status: string;
  expires_at: string;
  created_at: string;
}

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('openexpert-token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const ROLE_CONFIG: Record<string, { label: string; color: string; icon: typeof Crown }> = {
  owner: { label: 'Owner', color: 'bg-adv-gold/20 text-adv-gold', icon: Crown },
  admin: { label: 'Admin', color: 'bg-adv-teal/20 text-adv-teal', icon: Shield },
  member: { label: 'Member', color: 'bg-adv-blue/20 text-adv-blue', icon: Users },
  viewer: { label: 'Viewer', color: 'bg-adv-gray/20 text-adv-gray', icon: Eye },
};

export default function ProjectMembers({ projectId }: { projectId: string }) {
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [invitations, setInvitations] = useState<ProjectInvitation[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [inviting, setInviting] = useState(false);
  const [editingRole, setEditingRole] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    try {
      const [membersRes, invitationsRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/members`, { headers: getAuthHeader() }),
        fetch(`/api/projects/${projectId}/invitations`, { headers: getAuthHeader() }),
      ]);
      setMembers(await membersRes.json());
      setInvitations(await invitationsRes.json());
    } catch (err) {
      console.error('[project-members] fetch error:', err);
    }
  }, [projectId]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim() || inviting) return;
    setInviting(true);
    try {
      await fetch(`/api/projects/${projectId}/invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      setInviteEmail('');
      setShowInvite(false);
      fetchMembers();
    } catch (err) {
      console.error('[project-members] invite error:', err);
    } finally {
      setInviting(false);
    }
  }

  async function handleUpdateRole(memberId: string, newRole: string) {
    try {
      await fetch(`/api/projects/${projectId}/members/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ role: newRole }),
      });
      setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole } : m));
      setEditingRole(null);
    } catch (err) {
      console.error('[project-members] role update error:', err);
    }
  }

  async function handleRemoveMember(memberId: string) {
    try {
      await fetch(`/api/projects/${projectId}/members/${memberId}`, {
        method: 'DELETE',
        headers: getAuthHeader(),
      });
      setMembers(prev => prev.filter(m => m.id !== memberId));
    } catch (err) {
      console.error('[project-members] remove error:', err);
    }
  }

  async function handleRevokeInvitation(invitationId: string) {
    try {
      await fetch(`/api/projects/${projectId}/invitations/${invitationId}`, {
        method: 'DELETE',
        headers: getAuthHeader(),
      });
      setInvitations(prev => prev.filter(i => i.id !== invitationId));
    } catch (err) {
      console.error('[project-members] revoke error:', err);
    }
  }

  return (
    <div>
      {/* Header with invite button */}
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-adv-gray">
          {members.length} member{members.length !== 1 ? 's' : ''}
        </p>
        <button
          onClick={() => setShowInvite(!showInvite)}
          className="flex items-center gap-1.5 rounded-lg bg-adv-teal/10 px-3 py-1.5 text-xs font-medium text-adv-teal transition-colors hover:bg-adv-teal/20"
        >
          <UserPlus className="h-3.5 w-3.5" />
          Invite
        </button>
      </div>

      {/* Invite form */}
      {showInvite && (
        <form onSubmit={handleInvite} className="mb-4 rounded-xl border border-adv-teal/30 bg-adv-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-adv-off-white">Invite by email</span>
            <button type="button" onClick={() => setShowInvite(false)} className="text-adv-gray hover:text-adv-off-white">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-adv-gray" />
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@company.com"
                required
                className="w-full rounded-lg border border-border bg-adv-dark py-2 pl-9 pr-3 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
              />
            </div>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
              <option value="viewer">Viewer</option>
            </select>
            <button
              type="submit"
              disabled={inviting}
              className="rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark transition-colors hover:bg-adv-teal-dark disabled:opacity-50"
            >
              {inviting ? 'Sending...' : 'Send'}
            </button>
          </div>
        </form>
      )}

      {/* Members list */}
      {members.length === 0 ? (
        <div className="rounded-xl border border-border bg-adv-card p-6 text-center">
          <Users className="mx-auto mb-2 h-8 w-8 text-adv-gray" />
          <p className="text-sm text-adv-gray">No members yet</p>
          <p className="mt-1 text-xs text-adv-gray">
            Invite team members to collaborate on this project
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {members.map(member => {
            const roleConfig = ROLE_CONFIG[member.role] || ROLE_CONFIG.member;
            const RoleIcon = roleConfig.icon;
            return (
              <div
                key={member.id}
                className="group flex items-center gap-3 rounded-lg border border-border bg-adv-card px-4 py-3 transition-all hover:border-adv-teal/10"
              >
                {/* Avatar placeholder */}
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-adv-teal-dim text-sm font-bold text-adv-teal">
                  {(member.display_name || member.username || '?')[0].toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-adv-off-white">
                    {member.display_name || member.username}
                  </p>
                  {member.email && (
                    <p className="text-xs text-adv-gray">{member.email}</p>
                  )}
                </div>

                {/* Role badge / editor */}
                {editingRole === member.id ? (
                  <select
                    value={member.role}
                    onChange={(e) => handleUpdateRole(member.id, e.target.value)}
                    onBlur={() => setEditingRole(null)}
                    autoFocus
                    className="rounded border border-adv-teal bg-adv-dark px-2 py-1 text-xs text-adv-off-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                  >
                    <option value="owner">Owner</option>
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                    <option value="viewer">Viewer</option>
                  </select>
                ) : (
                  <button
                    onClick={() => setEditingRole(member.id)}
                    className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${roleConfig.color} transition-colors hover:opacity-80`}
                    title="Click to change role"
                  >
                    <RoleIcon className="h-3 w-3" />
                    {roleConfig.label}
                    <ChevronDown className="h-2.5 w-2.5" />
                  </button>
                )}

                {/* Remove */}
                {member.role !== 'owner' && (
                  <button
                    onClick={() => handleRemoveMember(member.id)}
                    className="rounded p-1.5 text-adv-gray opacity-0 transition-all hover:text-adv-red group-hover:opacity-100"
                    title="Remove member"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pending invitations */}
      {invitations.length > 0 && (
        <div className="mt-6">
          <h4 className="mb-2 text-xs font-semibold uppercase text-adv-gray">
            Pending Invitations ({invitations.length})
          </h4>
          <div className="space-y-2">
            {invitations.map(inv => (
              <div
                key={inv.id}
                className="group flex items-center gap-3 rounded-lg border border-border bg-adv-card px-4 py-3"
              >
                <Mail className="h-4 w-4 shrink-0 text-adv-gray" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-adv-off-white">{inv.email}</p>
                  <p className="text-xs text-adv-gray">
                    Invited as {inv.role} · Expires {new Date(inv.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </p>
                </div>
                <span className="rounded-full bg-adv-gold/10 px-2 py-0.5 text-xs font-medium text-adv-gold">
                  Pending
                </span>
                <button
                  onClick={() => handleRevokeInvitation(inv.id)}
                  className="rounded p-1.5 text-adv-gray opacity-0 transition-all hover:text-adv-red group-hover:opacity-100"
                  title="Revoke"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
