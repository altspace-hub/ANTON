import { useEffect, useState, useCallback } from 'react';
import { BookOpen, Search, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';

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
  source_output_id: string | null;
  source_workflow_id: string;
  source_execution_id: string;
  source_area_id: string | null;
  source_module_id: string | null;
  content: string;
  atom_type: string;
  confidence: number;
  category: string;
  subcategory: string | null;
  sentiment: string | null;
  temporal_type: string | null;
  entities: string | null;
  tags: string | null;
  created_at: string;
  is_active: number;
  entity_refs: EntityRef[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function sentimentColor(s: string | null): string {
  switch (s) {
    case 'positive': return 'text-adv-green';
    case 'negative': return 'text-adv-red';
    case 'warning':  return 'text-adv-gold';
    case 'critical': return 'text-adv-red';
    default:         return 'text-adv-gray';
  }
}

function sentimentIcon(s: string | null): string {
  switch (s) {
    case 'positive': return '+';
    case 'negative': return '-';
    case 'warning':  return '!';
    case 'critical': return '!!';
    default:         return '~';
  }
}

function categoryColor(c: string): string {
  switch (c) {
    case 'observation':    return 'bg-adv-blue/20 text-adv-blue border-adv-blue/30';
    case 'decision':       return 'bg-adv-teal-dim text-adv-teal border-adv-teal/30';
    case 'action':         return 'bg-adv-green/20 text-adv-green border-adv-green/30';
    case 'risk':           return 'bg-adv-red/20 text-adv-red border-adv-red/30';
    case 'status':         return 'bg-adv-gold/20 text-adv-gold border-adv-gold/30';
    case 'recommendation': return 'bg-adv-blue/10 text-adv-blue border-adv-blue/20';
    default:               return 'bg-adv-card text-adv-gray border-border';
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('openexpert-token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── Atom Card ──────────────────────────────────────────────────────────────

function AtomCard({ atom, onEntityClick }: {
  atom: KnowledgeAtom;
  onEntityClick: (type: string, id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-adv-card p-4 shadow-sm hover:border-adv-teal/30 transition-colors">
      {/* Header row */}
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${categoryColor(atom.category)}`}>
            {atom.category}
          </span>
          {atom.subcategory && (
            <span className="text-xs text-adv-gray-med">{atom.subcategory}</span>
          )}
          {atom.sentiment && (
            <span className={`text-xs font-mono font-bold ${sentimentColor(atom.sentiment)}`}>
              [{sentimentIcon(atom.sentiment)} {atom.sentiment}]
            </span>
          )}
        </div>
        <span className="shrink-0 text-xs text-adv-gray-med">{formatDate(atom.created_at)}</span>
      </div>

      {/* Atom content */}
      <p className="text-sm text-adv-off-white leading-relaxed">{atom.content}</p>

      {/* Type + area */}
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <span className="rounded bg-adv-dark-2 px-1.5 py-0.5 text-[11px] font-mono text-adv-gray-med">
          {atom.atom_type}
        </span>
        {atom.source_area_id && (
          <span className="rounded bg-adv-dark-2 px-1.5 py-0.5 text-[11px] text-adv-gray">
            area: {atom.source_area_id}
          </span>
        )}
        <span className="text-[11px] text-adv-gray-med">
          {Math.round(atom.confidence * 100)}% confidence
        </span>
      </div>

      {/* Expand toggle */}
      {atom.entity_refs.length > 0 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 flex items-center gap-1 text-xs text-adv-teal hover:text-adv-teal-dark transition-colors"
          aria-expanded={expanded}
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {atom.entity_refs.length} entit{atom.entity_refs.length === 1 ? 'y' : 'ies'}
        </button>
      )}

      {/* Entities (expanded) */}
      {expanded && atom.entity_refs.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
          {atom.entity_refs.map((ref) => (
            <button
              key={`${ref.entity_type}:${ref.entity_id}`}
              onClick={() => onEntityClick(ref.entity_type, ref.entity_id)}
              className="flex items-center gap-1 rounded-full border border-adv-teal/30 bg-adv-teal-soft px-2.5 py-0.5 text-xs text-adv-teal hover:bg-adv-teal-dim transition-colors"
              title={`View all atoms about ${ref.entity_name ?? ref.entity_id}`}
            >
              <span className="opacity-60">{ref.entity_type}:</span>
              <span>{ref.entity_name ?? ref.entity_id}</span>
              <ExternalLink className="h-2.5 w-2.5 opacity-50" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Filter chip ────────────────────────────────────────────────────────────

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
        active
          ? 'border-adv-teal bg-adv-teal-dim text-adv-teal shadow-[0_0_8px_rgba(45,212,168,0.3)]'
          : 'border-border bg-adv-card text-adv-gray hover:border-adv-teal/30 hover:text-adv-off-white'
      }`}
    >
      {label}
    </button>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function AtomBrowser() {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [areaFilter, setAreaFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [sentimentFilter, setSentimentFilter] = useState<string | null>(null);
  const [atoms, setAtoms] = useState<KnowledgeAtom[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Entity drill-down
  const [entityContext, setEntityContext] = useState<{ type: string; id: string } | null>(null);

  // Debounce the search query
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const fetchAtoms = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (debouncedQuery) params.set('q', debouncedQuery);
      if (areaFilter) params.set('area', areaFilter);
      if (typeFilter) params.set('type', typeFilter);
      if (sentimentFilter) params.set('sentiment', sentimentFilter);
      if (entityContext) {
        params.set('entity_type', entityContext.type);
        params.set('entity_id', entityContext.id);
      }

      const res = await fetch(`/api/knowledge/atoms?${params.toString()}`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { atoms: KnowledgeAtom[] };
      setAtoms(Array.isArray(data.atoms) ? data.atoms : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load atoms');
      setAtoms([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, areaFilter, typeFilter, sentimentFilter, entityContext]);

  useEffect(() => {
    fetchAtoms();
  }, [fetchAtoms]);

  const handleEntityClick = (type: string, id: string) => {
    setEntityContext({ type, id });
    setQuery('');
  };

  const clearEntityContext = () => setEntityContext(null);

  const CATEGORY_FILTERS = ['observation', 'decision', 'action', 'risk', 'status', 'recommendation'];
  const SENTIMENT_FILTERS = ['positive', 'negative', 'warning', 'critical', 'neutral'];

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-adv-teal-dim">
          <BookOpen className="h-5 w-5 text-adv-teal" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-adv-off-white">Knowledge Browser</h1>
          <p className="text-sm text-adv-gray">Explore knowledge atoms extracted from workflow outputs</p>
        </div>
      </div>

      {/* Entity context banner */}
      {entityContext && (
        <div className="flex items-center justify-between rounded-xl border border-adv-teal/30 bg-adv-teal-soft px-4 py-3">
          <div className="text-sm text-adv-teal">
            Showing all atoms about{' '}
            <span className="font-semibold">{entityContext.type}: {entityContext.id}</span>
          </div>
          <button
            onClick={clearEntityContext}
            className="text-xs text-adv-teal underline hover:text-adv-teal-dark"
          >
            Clear filter
          </button>
        </div>
      )}

      {/* Search box */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-adv-gray-med" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search knowledge atoms..."
          className="w-full rounded-xl border border-border bg-adv-card py-3 pl-10 pr-4 text-sm text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none focus:ring-1 focus:ring-adv-teal"
        />
      </div>

      {/* Filter chips — category */}
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-adv-gray-med">
          Category
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterChip
            label="All"
            active={typeFilter === null}
            onClick={() => setTypeFilter(null)}
          />
          {CATEGORY_FILTERS.map((cat) => (
            <FilterChip
              key={cat}
              label={cat.charAt(0).toUpperCase() + cat.slice(1)}
              active={typeFilter === cat}
              onClick={() => setTypeFilter(typeFilter === cat ? null : cat)}
            />
          ))}
        </div>
      </div>

      {/* Filter chips — sentiment */}
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-adv-gray-med">
          Sentiment
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterChip
            label="Any"
            active={sentimentFilter === null}
            onClick={() => setSentimentFilter(null)}
          />
          {SENTIMENT_FILTERS.map((s) => (
            <FilterChip
              key={s}
              label={s.charAt(0).toUpperCase() + s.slice(1)}
              active={sentimentFilter === s}
              onClick={() => setSentimentFilter(sentimentFilter === s ? null : s)}
            />
          ))}
        </div>
      </div>

      {/* Results */}
      <div>
        {loading && (
          <div className="flex justify-center py-12 text-adv-gray-med text-sm">
            Loading...
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-adv-red/30 bg-adv-red/10 px-4 py-3 text-sm text-adv-red">
            {error}
          </div>
        )}
        {!loading && !error && atoms.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 text-center text-adv-gray-med">
            <BookOpen className="h-10 w-10 opacity-30" />
            <p className="text-sm">No knowledge atoms yet.</p>
            <p className="text-xs">Atoms are extracted automatically after workflow steps complete.</p>
          </div>
        )}
        {!loading && !error && atoms.length > 0 && (
          <>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs text-adv-gray-med">{atoms.length} atom{atoms.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="space-y-3">
              {atoms.map((atom) => (
                <AtomCard key={atom.id} atom={atom} onEntityClick={handleEntityClick} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
