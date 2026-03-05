/**
 * CommunityJoinPage.tsx
 *
 * Handles invite-token-based group join flow.
 * Reads ?token= from URL → decodes → shows group name/hash → join.
 * Falls back to manual form if token missing/invalid.
 */

import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Users2, LogIn, AlertTriangle } from 'lucide-react';
import { getAuthHeader } from '../../lib/api';

interface InvitePayload {
  groupHash: string;
  groupName: string;
  joinCode: string;
  nodeUrl: string;
}

type JoinState = 'idle' | 'joining' | 'success' | 'error';

export default function CommunityJoinPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [invite, setInvite] = useState<InvitePayload | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);

  // Manual form state
  const [manualHash, setManualHash] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [displayName, setDisplayName] = useState('');

  const [joinState, setJoinState] = useState<JoinState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [joinedGroupId, setJoinedGroupId] = useState<string | null>(null);

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) return;
    try {
      const json = atob(token.replace(/-/g, '+').replace(/_/g, '/'));
      const payload = JSON.parse(json) as InvitePayload;
      if (!payload.groupHash || !payload.joinCode) throw new Error('Invalid token structure');
      setInvite(payload);
      setManualHash(payload.groupHash);
      setManualCode(payload.joinCode);
    } catch {
      setTokenError('The invite link is invalid or has expired. You can join manually below.');
    }
  }, [searchParams]);

  async function handleJoin() {
    const groupHash = (invite?.groupHash ?? manualHash).trim();
    const joinCode = (invite?.joinCode ?? manualCode).trim().toUpperCase();
    if (!groupHash || !joinCode) { setError('Group hash and join code are required'); return; }

    setJoinState('joining');
    setError(null);
    try {
      const res = await fetch('/api/community/groups/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ groupHash, joinCode, displayName: displayName.trim() || undefined }),
      });
      const body = await res.json() as { groupId?: string; error?: string };
      if (!res.ok) throw new Error(body.error ?? 'Failed to join group');
      setJoinedGroupId(body.groupId ?? null);
      setJoinState('success');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to join group');
      setJoinState('error');
    }
  }

  // Success state
  if (joinState === 'success' && joinedGroupId) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="mb-6 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-adv-teal-dim">
            <Users2 className="h-8 w-8 text-adv-teal" />
          </div>
        </div>
        <h1 className="mb-2 text-2xl font-bold text-adv-white">You're in!</h1>
        <p className="mb-8 text-adv-gray">
          {invite ? `You've joined ${invite.groupName}.` : 'Successfully joined the group.'}
        </p>
        <button
          onClick={() => navigate(`/community/groups/${joinedGroupId}`)}
          className="rounded-lg bg-adv-teal px-6 py-2.5 font-semibold text-adv-dark hover:bg-adv-teal-dark"
        >
          Open Group
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-adv-teal-dim">
          <LogIn className="h-7 w-7 text-adv-teal" />
        </div>
        <h1 className="text-2xl font-bold text-adv-white">Join a Group</h1>
        <p className="text-sm text-adv-gray">
          {invite
            ? `You've been invited to join ${invite.groupName}`
            : 'Enter the group hash and join code from your invite'}
        </p>
      </div>

      {tokenError && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-adv-gold/30 bg-adv-card p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-adv-gold" />
          <p className="text-sm text-adv-off-white">{tokenError}</p>
        </div>
      )}

      <div className="rounded-xl border border-border bg-adv-card p-6">
        {invite ? (
          // Token-based: show read-only info
          <div className="mb-5">
            <p className="mb-1 text-xs uppercase tracking-wide text-adv-gray">Group</p>
            <p className="font-semibold text-adv-white">{invite.groupName}</p>
            <p className="text-xs text-adv-gray">{invite.groupHash}</p>
            <div className="mt-3 flex items-center gap-2">
              <span className="rounded-lg border border-border bg-adv-dark-2 px-3 py-1 font-mono text-sm text-adv-teal">
                {invite.joinCode}
              </span>
              <span className="text-xs text-adv-gray">Join code (verify with group admin)</span>
            </div>
          </div>
        ) : (
          // Manual form
          <>
            <label className="mb-1 block text-sm text-adv-gray">Group hash</label>
            <input
              type="text"
              value={manualHash}
              onChange={e => setManualHash(e.target.value)}
              placeholder="GRPX-XXXX-XXXX-XXXX"
              className="mb-4 w-full rounded-lg border border-border bg-adv-dark-2 px-4 py-2.5 font-mono text-sm text-adv-white placeholder-adv-gray focus:border-adv-teal focus:outline-none"
            />
            <label className="mb-1 block text-sm text-adv-gray">Join code</label>
            <input
              type="text"
              value={manualCode}
              onChange={e => setManualCode(e.target.value.toUpperCase())}
              placeholder="6-character code"
              maxLength={6}
              className="mb-4 w-full rounded-lg border border-border bg-adv-dark-2 px-4 py-2.5 font-mono text-sm text-adv-white placeholder-adv-gray focus:border-adv-teal focus:outline-none"
            />
          </>
        )}

        <label className="mb-1 block text-sm text-adv-gray">Display name in this group (optional)</label>
        <input
          type="text"
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          placeholder="Leave blank to use your profile name"
          maxLength={50}
          className="mb-5 w-full rounded-lg border border-border bg-adv-dark-2 px-4 py-2.5 text-sm text-adv-white placeholder-adv-gray focus:border-adv-teal focus:outline-none"
        />

        {error && <p className="mb-3 text-sm text-adv-red">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={() => navigate('/community/groups')}
            className="flex-1 rounded-lg border border-border bg-adv-dark-2 px-4 py-2.5 text-sm text-adv-off-white transition hover:border-adv-teal/40"
          >
            Cancel
          </button>
          <button
            onClick={handleJoin}
            disabled={joinState === 'joining'}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-adv-teal px-4 py-2.5 text-sm font-semibold text-adv-dark transition hover:bg-adv-teal-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            <LogIn className="h-4 w-4" />
            {joinState === 'joining' ? 'Joining…' : 'Join Group'}
          </button>
        </div>
      </div>
    </div>
  );
}
