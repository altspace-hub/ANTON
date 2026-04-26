/**
 * ProcureBenchmarksPage — pricing + delivery benchmarks browser.
 * Phase B.2 build-out.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, BarChart3 } from 'lucide-react';
import { getAuthHeader } from '../../lib/api';

interface Benchmark {
  id: string;
  category: string;
  metric: string;
  region: string | null;
  metric_value_p25: number | null;
  metric_value_p50: number | null;
  metric_value_p75: number | null;
  unit: string | null;
  sample_size: number | null;
  source: string | null;
  last_updated_at: string;
}

export default function ProcureBenchmarksPage() {
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/procure/benchmarks', { headers: getAuthHeader() })
      .then(r => r.json())
      .then((data: { benchmarks?: Benchmark[] }) => setBenchmarks(data.benchmarks ?? []))
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load benchmarks'))
      .finally(() => setLoading(false));
  }, []);

  const categories = useMemo(() => Array.from(new Set(benchmarks.map(b => b.category))).sort(), [benchmarks]);
  const filtered = benchmarks.filter(b => !filterCategory || b.category === filterCategory);

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/procure" className="text-adv-gray hover:text-adv-teal" aria-label="Back"><ChevronLeft size={20} /></Link>
          <BarChart3 className="text-adv-teal" size={24} />
          <div>
            <h1 className="text-2xl font-semibold">Benchmarks</h1>
            <p className="text-adv-gray text-sm">Pricing and delivery benchmarks per category. Use to validate vendor quotes against the market.</p>
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
            className="bg-adv-card border border-adv-card px-3 py-2 rounded text-sm">
            <option value="">All categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {error && <div className="bg-adv-red/10 text-adv-red p-3 rounded mb-3">{error}</div>}

        {loading ? (
          <div className="text-center text-adv-gray py-12">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="bg-adv-card rounded-lg p-8 text-center text-adv-gray">
            No benchmarks match. Seed includes 3 (cloud-infra spend, payments fee, AI-LLM cost).
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-adv-card text-adv-gray">
                <tr>
                  <th className="text-left p-2">Category</th>
                  <th className="text-left p-2">Metric</th>
                  <th className="text-left p-2">Region</th>
                  <th className="text-right p-2">P25</th>
                  <th className="text-right p-2">P50</th>
                  <th className="text-right p-2">P75</th>
                  <th className="text-left p-2">Unit</th>
                  <th className="text-right p-2">N</th>
                  <th className="text-left p-2">Source</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(b => (
                  <tr key={b.id} className="border-b border-adv-card hover:bg-adv-card/40">
                    <td className="p-2"><code className="text-adv-teal text-xs">{b.category}</code></td>
                    <td className="p-2">{b.metric}</td>
                    <td className="p-2 text-adv-gray">{b.region ?? '—'}</td>
                    <td className="p-2 text-right">{b.metric_value_p25 ?? '—'}</td>
                    <td className="p-2 text-right font-medium">{b.metric_value_p50 ?? '—'}</td>
                    <td className="p-2 text-right">{b.metric_value_p75 ?? '—'}</td>
                    <td className="p-2 text-xs text-adv-gray">{b.unit ?? '—'}</td>
                    <td className="p-2 text-right text-xs text-adv-gray">{b.sample_size ?? '—'}</td>
                    <td className="p-2 text-xs text-adv-gray">{b.source ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
