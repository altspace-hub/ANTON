// RiskAtlasLandingPage — list of atlases + create-new entry.
// Mirrors the MissionsPage pattern: cards on a grid, status badges, click → workspace.

import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, ShieldAlert, Target, AlertCircle, RefreshCcw, Archive, Wrench } from 'lucide-react';
import { fetchWithAuth, getAuthHeader } from '../../lib/api';

type AtlasStatus = 'draft' | 'active' | 'review' | 'archived';

interface AtlasRow {
  id: string;
  name: string;
  description: string | null;
  industry_pack_id: string | null;
  status: AtlasStatus;
  mode: 'socratic' | 'draft' | 'expert' | 'autonomous';
  next_review_due_at: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_META: Record<AtlasStatus, { label: string; classes: string }> = {
  draft:    { label: 'Draft',    classes: 'text-adv-gray border-border bg-adv-dark' },
  active:   { label: 'Active',   classes: 'text-adv-teal border-adv-teal/40 bg-adv-teal/10' },
  review:   { label: 'In review',classes: 'text-adv-gold border-adv-gold/40 bg-adv-gold/10' },
  archived: { label: 'Archived', classes: 'text-adv-gray/70 border-border bg-adv-dark' },
};

export default function RiskAtlasLandingPage() {
  const [atlases, setAtlases] = useState<AtlasRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'archived'>('active');
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setError(null);
    try {
      const status = filter === 'all' ? '' : filter === 'active' ? '' : 'archived';
      const url = status ? `/api/atlas?status=${status}` : '/api/atlas';
      const res = await fetchWithAuth(url, { headers: getAuthHeader() });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      const items: AtlasRow[] = data.atlases ?? [];
      const visible = filter === 'active'
        ? items.filter(a => a.status !== 'archived')
        : filter === 'archived'
          ? items.filter(a => a.status === 'archived')
          : items;
      setAtlases(visible);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-adv-off-white inline-flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-adv-teal" />
            Risk Atlas
          </h1>
          <p className="mt-1 text-xs text-adv-gray">
            Universal seven-stage threat-path methodology. Build a living risk picture for any business — bakery to bank.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/atlas/small-business"
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:text-adv-off-white inline-flex items-center gap-1.5"
            title="Simplified view for small business owners"
          >
            Small business view
          </Link>
          <Link
            to="/atlas/new"
            className="rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark inline-flex items-center gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            New Atlas
          </Link>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:text-adv-off-white inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCcw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </header>

      <div className="flex items-center gap-1 border-b border-border">
        {(['active', 'archived', 'all'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px ${
              filter === f
                ? 'border-adv-teal text-adv-teal'
                : 'border-transparent text-adv-gray hover:text-adv-off-white'
            }`}
          >
            {f === 'active' ? 'Active' : f === 'archived' ? 'Archived' : 'All'}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded border border-adv-red/30 bg-adv-red/10 px-3 py-2 text-[12px] text-adv-red flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      {loading && atlases.length === 0 ? (
        <div className="text-center text-xs text-adv-gray py-12">Loading…</div>
      ) : atlases.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Target className="h-8 w-8 text-adv-gray mx-auto mb-3" />
          <p className="text-sm text-adv-off-white">
            {filter === 'archived' ? 'No archived atlases.' : 'No atlases yet.'}
          </p>
          <p className="text-xs text-adv-gray mt-1">
            {filter === 'archived' ? '' : 'Create one — pick an industry pack, paste a 1-paragraph description, and ANTON drafts the first three stages.'}
          </p>
          {filter !== 'archived' && (
            <button
              onClick={() => navigate('/atlas/new')}
              className="mt-4 rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark inline-flex items-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              Create your first Atlas
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {atlases.map(a => {
            const meta = STATUS_META[a.status];
            return (
              <Link
                key={a.id}
                to={`/atlas/${a.id}`}
                className="rounded-xl border border-border bg-adv-card p-4 hover:border-adv-teal/60 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-sm font-semibold text-adv-off-white truncate">{a.name}</h2>
                  <span className={`shrink-0 inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-medium ${meta.classes}`}>
                    {meta.label}
                  </span>
                </div>
                {a.description && (
                  <p className="mt-2 text-[11px] text-adv-gray line-clamp-2">{a.description}</p>
                )}
                <div className="mt-3 flex items-center gap-3 flex-wrap text-[10px] text-adv-gray">
                  {a.industry_pack_id && (
                    <span className="inline-flex items-center gap-1">
                      <Wrench className="h-3 w-3" />
                      {a.industry_pack_id}
                    </span>
                  )}
                  <span>Mode: {a.mode}</span>
                  {a.next_review_due_at && (
                    <span>Next review: {new Date(a.next_review_due_at).toLocaleDateString()}</span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <footer className="text-[10px] text-adv-gray flex items-center gap-2">
        <Archive className="h-3 w-3" />
        Archived atlases are retained as audit history; toggle "Archived" to view.
      </footer>
    </div>
  );
}
