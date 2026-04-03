import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, Flag, VolumeX, Volume2, Check, X, AlertTriangle } from 'lucide-react';
import { getAuthHeader, fetchWithAuth } from '@/lib/api';

interface ContentFlag {
  id: string;
  content_type: string;
  content_id: string;
  reporter_hash: string;
  reason: string;
  description: string | null;
  status: string;
  action_taken: string | null;
  created_at: string;
  reviewed_at: string | null;
}

interface GroupMember {
  contact_hash: string;
  display_name: string;
  role: string;
  muted_until: string | null;
  mute_reason: string | null;
}

const REASON_COLORS: Record<string, string> = {
  spam: 'bg-red-500/20 text-red-400',
  harassment: 'bg-red-500/20 text-red-400',
  off_topic: 'bg-yellow-500/20 text-yellow-400',
  inappropriate: 'bg-orange-500/20 text-orange-400',
  other: 'bg-adv-gray/20 text-adv-gray',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function CommunityGroupModerationPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [flags, setFlags] = useState<ContentFlag[]>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [muteHash, setMuteHash] = useState<string | null>(null);
  const [muteDuration, setMuteDuration] = useState(24);
  const [muteReason, setMuteReason] = useState('');

  const loadData = useCallback(async () => {
    if (!id) return;
    const [flagsRes, groupRes] = await Promise.all([
      fetch(`/api/community/groups/${id}/flags`, { headers: getAuthHeader() }),
      fetch(`/api/community/groups/${id}`, { headers: getAuthHeader() }),
    ]);
    if (flagsRes.ok) { const d = await flagsRes.json(); setFlags(d.flags || []); }
    if (groupRes.ok) { const d = await groupRes.json(); setMembers(d.members || []); }
    setLoading(false);
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  const actionFlag = async (flagId: string, status: string, action_taken?: string) => {
    await fetchWithAuth(`/api/community/flags/${flagId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, action_taken }),
    });
    loadData();
  };

  const muteMember = async (contactHash: string) => {
    await fetchWithAuth(`/api/community/groups/${id}/members/${contactHash}/mute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duration_hours: muteDuration, reason: muteReason }),
    });
    setMuteHash(null);
    setMuteReason('');
    loadData();
  };

  const unmuteMember = async (contactHash: string) => {
    await fetchWithAuth(`/api/community/groups/${id}/members/${contactHash}/unmute`, { method: 'POST' });
    loadData();
  };

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-adv-teal border-t-transparent" /></div>;

  const pendingFlags = flags.filter(f => f.status === 'pending');
  const resolvedFlags = flags.filter(f => f.status !== 'pending');
  const nonAdminMembers = members.filter(m => m.role !== 'admin');

  return (
    <div className="min-h-screen p-6 max-w-4xl mx-auto">
      <button onClick={() => navigate(`/community/groups/${id}`)} className="mb-4 flex items-center gap-2 text-sm text-adv-gray hover:text-adv-teal">
        <ArrowLeft className="h-4 w-4" /> Back to group
      </button>
      <div className="flex items-center gap-3 mb-6">
        <Shield className="h-6 w-6 text-adv-gold" />
        <h1 className="text-xl font-bold text-adv-off-white">Moderation Dashboard</h1>
      </div>

      {/* Pending Flags */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-adv-off-white mb-3 flex items-center gap-2">
          <Flag className="h-4 w-4 text-adv-red" /> Pending Flags ({pendingFlags.length})
        </h2>
        {pendingFlags.length === 0 ? (
          <p className="text-sm text-adv-gray text-center py-6">No pending flags. All clear.</p>
        ) : (
          <div className="space-y-3">
            {pendingFlags.map(flag => (
              <div key={flag.id} className="rounded-xl border border-border bg-adv-card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${REASON_COLORS[flag.reason] || REASON_COLORS.other}`}>{flag.reason}</span>
                  <span className="text-xs text-adv-gray">{flag.content_type}</span>
                  <span className="text-xs text-adv-gray ml-auto">{timeAgo(flag.created_at)}</span>
                </div>
                {flag.description && <p className="text-sm text-adv-off-white mb-3">{flag.description}</p>}
                <div className="flex gap-2">
                  <button onClick={() => actionFlag(flag.id, 'dismissed')} className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:text-adv-off-white">
                    <X className="h-3 w-3" /> Dismiss
                  </button>
                  <button onClick={() => actionFlag(flag.id, 'reviewed', 'warning_issued')} className="flex items-center gap-1 rounded-lg border border-adv-gold/30 bg-adv-gold/10 px-3 py-1.5 text-xs text-adv-gold">
                    <AlertTriangle className="h-3 w-3" /> Warn
                  </button>
                  <button onClick={() => actionFlag(flag.id, 'actioned', 'content_removed')} className="flex items-center gap-1 rounded-lg border border-adv-red/30 bg-adv-red/10 px-3 py-1.5 text-xs text-adv-red">
                    <Check className="h-3 w-3" /> Remove Content
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Member Mute Controls */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-adv-off-white mb-3 flex items-center gap-2">
          <VolumeX className="h-4 w-4 text-adv-gray" /> Member Controls ({nonAdminMembers.length} members)
        </h2>
        <div className="space-y-2">
          {nonAdminMembers.map(m => {
            const isMuted = m.muted_until && new Date(m.muted_until) > new Date();
            return (
              <div key={m.contact_hash} className="flex items-center justify-between rounded-lg border border-border bg-adv-card px-4 py-3">
                <div>
                  <span className="text-sm font-medium text-adv-off-white">{m.display_name || m.contact_hash.slice(0, 16)}</span>
                  {isMuted && (
                    <span className="ml-2 text-xs text-adv-red">Muted until {new Date(m.muted_until!).toLocaleString()}{m.mute_reason ? ` (${m.mute_reason})` : ''}</span>
                  )}
                </div>
                <div className="flex gap-2">
                  {isMuted ? (
                    <button onClick={() => unmuteMember(m.contact_hash)} className="flex items-center gap-1 rounded-lg border border-adv-green/30 bg-adv-green/10 px-3 py-1.5 text-xs text-adv-green">
                      <Volume2 className="h-3 w-3" /> Unmute
                    </button>
                  ) : muteHash === m.contact_hash ? (
                    <div className="flex items-center gap-2">
                      <select value={muteDuration} onChange={e => setMuteDuration(Number(e.target.value))} className="rounded border border-border bg-adv-dark px-2 py-1 text-xs text-adv-off-white">
                        <option value={1}>1h</option>
                        <option value={6}>6h</option>
                        <option value={24}>24h</option>
                        <option value={72}>3d</option>
                        <option value={168}>7d</option>
                        <option value={720}>30d</option>
                      </select>
                      <input value={muteReason} onChange={e => setMuteReason(e.target.value)} placeholder="Reason" className="rounded border border-border bg-adv-dark px-2 py-1 text-xs text-adv-off-white w-32" />
                      <button onClick={() => muteMember(m.contact_hash)} className="rounded-lg bg-adv-red/20 px-3 py-1.5 text-xs text-adv-red">Mute</button>
                      <button onClick={() => setMuteHash(null)} className="text-xs text-adv-gray">Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => setMuteHash(m.contact_hash)} className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:text-adv-red">
                      <VolumeX className="h-3 w-3" /> Mute
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Resolved Flags */}
      {resolvedFlags.length > 0 && (
        <details className="mb-8">
          <summary className="cursor-pointer text-sm font-medium text-adv-gray mb-3">Resolved Flags ({resolvedFlags.length})</summary>
          <div className="space-y-2">
            {resolvedFlags.map(flag => (
              <div key={flag.id} className="rounded-lg border border-border/50 bg-adv-dark-2 px-4 py-3 text-xs text-adv-gray">
                <span className={`rounded px-1.5 py-0.5 text-[10px] ${REASON_COLORS[flag.reason] || REASON_COLORS.other}`}>{flag.reason}</span>
                <span className="ml-2">{flag.status}</span>
                {flag.action_taken && <span className="ml-2 text-adv-off-white">{flag.action_taken}</span>}
                <span className="ml-2">{flag.reviewed_at ? timeAgo(flag.reviewed_at) : ''}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
