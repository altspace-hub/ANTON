/**
 * PathfinderHistoryPage — Browse and manage search history
 */
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { History, Search, Trash2, Clock, Zap, Brain } from 'lucide-react';
import { fetchSearchHistory, deleteSearch } from '@/lib/pathfinder-api';

interface SearchRecord {
  id: string;
  query: string;
  depth: string;
  status: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  duration_ms: number;
  thread_id: string | null;
  created_at: string;
}

const DEPTH_ICONS = { quick: Zap, thorough: Search, deep: Brain } as const;

export default function PathfinderHistoryPage() {
  const [searches, setSearches] = useState<SearchRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  const load = useCallback(async () => {
    const data = await fetchSearchHistory(PAGE_SIZE, page * PAGE_SIZE);
    setSearches(data.searches as unknown as SearchRecord[]);
    setTotal(data.total);
  }, [page]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: string) {
    await deleteSearch(id);
    setSearches(prev => prev.filter(s => s.id !== id));
    setTotal(prev => prev - 1);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <History className="h-5 w-5 text-adv-teal" />
        <h1 className="text-lg font-semibold text-adv-white">Search History</h1>
        <span className="text-xs text-adv-gray">{total} searches</span>
      </div>

      {searches.length === 0 ? (
        <div className="rounded-xl border border-border bg-adv-card p-8 text-center">
          <Search className="mx-auto h-8 w-8 text-adv-gray/40 mb-2" />
          <p className="text-sm text-adv-gray">No searches yet. Start exploring with Pathfinder.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {searches.map(s => {
            const Icon = DEPTH_ICONS[s.depth as keyof typeof DEPTH_ICONS] || Search;
            return (
              <div key={s.id} className="flex items-center gap-3 rounded-xl border border-border bg-adv-card px-4 py-3 group">
                <Icon className="h-4 w-4 text-adv-teal shrink-0" />
                <Link
                  to={`/pathfinder?searchId=${s.id}`}
                  className="flex-1 min-w-0"
                >
                  <div className="truncate text-sm text-adv-off-white group-hover:text-adv-teal transition-colors">
                    {s.query}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-[10px] text-adv-gray">
                    <span className="capitalize">{s.depth}</span>
                    <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5" />{(s.duration_ms / 1000).toFixed(1)}s</span>
                    {s.cost_usd > 0 && <span>${s.cost_usd.toFixed(4)}</span>}
                    <span>{new Date(s.created_at).toLocaleString()}</span>
                  </div>
                </Link>
                <button
                  onClick={() => handleDelete(s.id)}
                  className="opacity-0 group-hover:opacity-100 text-adv-gray hover:text-adv-red transition-all"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:text-adv-off-white disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-xs text-adv-gray">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
          </span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={(page + 1) * PAGE_SIZE >= total}
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:text-adv-off-white disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
