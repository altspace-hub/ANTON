// MissionInboxPage — inbound delegations from peer ANTONs (cross-mission).
// Lists pending inbound delegation requests with accept/decline actions.
// Accepted delegations create a local sub-mission via the Phase 5 acceptInbound flow.

import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Inbox, ChevronLeft, RefreshCcw, Check, X, Shield, ShieldOff, AlertCircle } from 'lucide-react';
import { fetchWithAuth, getAuthHeader } from '../../lib/api';

type DelegationStatus =
  | 'received' | 'accepted' | 'declined' | 'in_progress'
  | 'completed' | 'failed';

interface InboundDelegation {
  id: string;
  peer_contact_hash: string;
  peer_display_name: string | null;
  brief_title: string;
  brief_objective: string;
  expected_output: string | null;
  deadline: string | null;
  payment_amount_ftc: string | number | null;
  status: DelegationStatus;
  signature_verified: boolean | null;
  sub_mission_id: string | null;
  created_at: string;
  accepted_at: string | null;
}

const STATUS_META: Record<DelegationStatus, { label: string; classes: string }> = {
  received:    { label: 'Awaiting decision', classes: 'text-adv-gold border-adv-gold/40 bg-adv-gold/10' },
  accepted:    { label: 'Accepted',          classes: 'text-adv-teal border-adv-teal/40 bg-adv-teal/10' },
  declined:    { label: 'Declined',          classes: 'text-adv-gray border-border bg-adv-dark' },
  in_progress: { label: 'In progress',       classes: 'text-adv-blue border-adv-blue/40 bg-adv-blue/10' },
  completed:   { label: 'Completed',         classes: 'text-adv-green border-adv-green/40 bg-adv-green/10' },
  failed:      { label: 'Failed',            classes: 'text-adv-red border-adv-red/40 bg-adv-red/10' },
};

export default function MissionInboxPage() {
  const [items, setItems] = useState<InboundDelegation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetchWithAuth('/api/missions/delegations/inbound', { headers: getAuthHeader() });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setItems(data.delegations ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Poll every 30s in case new delegations arrive while the page is open
  useEffect(() => {
    const iv = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void load();
    }, 30_000);
    return () => clearInterval(iv);
  }, [load]);

  async function act(delegationId: string, action: 'accept' | 'decline', body?: Record<string, unknown>): Promise<void> {
    setActing(delegationId); setError(null);
    try {
      const res = await fetchWithAuth(`/api/missions/delegations/${delegationId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActing(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-4">
      <Link to="/missions" className="inline-flex items-center gap-1 text-xs text-adv-gray hover:text-adv-teal">
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to Missions
      </Link>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold text-adv-off-white inline-flex items-center gap-2">
            <Inbox className="h-5 w-5 text-adv-teal" />
            Mission Inbox
          </h1>
          <p className="text-xs text-adv-gray mt-1">
            Inbound mission delegations from peer ANTON instances over AAP.
            Signatures are verified before any work begins.
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:text-adv-off-white inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          <RefreshCcw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded border border-adv-red/30 bg-adv-red/10 px-3 py-2 text-[12px] text-adv-red flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      {loading && items.length === 0 ? (
        <div className="text-center text-xs text-adv-gray py-12">Loading…</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Inbox className="h-8 w-8 text-adv-gray mx-auto mb-3" />
          <p className="text-sm text-adv-off-white">No pending inbound delegations.</p>
          <p className="text-xs text-adv-gray mt-1">When a peer ANTON delegates work to you, it shows up here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(d => {
            const meta = STATUS_META[d.status];
            const sigOk = d.signature_verified === true;
            const decisionable = d.status === 'received' && sigOk;
            return (
              <div key={d.id} className="rounded-xl border border-border bg-adv-card p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-sm font-semibold text-adv-off-white">{d.brief_title}</h2>
                      <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-medium ${meta.classes}`}>
                        {meta.label}
                      </span>
                      {sigOk ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-adv-green" title="Ed25519 signature verified">
                          <Shield className="h-3 w-3" /> signed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] text-adv-red" title="Signature failed verification — cannot accept">
                          <ShieldOff className="h-3 w-3" /> unverified
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-adv-off-white whitespace-pre-wrap">{d.brief_objective}</p>
                    {d.expected_output && (
                      <div className="text-[11px] text-adv-gray">
                        <span className="font-semibold">Expected output:</span> {d.expected_output}
                      </div>
                    )}
                    <div className="text-[10px] text-adv-gray flex items-center gap-3 flex-wrap">
                      <span>From {d.peer_display_name ?? d.peer_contact_hash.slice(0, 16) + '…'}</span>
                      <span>Received {new Date(d.created_at).toLocaleString()}</span>
                      {d.deadline && <span>Deadline {new Date(d.deadline).toLocaleString()}</span>}
                      {d.payment_amount_ftc != null && (
                        <span className="text-adv-teal">Payment {Number(d.payment_amount_ftc).toFixed(2)} FTC</span>
                      )}
                    </div>
                    {d.sub_mission_id && (
                      <div className="text-[11px]">
                        <Link to={`/missions/${d.sub_mission_id}`} className="text-adv-teal hover:underline">
                          → Open sub-mission
                        </Link>
                      </div>
                    )}
                  </div>
                  {decisionable && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => void act(d.id, 'accept', { create_sub_mission: true })}
                        disabled={acting === d.id}
                        className="rounded border border-adv-green/40 px-3 py-1.5 text-[11px] text-adv-green hover:bg-adv-green/10 inline-flex items-center gap-1 disabled:opacity-50"
                      >
                        <Check className="h-3.5 w-3.5" /> Accept
                      </button>
                      <button
                        onClick={() => {
                          const reason = prompt('Decline reason (optional):') ?? undefined;
                          void act(d.id, 'decline', { reason });
                        }}
                        disabled={acting === d.id}
                        className="rounded border border-adv-red/40 px-3 py-1.5 text-[11px] text-adv-red hover:bg-adv-red/10 inline-flex items-center gap-1 disabled:opacity-50"
                      >
                        <X className="h-3.5 w-3.5" /> Decline
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
