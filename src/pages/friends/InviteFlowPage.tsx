// ── InviteFlowPage.tsx ──────────────────────────────────────────────────────
// /friends/invite — generate and share invites. Two modes:
//   1) "Link/QR" — instance issues a short-lived invite URL keyed by the
//      inviter's pubkey; peer opens and accepts on their ANTON.
//   2) "Paste peer pubkey" — direct add if the peer has already shared their
//      Ed25519 pubkey out-of-band.
// School-mode minors trigger the guardian approval flow per Q12 answer A —
// the server 202s with held_for_guardian:true and we surface that clearly.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { QrCode, Link as LinkIcon, Users, ShieldCheck } from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';

export default function InviteFlowPage() {
  const [mode, setMode] = useState<'link' | 'paste'>('link');
  const [peerPubkey, setPeerPubkey] = useState('');
  const [peerPortalId, setPeerPortalId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ kind: 'ok' | 'held' | 'error'; message: string } | null>(null);

  async function submit() {
    if (!peerPubkey.trim() || !displayName.trim() || submitting) return;
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetchWithAuth('/api/friends/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          peer_public_key: peerPubkey.trim(),
          peer_portal_id: peerPortalId.trim() || undefined,
          display_name: displayName.trim(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 202 && json.held_for_guardian) {
        setResult({ kind: 'held', message: 'Invite held for guardian approval. You will be notified once approved.' });
      } else if (res.ok) {
        setResult({ kind: 'ok', message: 'Invite sent. Waiting for peer to accept.' });
        setPeerPubkey(''); setPeerPortalId(''); setDisplayName('');
      } else {
        setResult({ kind: 'error', message: json.error || `Failed (${res.status})` });
      }
    } catch (err) {
      setResult({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Users className="text-adv-teal" size={22} /> Invite a friend
            </h1>
            <p className="text-xs text-adv-gray mt-1">Peer-to-peer over the AAP / Beehive substrate.</p>
          </div>
          <Link to="/friends" className="text-adv-teal text-sm">← Friends</Link>
        </header>

        <div className="flex gap-2">
          <button
            onClick={() => setMode('link')}
            className={`px-4 py-2 rounded text-sm ${mode === 'link' ? 'bg-adv-teal text-adv-dark' : 'border border-border'}`}
          >
            <QrCode size={14} className="inline mr-1" /> Link / QR
          </button>
          <button
            onClick={() => setMode('paste')}
            className={`px-4 py-2 rounded text-sm ${mode === 'paste' ? 'bg-adv-teal text-adv-dark' : 'border border-border'}`}
          >
            <LinkIcon size={14} className="inline mr-1" /> Paste peer pubkey
          </button>
        </div>

        {mode === 'link' && (
          <section className="rounded-lg border border-border bg-adv-card p-6 text-center space-y-3">
            <div className="inline-block p-6 bg-adv-dark rounded border border-border">
              <QrCode size={120} className="text-adv-teal" />
            </div>
            <div className="text-sm">Show this to another ANTON user to exchange public keys.</div>
            <div className="text-xs text-adv-gray">
              QR exchange arrives in v0.8.1. For now, use "Paste peer pubkey" — ask the other person to share their
              Ed25519 public key from Settings → Identity.
            </div>
          </section>
        )}

        {mode === 'paste' && (
          <section className="rounded-lg border border-border bg-adv-card p-4 space-y-3">
            <div>
              <label className="text-xs text-adv-gray">Display name</label>
              <input
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="What you'll call them in your contacts"
                className="mt-1 w-full bg-adv-dark border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-adv-teal"
              />
            </div>
            <div>
              <label className="text-xs text-adv-gray">Peer Ed25519 public key</label>
              <input
                value={peerPubkey}
                onChange={e => setPeerPubkey(e.target.value)}
                placeholder="base64-encoded pubkey"
                className="mt-1 w-full bg-adv-dark border border-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-adv-teal"
              />
            </div>
            <div>
              <label className="text-xs text-adv-gray">Peer portal id (optional)</label>
              <input
                value={peerPortalId}
                onChange={e => setPeerPortalId(e.target.value)}
                placeholder="e.g. alice.anton"
                className="mt-1 w-full bg-adv-dark border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-adv-teal"
              />
            </div>
            <button
              onClick={() => void submit()}
              disabled={submitting || !peerPubkey.trim() || !displayName.trim()}
              className="w-full px-4 py-2 bg-adv-teal text-adv-dark rounded font-medium disabled:opacity-50"
            >
              Send invitation
            </button>
          </section>
        )}

        {result && (
          <div className={`rounded p-3 text-sm flex items-start gap-2 ${
            result.kind === 'ok' ? 'bg-adv-teal/10 text-adv-teal' :
            result.kind === 'held' ? 'bg-adv-gold/10 text-adv-gold' :
            'bg-adv-red/10 text-adv-red'
          }`}>
            {result.kind === 'held' && <ShieldCheck size={16} className="mt-0.5 shrink-0" />}
            <div>{result.message}</div>
          </div>
        )}
      </div>
    </div>
  );
}
