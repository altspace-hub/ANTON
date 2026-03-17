import { useEffect, useState, useCallback } from 'react';
import { ShieldCheck, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

interface AuditEntry {
  id: string;
  timestamp: string;
  session_id: string | null;
  module_id: string | null;
  area_id: string | null;
  model: string;
  provider: string;
  thinking_level: string | null;
  creativity: string | null;
  writing_tone: string | null;
  emoji_enabled: number;
  structured_reasoning: number;
  transparency_level: number;
  knowledge_sources_used: string | null;
  input_token_count: number;
  output_token_count: number;
  estimated_cost_usd: number;
  response_status: string;
  review_status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

interface AuditStats {
  totalCalls: number;
  callsToday: number;
  costThisMonth: number;
  byModel: Array<{ model: string; calls: number; total_cost: number }>;
  byModule: Array<{ module_id: string; calls: number }>;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: 'bg-adv-gray/20 text-adv-gray',
    reviewed: 'bg-adv-blue/20 text-adv-blue',
    approved: 'bg-adv-green/20 text-adv-green',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[status] || colors.draft}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    moduleId: '',
    status: '',
  });
  const pageSize = 50;

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.startDate) params.set('startDate', filters.startDate);
      if (filters.endDate) params.set('endDate', filters.endDate);
      if (filters.moduleId) params.set('moduleId', filters.moduleId);
      params.set('limit', String(pageSize));
      if (page > 0) params.set('offset', String(page * pageSize));
      const res = await fetch(`/api/audit?${params.toString()}`);
      const data = await res.json();
      const arr = Array.isArray(data) ? data : [];
      // Filter by review_status client-side if needed
      const filtered = filters.status
        ? arr.filter((e: AuditEntry) => e.review_status === filters.status)
        : arr;
      setEntries(filtered);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/audit/stats');
      setStats(await res.json());
    } catch {
      setStats(null);
    }
  }, []);

  useEffect(() => {
    fetchEntries();
    fetchStats();
  }, [fetchEntries, fetchStats]);

  const updateReviewStatus = async (id: string, status: string) => {
    try {
      await fetch(`/api/audit/${id}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      fetchEntries();
      fetchStats();
    } catch {
      // Silent fail
    }
  };

  const formatTimestamp = (ts: string) => {
    try {
      const d = new Date(ts);
      return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return ts;
    }
  };

  const formatCost = (cost: number) => `$${cost.toFixed(4)}`;

  const formatTokens = (input: number, output: number) => {
    const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
    return `${fmt(input)} / ${fmt(output)}`;
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-adv-teal/10">
          <ShieldCheck className="h-5 w-5 text-adv-teal" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-adv-white">Audit Log</h1>
          <p className="text-sm text-adv-gray">Every AI interaction recorded for compliance</p>
        </div>
      </div>

      {/* Stats Row */}
      {stats && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-adv-card p-4">
            <div className="text-sm text-adv-gray">Calls Today</div>
            <div className="mt-1 text-2xl font-semibold text-adv-white">{stats.callsToday || 0}</div>
          </div>
          <div className="rounded-lg border border-border bg-adv-card p-4">
            <div className="text-sm text-adv-gray">Cost This Month</div>
            <div className="mt-1 text-2xl font-semibold text-adv-white">${(stats.costThisMonth || 0).toFixed(2)}</div>
          </div>
          <div className="rounded-lg border border-border bg-adv-card p-4">
            <div className="text-sm text-adv-gray">Total Calls</div>
            <div className="mt-1 text-2xl font-semibold text-adv-white">{stats.totalCalls || 0}</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-adv-card p-4">
        <div>
          <label className="mb-1 block text-xs text-adv-gray">Start Date</label>
          <input
            type="date"
            className="rounded-md border border-border bg-adv-dark px-3 py-1.5 text-sm text-adv-off-white"
            value={filters.startDate}
            onChange={(e) => { setFilters((f) => ({ ...f, startDate: e.target.value })); setPage(0); }}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-adv-gray">End Date</label>
          <input
            type="date"
            className="rounded-md border border-border bg-adv-dark px-3 py-1.5 text-sm text-adv-off-white"
            value={filters.endDate}
            onChange={(e) => { setFilters((f) => ({ ...f, endDate: e.target.value })); setPage(0); }}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-adv-gray">Module</label>
          <input
            type="text"
            placeholder="e.g. gap-analysis"
            className="rounded-md border border-border bg-adv-dark px-3 py-1.5 text-sm text-adv-off-white placeholder:text-adv-gray"
            value={filters.moduleId}
            onChange={(e) => { setFilters((f) => ({ ...f, moduleId: e.target.value })); setPage(0); }}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-adv-gray">Status</label>
          <select
            className="rounded-md border border-border bg-adv-dark px-3 py-1.5 text-sm text-adv-off-white"
            value={filters.status}
            onChange={(e) => { setFilters((f) => ({ ...f, status: e.target.value })); setPage(0); }}
          >
            <option value="">All</option>
            <option value="draft">Draft</option>
            <option value="reviewed">Reviewed</option>
            <option value="approved">Approved</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border bg-adv-card">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-adv-teal" />
          </div>
        ) : entries.length === 0 ? (
          <div className="py-16 text-center text-adv-gray">
            No audit log entries yet. Run a module to see activity here.
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wider text-adv-gray">
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Module</th>
                <th className="px-4 py-3">Model</th>
                <th className="px-4 py-3">Tokens (In/Out)</th>
                <th className="px-4 py-3">Cost</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b border-border/50 hover:bg-adv-dark/30">
                  <td className="whitespace-nowrap px-4 py-3 text-adv-off-white">
                    {formatTimestamp(entry.timestamp)}
                  </td>
                  <td className="px-4 py-3 text-adv-off-white">
                    {entry.module_id || <span className="text-adv-gray">--</span>}
                  </td>
                  <td className="px-4 py-3 text-adv-off-white">
                    {entry.model.replace('claude-', '').split('-')[0]}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-adv-off-white">
                    {formatTokens(entry.input_token_count, entry.output_token_count)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-adv-off-white">
                    {formatCost(entry.estimated_cost_usd)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={entry.review_status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {entry.review_status === 'draft' && (
                        <button
                          onClick={() => updateReviewStatus(entry.id, 'reviewed')}
                          className="rounded bg-adv-blue/20 px-2 py-1 text-xs text-adv-blue hover:bg-adv-blue/30 transition-colors"
                        >
                          Mark Reviewed
                        </button>
                      )}
                      {(entry.review_status === 'draft' || entry.review_status === 'reviewed') && (
                        <button
                          onClick={() => updateReviewStatus(entry.id, 'approved')}
                          className="rounded bg-adv-green/20 px-2 py-1 text-xs text-adv-green hover:bg-adv-green/30 transition-colors"
                        >
                          Approve
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {!loading && entries.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-adv-gray">
            Page {page + 1} {entries.length === pageSize && '(more available)'}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="flex items-center gap-1 rounded-md border border-border bg-adv-card px-3 py-1.5 text-sm text-adv-off-white hover:bg-adv-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-4 w-4" /> Previous
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={entries.length < pageSize}
              className="flex items-center gap-1 rounded-md border border-border bg-adv-card px-3 py-1.5 text-sm text-adv-off-white hover:bg-adv-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
