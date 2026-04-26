/**
 * BeehivePeersPage — directory of known peer ANTON instances.
 *
 * Shows trust score, last-seen, status, and the set of capabilities
 * each peer has advertised. Operators can block / unblock peers and
 * see why a peer is being routed to (or not).
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Hexagon, ShieldCheck, ShieldAlert, Globe2, Activity } from 'lucide-react';
import { getAuthHeader } from '../../lib/api';

interface BeehivePeer {
  id: string;
  peer_pubkey: string;
  display_name: string | null;
  endpoint_url: string;
  last_seen_at: string;
  trust_score: number;
  load_estimate: number | null;
  status: 'active' | 'inactive' | 'blocked' | 'suspect';
  blocked_reason: string | null;
}

interface BeehiveCapability {
  id: string;
  peer_id: string;
  capability_kind: string;
  capability_code: string;
  display_name: string;
  description: string | null;
  topic_tags: string[];
}

const STATUS_META: Record<BeehivePeer['status'], { label: string; classes: string }> = {
  active:   { label: 'Active',   classes: 'text-adv-teal border-adv-teal/40 bg-adv-teal/10' },
  inactive: { label: 'Inactive', classes: 'text-adv-gray border-border bg-adv-dark' },
  suspect:  { label: 'Suspect',  classes: 'text-adv-gold border-adv-gold/40 bg-adv-gold/10' },
  blocked:  { label: 'Blocked',  classes: 'text-adv-red border-adv-red/40 bg-adv-red/10' },
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

export default function BeehivePeersPage() {
  const [peers, setPeers] = useState<BeehivePeer[]>([]);
  const [caps, setCaps] = useState<BeehiveCapability[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/beehive/peers', { headers: getAuthHeader() }).then(r => r.json()).catch(() => ({ peers: [] })),
      fetch('/api/beehive/capabilities', { headers: getAuthHeader() }).then(r => r.json()).catch(() => ({ capabilities: [] })),
    ])
      .then(([p, c]: [{ peers?: BeehivePeer[] }, { capabilities?: BeehiveCapability[] }]) => {
        setPeers(p.peers ?? []);
        setCaps(c.capabilities ?? []);
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load peers'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = peers.filter(p => !filterStatus || p.status === filterStatus);

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/community/beehive" className="text-adv-gray hover:text-adv-teal" aria-label="Back"><ChevronLeft size={20} /></Link>
          <Hexagon className="text-adv-teal" size={24} />
          <div>
            <h1 className="text-2xl font-semibold">Beehive peers</h1>
            <p className="text-adv-gray text-sm">Known peer instances. Trust scores derived from interaction history; advertisements signed with peer Ed25519 keys.</p>
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="bg-adv-card border border-adv-card px-3 py-2 rounded text-sm">
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="suspect">Suspect</option>
            <option value="blocked">Blocked</option>
          </select>
        </div>

        {error && <div className="bg-adv-red/10 text-adv-red p-3 rounded mb-3">{error}</div>}

        {loading ? (
          <div className="text-center text-adv-gray py-12">Loading peers…</div>
        ) : filtered.length === 0 ? (
          <div className="bg-adv-card rounded-lg p-8 text-center text-adv-gray">
            No peers known yet. Pair with a peer ANTON instance via the Community tab to start populating the swarm.
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map(p => {
              const peerCaps = caps.filter(c => c.peer_id === p.id);
              const sm = STATUS_META[p.status];
              return (
                <li key={p.id} className="bg-adv-card rounded-lg p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${sm.classes}`}>
                          {sm.label}
                        </span>
                        <span className="text-xs text-adv-gray flex items-center gap-1">
                          {p.trust_score >= 0.6 ? <ShieldCheck size={12} /> : <ShieldAlert size={12} />}
                          trust {(p.trust_score * 100).toFixed(0)}%
                        </span>
                        {p.load_estimate != null && (
                          <span className="text-xs text-adv-gray flex items-center gap-1">
                            <Activity size={12} /> load {(p.load_estimate * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>
                      <div className="font-medium">{p.display_name ?? p.peer_pubkey.slice(0, 12) + '…'}</div>
                      <div className="text-xs text-adv-gray mt-1 flex items-center gap-1">
                        <Globe2 size={12} /> {p.endpoint_url}
                      </div>
                      <div className="text-xs text-adv-gray mt-1">last seen {timeAgo(p.last_seen_at)}</div>
                      {p.blocked_reason && (
                        <div className="text-xs text-adv-red mt-2">Blocked: {p.blocked_reason}</div>
                      )}
                      {peerCaps.length > 0 && (
                        <div className="mt-2">
                          <div className="text-xs text-adv-gray mb-1">Capabilities ({peerCaps.length}):</div>
                          <div className="flex flex-wrap gap-1">
                            {peerCaps.slice(0, 6).map(c => (
                              <code key={c.id} className="text-xs px-1.5 py-0.5 rounded bg-adv-dark text-adv-teal">
                                {c.capability_kind}/{c.capability_code}
                              </code>
                            ))}
                            {peerCaps.length > 6 && <span className="text-xs text-adv-gray">+{peerCaps.length - 6}</span>}
                          </div>
                        </div>
                      )}
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
