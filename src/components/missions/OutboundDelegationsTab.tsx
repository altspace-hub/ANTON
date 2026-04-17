// Outbound delegations tab — sent delegations + approve/reject/cancel.
// Inbound delegations live at /missions/inbox (cross-mission view).

import { useEffect, useState, useCallback } from 'react';
import { Send, Check, X, AlertCircle, Shield, ShieldOff } from 'lucide-react';
import { fetchWithAuth, getAuthHeader } from '../../lib/api';

type DelegationStatus =
  | 'draft' | 'sent' | 'received' | 'accepted' | 'declined'
  | 'in_progress' | 'completed' | 'approved' | 'rejected'
  | 'cancelled' | 'failed';

interface Delegation {
  id: string;
  direction: 'outbound' | 'inbound';
  peer_contact_hash: string;
  peer_display_name: string | null;
  brief_title: string;
  brief_objective: string;
  status: DelegationStatus;
  signature_verified: boolean | null;
  result_signature_verified: boolean | null;
  rejection_reason: string | null;
  created_at: string;
  sent_at: string | null;
  completed_at: string | null;
  closed_at: string | null;
}

const STATUS_META: Record<DelegationStatus, { label: string; classes: string }> = {
  draft:       { label: 'Draft',       classes: 'text-adv-gray border-border bg-adv-dark' },
  sent:        { label: 'Sent',        classes: 'text-adv-blue border-adv-blue/40 bg-adv-blue/10' },
  received:    { label: 'Received',    classes: 'text-adv-blue border-adv-blue/40 bg-adv-blue/10' },
  accepted:    { label: 'Accepted',    classes: 'text-adv-teal border-adv-teal/40 bg-adv-teal/10' },
  declined:    { label: 'Declined',    classes: 'text-adv-gray border-border bg-adv-dark' },
  in_progress: { label: 'In progress', classes: 'text-adv-blue border-adv-blue/40 bg-adv-blue/10' },
  completed:   { label: 'Completed',   classes: 'text-adv-gold border-adv-gold/40 bg-adv-gold/10' },
  approved:    { label: 'Approved',    classes: 'text-adv-green border-adv-green/40 bg-adv-green/10' },
  rejected:    { label: 'Rejected',    classes: 'text-adv-red border-adv-red/40 bg-adv-red/10' },
  cancelled:   { label: 'Cancelled',   classes: 'text-adv-gray border-border bg-adv-dark' },
  failed:      { label: 'Failed',      classes: 'text-adv-red border-adv-red/40 bg-adv-red/10' },
};

export default function OutboundDelegationsTab({ missionId }: { missionId: string }) {
  const [items, setItems] = useState<Delegation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/missions/${missionId}/delegations`, { headers: getAuthHeader() });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setItems((data.delegations ?? []).filter((d: Delegation) => d.direction === 'outbound'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [missionId]);

  useEffect(() => { void load(); }, [load]);

  async function act(delegationId: string, action: 'send' | 'approve' | 'reject' | 'cancel', body?: Record<string, unknown>): Promise<void> {
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
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-adv-off-white">Outbound delegations</h2>
        <p className="text-[11px] text-adv-gray">
          Sub-missions delegated to peer ANTON instances over AAP. Inbound delegations live in
          {' '}
          <a href="/missions/inbox" className="text-adv-teal hover:underline">Mission Inbox</a>.
        </p>
      </div>

      {error && (
        <div className="rounded border border-adv-red/30 bg-adv-red/10 px-3 py-2 text-[12px] text-adv-red flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      {loading && items.length === 0 ? (
        <div className="text-center text-xs text-adv-gray py-8">Loading…</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <Send className="h-6 w-6 text-adv-gray mx-auto mb-2" />
          <p className="text-xs text-adv-gray">No outbound delegations.</p>
          <p className="text-[11px] text-adv-gray/70 mt-1">Delegate a sub-task from the task graph to a peer ANTON.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-adv-card divide-y divide-border">
          {items.map(d => {
            const meta = STATUS_META[d.status];
            return (
              <div key={d.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-adv-off-white truncate">{d.brief_title}</span>
                      <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-medium ${meta.classes}`}>
                        {meta.label}
                      </span>
                      {d.status === 'completed' && d.result_signature_verified && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-adv-green" title="Result signature verified">
                          <Shield className="h-3 w-3" /> signed
                        </span>
                      )}
                      {d.status === 'completed' && d.result_signature_verified === false && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-adv-red" title="Result signature failed">
                          <ShieldOff className="h-3 w-3" /> unverified
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-adv-gray line-clamp-2">{d.brief_objective}</p>
                    <p className="text-[10px] text-adv-gray">
                      to {d.peer_display_name ?? d.peer_contact_hash.slice(0, 12) + '…'}
                      {' · '}
                      created {new Date(d.created_at).toLocaleString()}
                      {d.sent_at && ` · sent ${new Date(d.sent_at).toLocaleString()}`}
                      {d.completed_at && ` · completed ${new Date(d.completed_at).toLocaleString()}`}
                    </p>
                    {d.rejection_reason && <p className="text-[11px] text-adv-red">{d.rejection_reason}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {d.status === 'draft' && (
                      <button onClick={() => void act(d.id, 'send')} disabled={acting === d.id}
                        className="rounded border border-adv-teal/40 px-2 py-1 text-[11px] text-adv-teal hover:bg-adv-teal/10 inline-flex items-center gap-1 disabled:opacity-50">
                        <Send className="h-3 w-3" /> Send
                      </button>
                    )}
                    {d.status === 'completed' && (
                      <>
                        <button onClick={() => void act(d.id, 'approve')} disabled={acting === d.id}
                          className="rounded border border-adv-green/40 px-2 py-1 text-[11px] text-adv-green hover:bg-adv-green/10 inline-flex items-center gap-1 disabled:opacity-50">
                          <Check className="h-3 w-3" /> Approve
                        </button>
                        <button onClick={() => {
                          const reason = prompt('Reason for rejection:');
                          if (reason) void act(d.id, 'reject', { reason });
                        }} disabled={acting === d.id}
                          className="rounded border border-adv-red/40 px-2 py-1 text-[11px] text-adv-red hover:bg-adv-red/10 inline-flex items-center gap-1 disabled:opacity-50">
                          <X className="h-3 w-3" /> Reject
                        </button>
                      </>
                    )}
                    {(d.status === 'sent' || d.status === 'received' || d.status === 'accepted' || d.status === 'in_progress') && (
                      <button onClick={() => {
                        const reason = prompt('Cancellation reason (optional):') ?? undefined;
                        void act(d.id, 'cancel', { reason });
                      }} disabled={acting === d.id}
                        className="rounded border border-border px-2 py-1 text-[11px] text-adv-gray hover:text-adv-off-white inline-flex items-center gap-1 disabled:opacity-50">
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
