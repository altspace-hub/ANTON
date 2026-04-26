/**
 * BeehiveSignalsPage — weak-signal inbox + cross-peer aggregates.
 *
 * Two views: incoming (raw inbox per-peer) and aggregated (rolled up
 * across peers). The aggregated view is the more useful one in
 * production — it shows "this signal is being reported by 5 peers
 * with combined trust score 3.7" rather than 5 separate items.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Hexagon, Inbox, Layers, AlertTriangle } from 'lucide-react';
import { getAuthHeader } from '../../lib/api';

interface InboxSignal {
  id: string;
  from_peer_id: string;
  received_at: string;
  signal_kind: string;
  topic_tags: string[];
  jurisdiction: string | null;
  urgency: 'low' | 'normal' | 'high' | 'critical';
  payload: Record<string, unknown>;
  status: 'unread' | 'read' | 'actioned' | 'dismissed' | 'duplicate';
}

interface SignalAggregate {
  id: string;
  aggregate_key: string;
  first_seen_at: string;
  last_seen_at: string;
  signal_kind: string;
  topic_tags: string[];
  representative_payload: Record<string, unknown>;
  attestation_count: number;
  weighted_score: number | null;
  status: 'open' | 'investigating' | 'actioned' | 'noise' | 'closed';
}

const URGENCY_META: Record<InboxSignal['urgency'], { classes: string }> = {
  low:      { classes: 'text-adv-gray border-border bg-adv-dark' },
  normal:   { classes: 'text-adv-blue border-adv-blue/40 bg-adv-blue/10' },
  high:     { classes: 'text-adv-gold border-adv-gold/40 bg-adv-gold/10' },
  critical: { classes: 'text-adv-red border-adv-red/40 bg-adv-red/10' },
};

export default function BeehiveSignalsPage() {
  const [view, setView] = useState<'aggregates' | 'inbox'>('aggregates');
  const [inbox, setInbox] = useState<InboxSignal[]>([]);
  const [aggregates, setAggregates] = useState<SignalAggregate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/beehive/signals/inbox', { headers: getAuthHeader() }).then(r => r.json()).catch(() => ({ signals: [] })),
      fetch('/api/beehive/signals/aggregates', { headers: getAuthHeader() }).then(r => r.json()).catch(() => ({ aggregates: [] })),
    ])
      .then(([i, a]: [{ signals?: InboxSignal[] }, { aggregates?: SignalAggregate[] }]) => {
        setInbox(i.signals ?? []);
        setAggregates(a.aggregates ?? []);
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load signals'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/community/beehive" className="text-adv-gray hover:text-adv-teal" aria-label="Back"><ChevronLeft size={20} /></Link>
          <Inbox className="text-adv-teal" size={24} />
          <div>
            <h1 className="text-2xl font-semibold">Swarm signals</h1>
            <p className="text-adv-gray text-sm">Weak signals from peer instances. Aggregated view rolls up the same signal across multiple peers.</p>
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          <button onClick={() => setView('aggregates')}
            className={`px-3 py-2 rounded text-sm ${view === 'aggregates' ? 'bg-adv-teal text-adv-dark' : 'bg-adv-card text-adv-off-white'}`}>
            <Layers size={14} className="inline mr-1" /> Aggregated ({aggregates.length})
          </button>
          <button onClick={() => setView('inbox')}
            className={`px-3 py-2 rounded text-sm ${view === 'inbox' ? 'bg-adv-teal text-adv-dark' : 'bg-adv-card text-adv-off-white'}`}>
            <Inbox size={14} className="inline mr-1" /> Inbox ({inbox.length})
          </button>
        </div>

        {error && <div className="bg-adv-red/10 text-adv-red p-3 rounded mb-3">{error}</div>}

        {loading ? (
          <div className="text-center text-adv-gray py-12">Loading signals…</div>
        ) : view === 'aggregates' ? (
          aggregates.length === 0 ? (
            <div className="bg-adv-card rounded-lg p-8 text-center text-adv-gray">
              <Hexagon className="mx-auto mb-2 text-adv-gray/40" size={32} />
              No aggregated signals yet. Aggregates form when 2+ peers report the same signal within a window.
            </div>
          ) : (
            <ul className="space-y-2">
              {aggregates.map(a => (
                <li key={a.id} className="bg-adv-card rounded-lg p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <code className="text-adv-teal text-xs">{a.signal_kind}</code>
                        <span className="text-xs text-adv-gray">{a.attestation_count} peers attest</span>
                        {a.weighted_score != null && (
                          <span className="text-xs text-adv-gray">trust-weighted {a.weighted_score.toFixed(1)}</span>
                        )}
                      </div>
                      <pre className="text-xs text-adv-gray whitespace-pre-wrap line-clamp-3">
                        {JSON.stringify(a.representative_payload, null, 2)}
                      </pre>
                      {a.topic_tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {a.topic_tags.map(t => (
                            <span key={t} className="text-xs px-1.5 py-0.5 rounded bg-adv-dark text-adv-blue">{t}</span>
                          ))}
                        </div>
                      )}
                      <div className="text-xs text-adv-gray mt-2">
                        First seen {new Date(a.first_seen_at).toLocaleString()} ·
                        Last {new Date(a.last_seen_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : (
          inbox.length === 0 ? (
            <div className="bg-adv-card rounded-lg p-8 text-center text-adv-gray">
              No inbox signals. Subscribe to swarm topics via the peers page or API.
            </div>
          ) : (
            <ul className="space-y-2">
              {inbox.map(s => {
                const um = URGENCY_META[s.urgency];
                return (
                  <li key={s.id} className="bg-adv-card rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${um.classes}`}>
                            {s.urgency === 'critical' && <AlertTriangle size={10} className="mr-1" />}
                            {s.urgency}
                          </span>
                          <code className="text-adv-teal text-xs">{s.signal_kind}</code>
                          {s.jurisdiction && <span className="text-xs text-adv-gray">{s.jurisdiction}</span>}
                          {s.status === 'unread' && <span className="text-xs text-adv-teal">unread</span>}
                        </div>
                        <pre className="text-xs text-adv-gray whitespace-pre-wrap line-clamp-3">
                          {JSON.stringify(s.payload, null, 2)}
                        </pre>
                        <div className="text-xs text-adv-gray mt-2">
                          From peer {s.from_peer_id.slice(0, 12)}… · {new Date(s.received_at).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )
        )}
      </div>
    </div>
  );
}
