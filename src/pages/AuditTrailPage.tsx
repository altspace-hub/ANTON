/**
 * AuditTrailPage — consolidated reasoning-trails viewer.
 *
 * Backend: /api/audit-trail (server/routes/audit-trail.ts → trails-aggregator-service.ts)
 *
 * Shipped per ANTON_Improvement_and_Investigation_Brief.md §C.2. Distinct from
 * AuditLogPage (which surfaces compliance/security events, not reasoning trails).
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, FileSearch, Filter, Loader2, ShieldCheck } from 'lucide-react';
import { getAuthHeader } from '../lib/api';

type TrailKind = 'ire_revelation' | 'workflow_run' | 'signed_delivery' | 'evidence_pack' | 'renderer_artifact';

interface TrailEntry {
  id: string;
  kind: TrailKind;
  title: string;
  summary: string;
  actorId: string | null;
  sessionId: string | null;
  emittedAt: string;
  payload: Record<string, unknown>;
  signatureStatus: 'ok' | 'invalid' | 'unverified' | null;
}

interface TrailListResult {
  entries: TrailEntry[];
  total: number;
  hasMore: boolean;
}

const KIND_LABEL: Record<TrailKind, string> = {
  ire_revelation: 'IRE revelation',
  workflow_run: 'Workflow run',
  signed_delivery: 'Signed delivery',
  evidence_pack: 'Evidence pack',
  renderer_artifact: 'Renderer artifact',
};

const KIND_COLOR: Record<TrailKind, string> = {
  ire_revelation: 'bg-adv-teal/20 text-adv-teal',
  workflow_run: 'bg-adv-blue/20 text-adv-blue',
  signed_delivery: 'bg-adv-gold/20 text-adv-gold',
  evidence_pack: 'bg-adv-green/20 text-adv-green',
  renderer_artifact: 'bg-adv-card text-adv-off-white',
};

export default function AuditTrailPage() {
  const [entries, setEntries] = useState<TrailEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<TrailEntry | null>(null);

  // Filters
  const [activeKinds, setActiveKinds] = useState<Set<TrailKind>>(new Set(Object.keys(KIND_LABEL) as TrailKind[]));
  const [q, setQ] = useState('');
  const [signature, setSignature] = useState<'all' | 'ok' | 'invalid' | 'unverified' | 'unsigned'>('all');
  const [offset, setOffset] = useState(0);
  const [limit] = useState(50);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (activeKinds.size > 0 && activeKinds.size < Object.keys(KIND_LABEL).length) {
      params.set('kinds', [...activeKinds].join(','));
    }
    if (q.trim()) params.set('q', q.trim());
    if (signature !== 'all') params.set('signature', signature);
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    return params.toString();
  }, [activeKinds, q, signature, limit, offset]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/audit-trail?${queryString}`, { headers: getAuthHeader() })
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<TrailListResult>;
      })
      .then(data => {
        if (cancelled) return;
        setEntries(data.entries);
        setTotal(data.total);
        setHasMore(data.hasMore);
      })
      .catch(err => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load trails');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [queryString]);

  const toggleKind = (k: TrailKind) => {
    const next = new Set(activeKinds);
    if (next.has(k)) next.delete(k); else next.add(k);
    if (next.size === 0) return; // require at least one kind
    setActiveKinds(next);
    setOffset(0);
  };

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/" className="text-adv-gray hover:text-adv-teal" aria-label="Back">
            <ChevronLeft size={20} />
          </Link>
          <FileSearch className="text-adv-teal" size={24} />
          <div>
            <h1 className="text-2xl font-semibold">Audit Trail</h1>
            <p className="text-adv-gray text-sm">
              Consolidated view of every reasoning trail ANTON has emitted. IRE revelations,
              workflow runs, signed deliveries, evidence packs, and renderer audit.
            </p>
          </div>
        </div>

        {/* Filter bar */}
        <div className="bg-adv-card rounded-lg p-4 mb-4 space-y-3">
          <div className="flex items-center gap-2 text-sm text-adv-gray">
            <Filter size={14} /> Filter
          </div>

          <div className="flex flex-wrap gap-2">
            {(Object.keys(KIND_LABEL) as TrailKind[]).map(k => (
              <button
                key={k}
                onClick={() => toggleKind(k)}
                className={`px-3 py-1 rounded text-sm transition ${
                  activeKinds.has(k) ? KIND_COLOR[k] : 'bg-adv-dark-2 text-adv-gray'
                }`}
                aria-pressed={activeKinds.has(k)}
              >
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-3 items-center">
            <input
              type="search"
              value={q}
              onChange={e => { setQ(e.target.value); setOffset(0); }}
              placeholder="Search title or summary…"
              className="flex-1 min-w-[200px] bg-adv-dark-2 border border-adv-card px-3 py-2 rounded text-sm focus:outline-none focus:border-adv-teal"
            />
            <select
              value={signature}
              onChange={e => { setSignature(e.target.value as typeof signature); setOffset(0); }}
              className="bg-adv-dark-2 border border-adv-card px-3 py-2 rounded text-sm"
              aria-label="Signature status"
            >
              <option value="all">Signature: any</option>
              <option value="ok">Signature: ok</option>
              <option value="invalid">Signature: invalid</option>
              <option value="unverified">Signature: unverified</option>
              <option value="unsigned">Signature: unsigned / N/A</option>
            </select>
          </div>
        </div>

        {/* Feed */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            {error && (
              <div className="bg-adv-red/10 text-adv-red px-4 py-3 rounded mb-3">{error}</div>
            )}

            {loading ? (
              <div className="flex items-center gap-2 text-adv-gray py-12 justify-center">
                <Loader2 size={18} className="animate-spin" /> Loading trails…
              </div>
            ) : entries.length === 0 ? (
              <div className="bg-adv-card rounded-lg p-8 text-center text-adv-gray">
                No trails match the current filters.
              </div>
            ) : (
              <ul className="space-y-2">
                {entries.map(e => (
                  <li
                    key={e.id}
                    onClick={() => setSelected(e)}
                    className={`bg-adv-card rounded-lg p-4 cursor-pointer hover:bg-adv-card/80 transition ${selected?.id === e.id ? 'ring-1 ring-adv-teal' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2 py-0.5 rounded text-xs ${KIND_COLOR[e.kind]}`}>
                            {KIND_LABEL[e.kind]}
                          </span>
                          {e.signatureStatus && (
                            <span className="flex items-center gap-1 text-xs text-adv-gray">
                              <ShieldCheck size={12} /> {e.signatureStatus}
                            </span>
                          )}
                        </div>
                        <div className="font-medium truncate">{e.title}</div>
                        <div className="text-sm text-adv-gray truncate">{e.summary}</div>
                      </div>
                      <div className="text-xs text-adv-gray whitespace-nowrap">
                        {new Date(e.emittedAt).toLocaleString()}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {/* Pagination */}
            {!loading && total > 0 && (
              <div className="flex items-center justify-between mt-4 text-sm text-adv-gray">
                <div>
                  Showing {offset + 1}–{Math.min(offset + entries.length, total)} of {total}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setOffset(Math.max(0, offset - limit))}
                    disabled={offset === 0}
                    className="px-3 py-1 rounded bg-adv-card disabled:opacity-50"
                  >
                    Prev
                  </button>
                  <button
                    onClick={() => setOffset(offset + limit)}
                    disabled={!hasMore}
                    className="px-3 py-1 rounded bg-adv-card disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Detail drawer */}
          <aside className="lg:col-span-1">
            {selected ? (
              <div className="bg-adv-card rounded-lg p-4 sticky top-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-2 py-0.5 rounded text-xs ${KIND_COLOR[selected.kind]}`}>
                    {KIND_LABEL[selected.kind]}
                  </span>
                  {selected.signatureStatus && (
                    <span className="text-xs text-adv-gray">sig: {selected.signatureStatus}</span>
                  )}
                </div>
                <h2 className="font-semibold mb-1">{selected.title}</h2>
                <p className="text-sm text-adv-gray mb-3">{selected.summary}</p>

                <div className="text-xs text-adv-gray space-y-1 mb-3">
                  <div>ID: <code className="text-adv-off-white">{selected.id}</code></div>
                  <div>Emitted: {new Date(selected.emittedAt).toLocaleString()}</div>
                  {selected.sessionId && (
                    <div>
                      Session:{' '}
                      <Link to={`/sessions/${selected.sessionId}`} className="text-adv-teal hover:underline">
                        {selected.sessionId.slice(0, 12)}…
                      </Link>
                    </div>
                  )}
                  {selected.actorId && <div>Actor: {selected.actorId}</div>}
                </div>

                <details className="text-xs">
                  <summary className="cursor-pointer text-adv-gray">Payload</summary>
                  <pre className="mt-2 bg-adv-dark-2 p-2 rounded overflow-x-auto text-adv-off-white">
                    {JSON.stringify(selected.payload, null, 2)}
                  </pre>
                </details>

                <button
                  onClick={() => setSelected(null)}
                  className="mt-3 text-xs text-adv-gray hover:text-adv-off-white"
                >
                  Close
                </button>
              </div>
            ) : (
              <div className="bg-adv-card rounded-lg p-4 text-sm text-adv-gray text-center">
                Select a trail to inspect.
              </div>
            )}
          </aside>
        </div>

        <div className="mt-6 text-xs text-adv-gray">
          Backend: <code>/api/audit-trail</code> · service{' '}
          <code>server/services/trails-aggregator-service.ts</code>. Export to{' '}
          <code>.anton evidence-pack</code> via the existing Evidence Pack builder.
        </div>
      </div>
    </div>
  );
}
