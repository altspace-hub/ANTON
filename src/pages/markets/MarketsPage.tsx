import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, Database, Activity, Zap, Eye, BarChart2,
  RefreshCw, Plus, ChevronRight, AlertTriangle,
  Lightbulb, Target, Network, Calculator,
  Package, Loader2, Check,
  GitBranch, Calendar, Clock,
} from 'lucide-react';
import { fetchWithAuth, exportMarketAtomCollectionAnton, exportMarketStrategyPackAnton } from '../../lib/api';
import MarketDisclaimer from '../../components/shared/MarketDisclaimer';
import { StatCard, AtomTypeTag, SentimentBadge, ConfidenceMeter } from '../../components/shared/markets';

interface DashboardData {
  stats: {
    totalSources: number;
    activeSources: number;
    totalAtoms: number;
    activeAtoms: number;
    watchlistCount: number;
    recentComputations: number;
  };
  recentAtoms: Array<{
    id: string;
    content: string;
    atom_type: string;
    confidence: number;
    category: string;
    sentiment: string | null;
    created_at: string;
  }>;
  atomsByCategory: Array<{ category: string; count: number }>;
  rawDataStats: {
    total: number;
    unprocessed: number;
    byType: Array<{ data_type: string; count: number }>;
  };
  marketBenchmarks?: Array<{ symbol: string; price: number; date: string; changes: Record<string, number> }>;
  portfolios?: Array<{ id: string; name: string; current_nav: number; total_return: number; status: string; philosophy: string }>;
}

