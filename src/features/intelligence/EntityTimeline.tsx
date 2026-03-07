import { useState, useEffect, useCallback } from 'react';
import { Network, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────

interface EntityRef {
  atom_id: string;
  entity_type: string;
  entity_id: string;
  entity_name: string | null;
  relationship: string | null;
}

interface KnowledgeAtom {
  id: string;
  source_workflow_id: string;
  source_execution_id: string;
  source_area_id: string | null;
  content: string;
  atom_type: string;
  confidence: number;
  category: string;
  subcategory: string | null;
  sentiment: string | null;
  temporal_type: string | null;
  created_at: string;
  entity_refs: EntityRef[];
}

interface EntityConnection {
  entity_type: string;
  entity_id: string;
  entity_name: string | null;
  shared_atom_count: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const ENTITY_TYPES = ['customer', 'product', 'department', 'system', 'regulation', 'person', 'project', 'vendor'];

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('openexpert-token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

function getWeekKey(iso: string): string {
  try {
    const d = new Date(iso);
    // Monday of the week
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    d.setDate(d.getDate() + diff);
    return d.toISOString().slice(0, 10);
  } catch {
    return iso.slice(0, 10);
  }
}

function sentimentBg(s: string | null): string {
  switch (s) {
    case 'positive': return 'border-l-adv-green';
    case 'negative': return 'border-l-adv-red';
    case 'warning':  return 'border-l-adv-gold';
    case 'critical': return 'border-l-adv-red';
    default:         return 'border-l-adv-gray/40';
  }
}

function sentimentDot(s: string | null): string {
  switch (s) {
    case 'positive': return 'bg-adv-green';
    case 'negative': return 'bg-adv-red';
    case 'warning':  return 'bg-adv-gold';
    case 'critical': return 'bg-adv-red';
    default:         return 'bg-adv-gray-med';
  }
}

function categoryBadge(c: string): string {
  switch (c) {
    case 'observation':    return 'bg-adv-blue/20 text-adv-blue';
    case 'decision':       return 'bg-adv-teal-dim text-adv-teal';
    case 'action':         return 'bg-adv-green/20 text-adv-green';
    case 'risk':           return 'bg-adv-red/20 text-adv-red';
    case 'status':         return 'bg-adv-gold/20 text-adv-gold';
    case 'recommendation': return 'bg-adv-blue/10 text-adv-blue';
    default:               return 'bg-adv-card text-adv-gray';
  }
}

// ── Timeline Entry ──────────────────────────────────────────────────────────

function TimelineEntry({ atom }: { atom: KnowledgeAtom }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`border-l-4 pl-4 pb-4 ${sentimentBg(atom.sentiment)}`}>
      <div className="flex items-start gap-3">
        <div className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${sentimentDot(atom.sentiment)}`} />
        <div className="flex-1 min-w-0">
          {/* Date + category */}
          <div className="mb-1 flex items-center gap-2">
            <span className="text-xs text-adv-gray">{formatDate(atom.created_at)}</span>
            <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${categoryBadge(atom.category)}`}>
              {atom.category}
            </span>
            {atom.source_area_id && (
              <span className="text-xs text-adv-gray">/ {atom.source_area_id}</span>
            )}
          </div>

          {/* Content */}
          <p className="text-sm text-adv-off-white leading-snug">{atom.content}</p>

          {/* Type tag */}
          <div className="mt-1.5 flex items-center gap-2">
            <span className="rounded bg-adv-dark-2 px-1.5 py-0.5 text-xs font-mono text-adv-gray">
              {atom.atom_type}
            </span>
            {atom.temporal_type && (
              <span className="text-xs text-adv-gray">{atom.temporal_type}</span>
            )}
          </div>

          {/* Toggle details */}
          {atom.entity_refs.length > 0 && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="mt-2 flex items-center gap-1 text-[11px] text-adv-teal hover:text-adv-teal-dark"
              aria-expanded={expanded}
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {atom.entity_refs.length} related entit{atom.entity_refs.length === 1 ? 'y' : 'ies'}
            </button>
          )}

          {expanded && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {atom.entity_refs.map((ref) => (
                <span
                  key={`${ref.entity_type}:${ref.entity_id}`}
                  className="rounded-full border border-adv-teal/20 bg-adv-teal-soft px-2 py-0.5 text-[11px] text-adv-teal"
                >
                  {ref.entity_type}: {ref.entity_name ?? ref.entity_id}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Week group ─────────────────────────────────────────────────────────────

function WeekGroup({ weekKey, atoms }: { weekKey: string; atoms: KnowledgeAtom[] }) {
  // Count sentiments in this week
  const sentimentCounts: Record<string, number> = {};
  for (const a of atoms) {
    if (a.sentiment) sentimentCounts[a.sentiment] = (sentimentCounts[a.sentiment] ?? 0) + 1;
  }

  const weekLabel = (() => {
    try {
      const d = new Date(weekKey + 'T00:00:00');
      return `Week of ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    } catch {
      return weekKey;
    }
  })();

  return (
    <div className="mb-6">
      {/* Week header */}
      <div className="mb-3 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-adv-gray">{weekLabel}</span>
          <span className="rounded-full bg-adv-dark-2 px-2 py-0.5 text-xs text-adv-gray">
            {atoms.length}
          </span>
          {Object.entries(sentimentCounts).map(([s, n]) => (
            <span key={s} className={`text-xs ${sentimentDot(s) === 'bg-adv-green' ? 'text-adv-green' : sentimentDot(s) === 'bg-adv-red' ? 'text-adv-red' : 'text-adv-gold'}`}>
              {n} {s}
            </span>
          ))}
        </div>
        <div className="h-px flex-1 bg-border" />
      </div>

      {/* Timeline entries */}
      <div className="space-y-0">
        {atoms.map((atom) => (
          <TimelineEntry key={atom.id} atom={atom} />
        ))}
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export default function EntityTimeline() {
  const [entityType, setEntityType] = useState(ENTITY_TYPES[0]);
  const [entityId, setEntityId] = useState('');
  const [entityIdInput, setEntityIdInput] = useState('');
  const [atoms, setAtoms] = useState<KnowledgeAtom[]>([]);
  const [connections, setConnections] = useState<EntityConnection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEntity = useCallback(async () => {
    if (!entityId.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/knowledge/entities/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`,
        { headers: authHeaders() }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { atoms: KnowledgeAtom[]; connections: EntityConnection[] };
      setAtoms(Array.isArray(data.atoms) ? data.atoms : []);
      setConnections(Array.isArray(data.connections) ? data.connections : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load entity');
      setAtoms([]);
      setConnections([]);
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    if (entityId.trim()) {
      fetchEntity();
    }
  }, [fetchEntity]);

  function handleSearch() {
    setEntityId(entityIdInput.trim());
  }

  // Group atoms by week (descending)
  const grouped: Array<{ weekKey: string; atoms: KnowledgeAtom[] }> = [];
  const weekMap: Record<string, KnowledgeAtom[]> = {};
  for (const atom of atoms) {
    const wk = getWeekKey(atom.created_at);
    if (!weekMap[wk]) weekMap[wk] = [];
    weekMap[wk].push(atom);
  }
  const sortedWeeks = Object.keys(weekMap).sort((a, b) => b.localeCompare(a));
  for (const wk of sortedWeeks) {
    grouped.push({ weekKey: wk, atoms: weekMap[wk] });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-adv-teal-dim">
          <Network className="h-5 w-5 text-adv-teal" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-adv-off-white">Entity Timeline</h1>
          <p className="text-sm text-adv-gray">Chronological knowledge history for any entity</p>
        </div>
      </div>

      {/* Entity selector */}
      <div className="rounded-xl border border-border bg-adv-card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-adv-gray">Entity Type</label>
            <select
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              className="w-full rounded-lg border border-border bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            >
              {ENTITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-[2]">
            <label className="mb-1 block text-xs font-medium text-adv-gray">Entity ID</label>
            <input
              type="text"
              value={entityIdInput}
              onChange={(e) => setEntityIdInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Enter entity ID or name..."
              className="w-full rounded-lg border border-border bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={!entityIdInput.trim() || loading}
            className="shrink-0 rounded-lg bg-adv-teal px-4 py-2 text-sm font-semibold text-adv-dark hover:bg-adv-teal-dark disabled:opacity-40 transition-colors"
          >
            {loading ? 'Loading...' : 'Search'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-adv-red/30 bg-adv-red/10 px-4 py-3 text-sm text-adv-red">
          {error}
        </div>
      )}

      {/* Empty state — no entity searched */}
      {!entityId && !loading && (
        <div className="flex flex-col items-center gap-3 py-16 text-center text-adv-gray">
          <Network className="h-10 w-10 opacity-30" />
          <p className="text-sm">Select an entity type and enter an ID to view its knowledge timeline.</p>
        </div>
      )}

      {/* Results */}
      {entityId && !loading && !error && (
        <>
          {/* Connected entities */}
          {connections.length > 0 && (
            <div className="rounded-xl border border-border bg-adv-card p-4">
              <h3 className="mb-3 text-sm font-semibold text-adv-off-white">
                Connected entities ({connections.length})
              </h3>
              <div className="flex flex-wrap gap-2">
                {connections.slice(0, 20).map((conn) => (
                  <button
                    key={`${conn.entity_type}:${conn.entity_id}`}
                    onClick={() => {
                      setEntityType(conn.entity_type);
                      setEntityIdInput(conn.entity_id);
                      setEntityId(conn.entity_id);
                    }}
                    className="flex items-center gap-1.5 rounded-full border border-border bg-adv-dark-2 px-3 py-1 text-xs text-adv-gray hover:border-adv-teal/30 hover:text-adv-teal transition-colors"
                    title={`${conn.shared_atom_count} shared atoms`}
                  >
                    <span className="opacity-60">{conn.entity_type}:</span>
                    <span>{conn.entity_name ?? conn.entity_id}</span>
                    <span className="rounded-full bg-adv-teal/20 px-1.5 text-adv-teal">
                      {conn.shared_atom_count}
                    </span>
                    <ExternalLink className="h-2.5 w-2.5 opacity-40" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Timeline */}
          {atoms.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center text-adv-gray">
              <Network className="h-10 w-10 opacity-30" />
              <p className="text-sm">No knowledge atoms found for this entity.</p>
            </div>
          ) : (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-adv-off-white">
                  Timeline: {entityType} / {entityId}
                </h2>
                <span className="text-xs text-adv-gray">
                  {atoms.length} atom{atoms.length !== 1 ? 's' : ''}
                </span>
              </div>
              {grouped.map(({ weekKey, atoms: weekAtoms }) => (
                <WeekGroup key={weekKey} weekKey={weekKey} atoms={weekAtoms} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
