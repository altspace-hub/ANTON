/**
 * MarketsScreen — ANTON 100 index, market benchmarks, leaderboard.
 */

import { useState, useEffect } from 'react';
import { getAuthHeader } from '../services/api';

interface Props { orgId: string; }

interface Benchmark { symbol: string; name: string; price: number; change_1d: number; change_1w: number; change_1m: number; }
interface Index { id: string; name: string; nav: number; total_return: number; status: string; }

export default function MarketsScreen({ orgId }: Props) {
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [indexes, setIndexes] = useState<Index[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/markets/dashboard', { headers: getAuthHeader() })
        .then(r => r.ok ? r.json() : {})
        .then(d => { if (d.benchmarks) setBenchmarks(d.benchmarks); }),
      fetch('/api/markets/indexes?status=active', { headers: getAuthHeader() })
        .then(r => r.ok ? r.json() : [])
        .then(d => setIndexes(Array.isArray(d) ? d : [])),
    ]).catch(() => {}).finally(() => setLoading(false));
  }, [orgId]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-2xl px-4 py-5 space-y-5">
        <h1 className="text-lg font-bold text-adv-off-white">Markets</h1>

        {loading ? (
          <div className="flex justify-center py-12">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-adv-teal border-t-transparent" />
          </div>
        ) : (
          <>
            {/* Benchmarks */}
            {benchmarks.length > 0 && (
              <div>
                <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-adv-gray">Benchmarks</h2>
                <div className="space-y-2">
                  {benchmarks.map(b => (
                    <div key={b.symbol} className="flex items-center justify-between rounded-xl border border-border bg-adv-card px-4 py-3">
                      <div>
                        <span className="text-sm font-medium text-adv-off-white">{b.symbol}</span>
                        <span className="ml-2 text-xs text-adv-gray">{b.name}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-adv-off-white">${Number(b.price).toFixed(2)}</div>
                        <div className={`text-xs ${Number(b.change_1d) >= 0 ? 'text-adv-green' : 'text-adv-red'}`}>
                          {Number(b.change_1d) >= 0 ? '+' : ''}{Number(b.change_1d).toFixed(2)}%
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ANTON Indexes */}
            <div>
              <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-adv-gray">ANTON Indexes</h2>
              {indexes.length === 0 ? (
                <div className="text-center py-8">
                  <span className="text-3xl mb-2 block">📊</span>
                  <p className="text-sm text-adv-gray">No indexes configured</p>
                  <p className="text-xs text-adv-gray/60">Create indexes in ANTON main to see them here</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {indexes.map(idx => (
                    <div key={idx.id} className="rounded-xl border border-border bg-adv-card px-4 py-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-adv-off-white">{idx.name}</span>
                        <span className={`text-sm font-bold ${Number(idx.total_return) >= 0 ? 'text-adv-green' : 'text-adv-red'}`}>
                          {Number(idx.total_return) >= 0 ? '+' : ''}{Number(idx.total_return).toFixed(1)}%
                        </span>
                      </div>
                      {idx.nav && (
                        <div className="mt-1 text-xs text-adv-gray">NAV: ${Number(idx.nav).toFixed(2)}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
