/**
 * AgentEscalationsPage — pending + recent escalations queue.
 *
 * Operators handling agent fleet pick up escalations here. Critical /
 * high-priority items surface first; resolved items linger for audit.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, AlertTriangle, Bot, Clock, CheckCircle2, UserCheck } from 'lucide-react';
import { getAuthHeader } from '../../lib/api';

interface Escalation {
  id: string;
  agent_id: string;
  conversation_id: string;
  triggered_at: string;
  trigger_kind: 'out_of_scope' | 'low_confidence' | 'user_request' | 'sentiment_negative' | 'connector_failure' | 'policy_required' | 'manual';
  trigger_reason: string | null;
  context_summary_md: string | null;
  proposed_response: string | null;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'pending' | 'claimed' | 'in_progress' | 'resolved' | 'reassigned' | 'cancelled';
  claimed_by: string | null;
  claimed_at: string | null;
  resolved_at: string | null;
  resolution_md: string | null;
}

const PRIORITY_META: Record<Escalation['priority'], { classes: string; label: string }> = {
  critical: { classes: 'text-adv-red border-adv-red/40 bg-adv-red/10', label: 'CRITICAL' },
  high:     { classes: 'text-adv-gold border-adv-gold/40 bg-adv-gold/10', label: 'High' },
  medium:   { classes: 'text-adv-blue border-adv-blue/40 bg-adv-blue/10', label: 'Medium' },
  low:      { classes: 'text-adv-gray border-border bg-adv-dark', label: 'Low' },
};

const STATUS_META: Record<Escalation['status'], { classes: string; icon: React.ReactNode; label: string }> = {
  pending:     { classes: 'text-adv-red', icon: <AlertTriangle size={12} />, label: 'Pending' },
  claimed:     { classes: 'text-adv-gold', icon: <UserCheck size={12} />, label: 'Claimed' },
  in_progress: { classes: 'text-adv-blue', icon: <Clock size={12} />, label: 'In progress' },
  resolved:    { classes: 'text-adv-green', icon: <CheckCircle2 size={12} />, label: 'Resolved' },
  reassigned:  { classes: 'text-adv-gray', icon: <UserCheck size={12} />, label: 'Reassigned' },
  cancelled:   { classes: 'text-adv-gray', icon: <CheckCircle2 size={12} />, label: 'Cancelled' },
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function AgentEscalationsPage() {
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('pending');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/agents/escalations', { headers: getAuthHeader() })
      .then(r => r.json())
      .then((data: { escalations?: Escalation[] }) => setEscalations(data.escalations ?? []))
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load escalations'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = escalations.filter(e => !filterStatus || e.status === filterStatus);
  const pendingCount = escalations.filter(e => e.status === 'pending').length;
  const criticalCount = escalations.filter(e => e.status === 'pending' && e.priority === 'critical').length;

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/agents" className="text-adv-gray hover:text-adv-teal" aria-label="Back"><ChevronLeft size={20} /></Link>
          <AlertTriangle className="text-adv-teal" size={24} />
          <div>
            <h1 className="text-2xl font-semibold">Agent escalations</h1>
            <p className="text-adv-gray text-sm">Conversations where the agent triggered escalation per its policy.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-adv-card rounded-lg p-4">
            <div className="text-xs text-adv-gray">Pending</div>
            <div className="text-3xl font-bold text-adv-teal mt-1">{pendingCount}</div>
          </div>
          <div className="bg-adv-card rounded-lg p-4">
            <div className="text-xs text-adv-gray">Critical (pending)</div>
            <div className="text-3xl font-bold text-adv-red mt-1">{criticalCount}</div>
          </div>
          <div className="bg-adv-card rounded-lg p-4">
            <div className="text-xs text-adv-gray">Total this view</div>
            <div className="text-3xl font-bold text-adv-off-white mt-1">{filtered.length}</div>
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="bg-adv-card border border-adv-card px-3 py-2 rounded text-sm">
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="claimed">Claimed</option>
            <option value="in_progress">In progress</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>

        {error && <div className="bg-adv-red/10 text-adv-red p-3 rounded mb-3">{error}</div>}

        {loading ? (
          <div className="text-center text-adv-gray py-12">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="bg-adv-card rounded-lg p-8 text-center text-adv-gray">
            <Bot className="mx-auto mb-2 text-adv-gray/40" size={32} />
            No escalations matching this filter.
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map(e => {
              const pm = PRIORITY_META[e.priority];
              const sm = STATUS_META[e.status];
              return (
                <li key={e.id} className="bg-adv-card rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-bold ${pm.classes}`}>{pm.label}</span>
                        <span className={`inline-flex items-center gap-1 text-xs font-medium ${sm.classes}`}>{sm.icon}{sm.label}</span>
                        <code className="text-xs text-adv-teal">{e.trigger_kind}</code>
                      </div>
                      {e.trigger_reason && <p className="text-sm font-medium">{e.trigger_reason}</p>}
                      {e.context_summary_md && (
                        <p className="text-xs text-adv-gray mt-1 line-clamp-3">{e.context_summary_md}</p>
                      )}
                      <div className="text-xs text-adv-gray mt-2 flex items-center gap-2">
                        <span>Triggered {timeAgo(e.triggered_at)}</span>
                        {e.claimed_by && <span>· Claimed by {e.claimed_by}</span>}
                        {e.resolved_at && <span>· Resolved {timeAgo(e.resolved_at)}</span>}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