export default function MarketsPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [atomExportState, setAtomExportState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [strategyExportState, setStrategyExportState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [overviewPeriod, setOverviewPeriod] = useState<string>('1d');

  const handleExportAtomCollection = async () => {
    if (atomExportState !== 'idle') return;
    setAtomExportState('loading');
    try {
      const blob = await exportMarketAtomCollectionAnton();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'market-atom-collection.anton';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setAtomExportState('done');
      setTimeout(() => setAtomExportState('idle'), 2500);
    } catch (err) {
      console.error('[Export] Error:', err);
      setAtomExportState('idle');
    }
  };

  const handleExportStrategyPack = async () => {
    if (strategyExportState !== 'idle') return;
    setStrategyExportState('loading');
    try {
      const blob = await exportMarketStrategyPackAnton();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'market-strategy-pack.anton';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStrategyExportState('done');
      setTimeout(() => setStrategyExportState('idle'), 2500);
    } catch (err) {
      console.error('[Export] Error:', err);
      setStrategyExportState('idle');
    }
  };

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/api/markets/dashboard');
      if (!res.ok) throw new Error('Failed to load dashboard');
      const json = await res.json() as DashboardData;
      setData({
        ...json,
        stats: {
          totalSources: Number(json.stats.totalSources) || 0,
          activeSources: Number(json.stats.activeSources) || 0,
          totalAtoms: Number(json.stats.totalAtoms) || 0,
          activeAtoms: Number(json.stats.activeAtoms) || 0,
          watchlistCount: Number(json.stats.watchlistCount) || 0,
          recentComputations: Number(json.stats.recentComputations) || 0,
        },
        recentAtoms: (json.recentAtoms || []).map(a => ({
          ...a,
          confidence: Number(a.confidence) || 0,
        })),
        atomsByCategory: (json.atomsByCategory || []).map(c => ({
          ...c,
          count: Number(c.count) || 0,
        })),
        rawDataStats: json.rawDataStats ? {
          total: Number(json.rawDataStats.total) || 0,
          unprocessed: Number(json.rawDataStats.unprocessed) || 0,
          byType: (json.rawDataStats.byType || []).map(t => ({
            ...t,
            count: Number(t.count) || 0,
          })),
        } : json.rawDataStats,
      });
    } catch (err) {
      console.error('[MarketsPage] Error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const stats = data?.stats;

  return (
    <div className="min-h-screen p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-adv-off-white flex items-center gap-3">
            <TrendingUp className="h-7 w-7 text-adv-teal" />
            Markets Intelligence
          </h1>
          <p className="mt-1 text-sm text-adv-gray">
            Self-learning financial intelligence system — INGEST, ANALYSE, HYPOTHESISE, PREDICT, VALIDATE, LEARN
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportAtomCollection}
            disabled={atomExportState === 'loading'}
            className="flex items-center gap-1.5 rounded-md border border-adv-teal/30 bg-adv-dark px-3 py-1.5 text-xs text-adv-teal hover:border-adv-teal hover:bg-adv-card transition-colors disabled:opacity-50"
            title="Export atom collection as .anton bundle"
          >
            {atomExportState === 'loading' ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Exporting...</>
            ) : atomExportState === 'done' ? (
              <><Check className="h-3.5 w-3.5" /> Downloaded</>
            ) : (
              <><Package className="h-3.5 w-3.5" /> Atoms .anton</>
            )}
          </button>
          <button
            onClick={handleExportStrategyPack}
            disabled={strategyExportState === 'loading'}
            className="flex items-center gap-1.5 rounded-md border border-adv-teal/30 bg-adv-dark px-3 py-1.5 text-xs text-adv-teal hover:border-adv-teal hover:bg-adv-card transition-colors disabled:opacity-50"
            title="Export strategy pack as .anton bundle"
          >
            {strategyExportState === 'loading' ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Exporting...</>
            ) : strategyExportState === 'done' ? (
              <><Check className="h-3.5 w-3.5" /> Downloaded</>
            ) : (
              <><Package className="h-3.5 w-3.5" /> Strategy .anton</>
            )}
          </button>
          <button
            onClick={fetchDashboard}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-adv-card bg-adv-card px-3 py-2 text-sm text-adv-gray hover:text-adv-teal hover:border-adv-teal transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => navigate('/markets/sources')}
            className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
          >
            <Database className="h-4 w-4" />
            Data Sources
          </button>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-2 flex-wrap">
        {[
          { to: '/markets/sources', icon: Database, label: 'Data Sources', color: 'text-adv-blue' },
          { to: '/markets/theses', icon: Lightbulb, label: 'Theses', color: 'text-adv-gold' },
          { to: '/markets/predictions', icon: Target, label: 'Predictions', color: 'text-adv-teal' },
          { to: '/markets/entities', icon: Network, label: 'Entity Graph', color: 'text-purple-400' },
          { to: '/markets/indexes', icon: BarChart2, label: 'Indexes', color: 'text-adv-blue' },
          { to: '/markets/workflows', icon: Zap, label: 'Workflows', color: 'text-adv-teal' },
          { to: '/markets/computation', icon: Calculator, label: 'Computation', color: 'text-purple-400' },
          { to: '/markets/learning', icon: Activity, label: 'Learning', color: 'text-adv-green' },
          { to: '/markets/investigations', icon: Eye, label: 'Investigations', color: 'text-orange-400' },
          { to: '/markets/atoms', icon: Zap, label: 'Atoms', color: 'text-adv-teal' },
          { to: '/markets/why-chains', icon: GitBranch, label: 'Why Chains', color: 'text-orange-400' },
          { to: '/markets/patterns', icon: Activity, label: 'Patterns', color: 'text-adv-gold' },
          { to: '/markets/watchlist', icon: Eye, label: 'Watchlist', color: 'text-adv-gold' },
          { to: '/markets/events', icon: Calendar, label: 'Events', color: 'text-adv-blue' },
          { to: '/markets/rci', icon: Calculator, label: 'RCI', color: 'text-purple-400' },
          { to: '/markets/goals', icon: Target, label: 'Goals & Values', color: 'text-adv-teal' },
          { to: '/markets/backtests', icon: Clock, label: 'Backtesting', color: 'text-adv-green' },
        ].map((nav) => (
          <button key={nav.to} onClick={() => navigate(nav.to)}
            className="flex items-center gap-2 rounded-lg border border-adv-card bg-adv-card px-4 py-2 text-sm text-adv-off-white hover:border-adv-teal transition-colors">
            <nav.icon className={`h-4 w-4 ${nav.color}`} />
            {nav.label}
          </button>
        ))}
      </div>

      {/* Market Overview — Benchmarks vs ANTON Portfolios */}
      {data?.marketBenchmarks && data.marketBenchmarks.length > 0 && (
        <div className="rounded-xl border border-adv-card bg-adv-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-adv-off-white">Market Overview</h2>
            <div className="flex items-center gap-1">
              {[
                { key: '1d', label: '1D' },
                { key: '1w', label: '1W' },
                { key: '1m', label: '1M' },
                { key: '1y', label: '1Y' },
                { key: '5y', label: '5Y' },
              ].map(p => (
                <button key={p.key} onClick={() => setOverviewPeriod(p.key)}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${overviewPeriod === p.key ? 'bg-adv-teal text-adv-dark' : 'bg-adv-dark text-adv-gray hover:text-adv-off-white'}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Market Benchmarks */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-adv-gray mb-3">Market Benchmarks</h3>
              <div className="space-y-2">
                {data.marketBenchmarks.map(b => {
                  const change = b.changes?.[overviewPeriod] ?? 0;
                  return (
                    <div key={b.symbol} className="flex items-center justify-between rounded-lg bg-adv-dark-2 px-4 py-3">
                      <div>
                        <span className="text-sm font-medium text-adv-off-white">
                          {b.symbol === 'SPY' ? 'S&P 500' : b.symbol === 'QQQ' ? 'NASDAQ 100' : b.symbol === 'DIA' ? 'Dow Jones' : b.symbol}
                        </span>
                        <span className="ml-2 text-xs text-adv-gray">{b.symbol}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium text-adv-off-white">${b.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        <div className={`text-xs font-medium ${change >= 0 ? 'text-adv-green' : 'text-adv-red'}`}>
                          {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            {/* ANTON Portfolios */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-adv-gray mb-3">ANTON Portfolios</h3>
              <div className="space-y-2">
                {(data.portfolios ?? []).filter(p => p.name !== 'ANTON Sweden 100').map(p => {
                  const ret = Number(p.total_return) * 100;
                  return (
                    <div key={p.id} onClick={() => navigate(`/markets/indexes/${p.id}`)}
                      className="flex items-center justify-between rounded-lg bg-adv-dark-2 px-4 py-3 cursor-pointer hover:border-adv-teal/30 hover:bg-adv-dark transition-colors">
                      <div>
                        <span className="text-sm font-medium text-adv-off-white">{p.name}</span>
                        <span className="ml-2 text-xs text-adv-gray capitalize">{p.philosophy}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium text-adv-off-white">
                          ${(Number(p.current_nav) / 1000000).toFixed(1)}M
                        </div>
                        <div className={`text-xs font-medium ${ret >= 0 ? 'text-adv-green' : 'text-adv-red'}`}>
                          {ret >= 0 ? '+' : ''}{ret.toFixed(2)}%
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <MarketDisclaimer compact />

      {/* Stats Grid */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard
            label="Data Sources"
            value={stats.activeSources}
            sublabel={`${stats.totalSources} total`}
            icon={<Database className="h-5 w-5" />}
            color="text-adv-blue"
          />
          <StatCard
            label="Market Atoms"
            value={stats.activeAtoms}
            sublabel={`${stats.totalAtoms} total`}
            icon={<Zap className="h-5 w-5" />}
            color="text-adv-teal"
          />
          <StatCard
            label="Watchlist"
            value={stats.watchlistCount}
            sublabel="symbols tracked"
            icon={<Eye className="h-5 w-5" />}
            color="text-adv-gold"
          />
          <StatCard
            label="Computations"
            value={stats.recentComputations}
            sublabel="last 7 days"
            icon={<BarChart2 className="h-5 w-5" />}
            color="text-purple-400"
          />
          <StatCard
            label="Raw Data"
            value={data?.rawDataStats?.total ?? 0}
            sublabel={`${data?.rawDataStats?.unprocessed ?? 0} pending`}
            icon={<Activity className="h-5 w-5" />}
            color="text-orange-400"
          />
          <StatCard
            label="Categories"
            value={data?.atomsByCategory?.length ?? 0}
            sublabel="active"
            icon={<TrendingUp className="h-5 w-5" />}
            color="text-adv-green"
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Atoms */}
        <div className="rounded-xl border border-adv-card bg-adv-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-adv-off-white">Recent Market Atoms</h2>
            <button
              onClick={() => navigate('/markets/sources')}
              className="text-xs text-adv-teal hover:text-adv-teal-dark transition-colors flex items-center gap-1"
            >
              View all <ChevronRight className="h-3 w-3" />
            </button>
          </div>

          {loading && !data ? (
            <p className="text-sm text-adv-gray">Loading...</p>
          ) : data?.recentAtoms.length === 0 ? (
            <div className="text-center py-8">
              <Zap className="h-8 w-8 text-adv-gray mx-auto mb-2" />
              <p className="text-sm text-adv-gray">No market atoms yet</p>
              <p className="text-xs text-adv-gray mt-1">Add data sources and fetch market data to start building intelligence</p>
            </div>
          ) : (
            <div className="space-y-3">
              {data?.recentAtoms.map((atom) => (
                <div key={atom.id} className="rounded-lg border border-adv-dark bg-adv-dark-2 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <AtomTypeTag type={atom.atom_type} />
                    <span className="text-xs text-adv-gray">{atom.category}</span>
                    {atom.sentiment && <SentimentBadge sentiment={atom.sentiment} />}
                    <span className="ml-auto w-20">
                      <ConfidenceMeter value={atom.confidence} size="sm" />
                    </span>
                  </div>
                  <p className="text-sm text-adv-off-white line-clamp-2">{atom.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Atoms by Category */}
        <div className="rounded-xl border border-adv-card bg-adv-card p-5">
          <h2 className="text-lg font-semibold text-adv-off-white mb-4">Atoms by Category</h2>

          {data?.atomsByCategory.length === 0 ? (
            <div className="text-center py-8">
              <BarChart2 className="h-8 w-8 text-adv-gray mx-auto mb-2" />
              <p className="text-sm text-adv-gray">No categories yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {data?.atomsByCategory.map((cat) => {
                const maxCount = Math.max(...(data?.atomsByCategory.map(c => c.count) ?? [1]));
                const pct = (cat.count / maxCount) * 100;
                return (
                  <div key={cat.category}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-adv-off-white capitalize">{cat.category}</span>
                      <span className="text-adv-gray">{cat.count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-adv-dark overflow-hidden">
                      <div
                        className="h-full rounded-full bg-adv-teal transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Quick Actions */}
          <div className="mt-6 pt-4 border-t border-adv-dark">
            <h3 className="text-sm font-medium text-adv-gray mb-3">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => navigate('/markets/sources')}
                className="flex items-center gap-2 rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-xs text-adv-off-white hover:border-adv-teal transition-colors"
              >
                <Plus className="h-3.5 w-3.5 text-adv-teal" />
                Add Data Source
              </button>
              <button
                onClick={async () => {
                  try {
                    await fetchWithAuth('/api/markets/sources/fetch-all', { method: 'POST' });
                    fetchDashboard();
                  } catch (err) {
                    console.error('[MarketsPage] Fetch all error:', err);
                  }
                }}
                className="flex items-center gap-2 rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-xs text-adv-off-white hover:border-adv-teal transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5 text-adv-teal" />
                Fetch All Sources
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Raw Data Stats */}
      {data?.rawDataStats && data.rawDataStats.byType.length > 0 && (
        <div className="rounded-xl border border-adv-card bg-adv-card p-5">
          <h2 className="text-lg font-semibold text-adv-off-white mb-4">Raw Data Pipeline</h2>
          <div className="flex items-center gap-6 flex-wrap">
            {data.rawDataStats.byType.map((dt) => (
              <div key={dt.data_type} className="flex items-center gap-2">
                <span className="text-sm text-adv-off-white capitalize">{dt.data_type}</span>
                <span className="rounded-full bg-adv-teal/10 px-2 py-0.5 text-xs font-medium text-adv-teal">
                  {dt.count}
                </span>
              </div>
            ))}
            {data.rawDataStats.unprocessed > 0 && (
              <div className="flex items-center gap-2 text-adv-gold">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm">{data.rawDataStats.unprocessed} pending extraction</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

