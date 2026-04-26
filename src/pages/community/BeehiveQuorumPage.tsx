/**
 * BeehiveQuorumPage — list + drill-in for quorum-vote requests.
 *
 * High-stakes decisions where a single LLM evaluation isn't enough get
 * routed to N peer instances to evaluate independently. This page shows
 * the requests, their status, and the per-peer responses + aggregated
 * verdict.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Hexagon, Vote, Users, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { getAuthHeader } from '../../lib/api';

interface QuorumRequest {
  id: string;
  request_kind: string;
  payload: Record<string, unknown>;
  requested_at: string;
  requested_by: string | null;
  quorum_size: number;
  min_quorum: number;
  expires_at: string;
  status: 'pending' | 'collecting' | 'reached' | 'failed_quorum' | 'expired' | 'cancelled';
  resolved_at: string | null;
  aggregate_result: Record<string, unknown> | null;
  notes: string | null;
}

interface QuorumResponse {
  id: string;
  request_id: string;
  peer_id: string;
  responded_at: string;
  vote_value: string;
  confidence: number | null;
  rationale_md: string | null;
}

const STATUS_META: Record<QuorumRequest['status'], { label: string; classes: string; icon: React.ReactNode }> = {
  pending:        { label: 'Pending',      classes: 'text-adv-gray border-border bg-adv-dark', icon: <Clock size={12} /> },
  collecting:     { label: 'Collecting',   classes: 'text-adv-blue border-adv-blue/40 bg-adv-blue/10', icon: <Users size={12} /> },
  reached:        { label: 'Quorum reached', classes: 'text-adv-green border-adv-green/40 bg-adv-green/10', icon: <CheckCircle2 size={12} /> },
  failed_quorum:  { label: 'Quorum failed', classes: 'text-adv-red border-adv-red/40 bg-adv-red/10', icon: <AlertTriangle size={12} /> },
  expired:        { label: 'Expired',      classes: 'text-adv-gold border-adv-gold/40 bg-adv-gold/10', icon: <Clock size={12} /> },
  cancelled:      { label: 'Cancelled',    classes: 'text-adv-gray border-border bg-adv-dark', icon: <Clock size={12} /> },
};

export default function BeehiveQuorumPage() {
  const [requests, setRequests] = useState<QuorumRequest[]>([]);
  const [selected, setSelected] = useState<QuorumRequest | null>(null);
  const [responses, setResponses] = useState<QuorumResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/beehive/quorum-requests', { headers: getAuthHeader() })
      .then(r => r.json())
      .then((data: { requests?: QuorumRequest[] }) => setRequests(data.requests ?? []))
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load quorum requests'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selected) { setResponses([]); return; }
    fetch(`/api/beehive/quorum-requests/${selected.id}/responses`, { headers: getAuthHeader() })
      .then(r => r.json())
      .then((data: { responses?: QuorumResponse[] }) => setResponses(data.responses ?? []))
      .catch(() => setResponses([]));
  }, [selected]);

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/community/beehive" className="text-adv-gray hover:text-adv-teal" aria-label="Back"><ChevronLeft size={20} /></Link>
          <Vote className="text-adv-teal" size={24} />
          <div>
            <h1 className="text-2xl font-semibold">Quorum requests</h1>
            <p className="text-adv-gray text-sm">High-stakes decisions evaluated by N peer instances independently. Aggregated locally.</p>
          </div>
        </div>

        {error && <div className="bg-adv-red/10 text-adv-red p-3 rounded mb-3">{error}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-2">
            {loading ? (
              <div className="text-center text-adv-gray py-12">Loading…</div>
            ) : requests.length === 0 ? (
              <div className="bg-adv-card rounded-lg p-6 text-center text-adv-gray text-sm">
                <Hexagon className="mx-auto mb-2 text-adv-gray/40" size={32} />
                No quorum requests yet. Create one programmatically via <code>POST /api/beehive/quorum-requests</code>.
              </div>
            ) : (
              <ul className="space-y-2">
                {requests.map(req => {
                  const sm = STATUS_META[req.status];
                  return (
                    <li key={req.id} onClick={() => setSelected(req)}
                      className={`bg-adv-card rounded-lg p-3 cursor-pointer hover:bg-adv-card/80 ${selected?.id === req.id ? 'ring-1 ring-adv-teal' : ''}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${sm.classes}`}>
                          {sm.icon}{sm.label}
                        </span>
                        <code className="text-xs text-adv-teal">{req.request_kind}</code>
                      </div>
                      <div className="text-sm font-medium">Quorum {req.min_quorum}/{req.quorum_size}</div>
                      <div className="text-xs text-adv-gray mt-1">expires {new Date(req.expires_at).toLocaleString()}</div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <aside className="lg:col-span-3">
            {selected ? (
              <div className="bg-adv-card rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <code className="text-adv-teal text-sm">{selected.request_kind}</code>
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${STATUS_META[selected.status].classes}`}>
                    {STATUS_META[selected.status].icon}{STATUS_META[selected.status].label}
                  </span>
                </div>
                <div className="text-sm text-adv-gray">
                  Requested: {new Date(selected.requested_at).toLocaleString()} ·
                  Quorum: {selected.min_quorum}/{selected.quorum_size}
                </div>
                <div>
                  <div className="text-xs text-adv-gray mb-1">Payload</div>
                  <pre className="text-xs bg-adv-dark p-3 rounded overflow-auto whitespace-pre-wrap">
                    {JSON.stringify(selected.payload, null, 2)}
                  </pre>
                </div>
                <div>
                  <div className="text-xs text-adv-gray mb-1">Peer responses ({responses.length})</div>
                  {responses.length === 0 ? (
                    <div className="text-sm text-adv-gray">No responses yet.</div>
                  ) : (
                    <ul className="space-y-2">
                      {responses.map(r => (
                        <li key={r.id} className="bg-adv-dark rounded p-2 text-xs">
                          <div className="flex items-center gap-2">
                            <code className="text-adv-teal">{r.peer_id.slice(0, 12)}…</code>
                            <span className="font-medium">{r.vote_value}</span>
                            {r.confidence != null && <span className="text-adv-gray">conf {(r.confidence * 100).toFixed(0)}%</span>}
                          </div>
                          {r.rationale_md && <p className="mt-1 text-adv-gray">{r.rationale_md}</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {selected.aggregate_result && (
                  <div>
                    <div className="text-xs text-adv-gray mb-1">Aggregate result</div>
                    <pre className="text-xs bg-adv-dark p-3 rounded overflow-auto">
                      {JSON.stringify(selected.aggregate_result, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-adv-card rounded-lg p-4 text-sm text-adv-gray text-center">
                Select a quorum request to see responses + aggregate.
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
