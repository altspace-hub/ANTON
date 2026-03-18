import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, BarChart2, Play, Plus, Trash2,
  TrendingUp, TrendingDown, RefreshCw,
  Package, Loader2, Check, Search,
  ChevronUp, ChevronDown, Layers, Clock,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { fetchWithAuth, exportMarketIndexAnton } from '../../lib/api';
import MarketDisclaimer from '../../components/shared/MarketDisclaimer';

interface IndexDetail {
  id: string;
  name: string;
  description: string;
  index_type: string;
  philosophy: string | null;
  status: string;
  current_nav: number;
  total_return: number;
  max_holdings: number;
  weighting_method: string;
  rebalance_frequency: string;
  inception_date: string | null;
  budget: number | null;
  currency: string | null;
  universe: string;
  benchmark_symbol: string | null;
  holdings: Array<{ symbol: string; name: string | null; weight: number; shares: number; entry_price: number | null; current_price: number | null; unrealized_pnl: number }>;
  recentNav: Array<{ nav_date: string; nav_value: number; daily_return: number | null }>;
}

interface AttributionEntry {
  symbol?: string;
  sector?: string;
  contribution: number;
  weight: number;
}

interface RebalanceEntry {
  id: string;
  rebalance_date: string;
  rebalance_type: string;
  status: string;
  created_at: string;
}

type DetailTab = 'holdings' | 'attribution' | 'rebalances';
type SortField = 'symbol' | 'weight' | 'shares' | 'entry_price' | 'current_price' | 'unrealized_pnl';
type SortDir = 'asc' | 'desc';

const PIE_COLORS = ['#2DD4A8', '#3498DB', '#F5A623', '#E74C3C', '#27AE60', '#9B59B6', '#1ABC9C', '#E67E22', '#2980B9', '#8E44AD', '#607D8B'];

export default function MarketIndexDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [index, setIndex] = useState<IndexDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [newSymbol, setNewSymbol] = useState('');
  const [newWeight, setNewWeight] = useState(0.05);
  const [exportState, setExportState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [initializing, setInitializing] = useState(false);
  const [rebalancing, setRebalancing] = useState(false);
  const [sortField, setSortField] = useState<SortField>('weight');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [holdingSearch, setHoldingSearch] = useState('');
  const [detailTab, setDetailTab] = useState<DetailTab>('holdings');
  const [positionAttribution, setPositionAttribution] = useState<AttributionEntry[]>([]);
  const [sectorAttribution, setSectorAttribution] = useState<AttributionEntry[]>([]);
  const [rebalances, setRebalances] = useState<RebalanceEntry[]>([]);
  const [tabLoading, setTabLoading] = useState(false);

  const handleExport = async () => {
    if (exportState !== 'idle' || !id) return;
    setExportState('loading');
    try {
      const blob = await exportMarketIndexAnton(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `market-index-${id}.anton`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportState('done');
      setTimeout(() => setExportState('idle'), 2500);
    } catch (err) {
      console.error('[Export] Error:', err);
      setExportState('idle');
    }
  };

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetchWithAuth(`/api/markets/indexes/${id}`);
      if (res.ok) {
        const raw = await res.json() as IndexDetail;
        setIndex({
          ...raw,
          current_nav: Number(raw.current_nav) || 0,
          total_return: Number(raw.total_return) || 0,
          max_holdings: Number(raw.max_holdings) || 0,
          budget: raw.budget != null ? Number(raw.budget) : null,
          holdings: (raw.holdings || []).map(h => ({
            ...h,
            weight: Number(h.weight) || 0,
            shares: Number(h.shares) || 0,
            entry_price: h.entry_price != null ? Number(h.entry_price) : null,
            current_price: h.current_price != null ? Number(h.current_price) : null,
            unrealized_pnl: Number(h.unrealized_pnl) || 0,
          })),
          recentNav: (raw.recentNav || []).map(n => ({
            ...n,
            nav_value: Number(n.nav_value) || 0,
            daily_return: n.daily_return != null ? Number(n.daily_return) : null,
          })),
        });
      }
    } catch (err) {
      console.error('[IndexDetail] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleActivate = async () => {
    try {
      await fetchWithAuth(`/api/markets/indexes/${id}/activate`, { method: 'POST' });
      fetchData();
    } catch (err) {
      console.error('[IndexDetail] Activate error:', err);
    }
  };

  const handleInitializeFromUniverse = async () => {
    if (!index) return;
    let universe: string[] = [];
    try { universe = JSON.parse(index.universe || '[]'); } catch { /* empty */ }
    if (universe.length === 0 || typeof universe[0] !== 'string') {
      alert('No real ticker universe defined for this index.');
      return;
    }
    if (!confirm(`Initialize ${index.name} with ${universe.length} tickers from universe? This will create equal-weight holdings and activate the index.`)) return;
    setInitializing(true);
    try {
      const equalWeight = 1 / universe.length;
      const holdings = universe.map(symbol => ({ symbol, weight: equalWeight }));
      const res = await fetchWithAuth(`/api/markets/indexes/${id}/initialize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holdings }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        alert((err as { error?: string }).error || 'Initialization failed');
      }
      fetchData();
    } catch (err) {
      console.error('[IndexDetail] Initialize error:', err);
    } finally {
      setInitializing(false);
    }
  };

  const handleTriggerRebalance = async () => {
    if (!id) return;
    setRebalancing(true);
    try {
      const res = await fetchWithAuth(`/api/markets/workflows/rebalance/${id}`, { method: 'POST' });
      if (res.ok) {
        const result = await res.json();
        alert(`Rebalance workflow completed: ${(result as { stepsCompleted: number }).stepsCompleted} steps. Check the proposal in the workflow runs.`);
      }
    } catch (err) {
      console.error('[IndexDetail] Rebalance error:', err);
    } finally {
      setRebalancing(false);
    }
  };

  const handleAddHolding = async () => {
    if (!newSymbol.trim()) return;
    try {
      await fetchWithAuth(`/api/markets/indexes/${id}/holdings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: newSymbol.toUpperCase(), weight: newWeight }),
      });
      setNewSymbol('');
      fetchData();
    } catch (err) {
      console.error('[IndexDetail] Add holding error:', err);
    }
  };

  const handleRemoveHolding = async (symbol: string) => {
    try {
      await fetchWithAuth(`/api/markets/indexes/${id}/holdings/${symbol}`, { method: 'DELETE' });
      fetchData();
    } catch (err) {
      console.error('[IndexDetail] Remove error:', err);
    }
  };

  const fetchTabData = useCallback(async (tab: DetailTab) => {
    if (!id || tab === 'holdings') return;
    setTabLoading(true);
    try {
      if (tab === 'attribution') {
        const [posRes, secRes] = await Promise.all([
          fetchWithAuth(`/api/markets/indexes/${id}/attribution/position`),
          fetchWithAuth(`/api/markets/indexes/${id}/attribution/sector`),
        ]);
        if (posRes.ok) {
          const posRaw = await posRes.json() as AttributionEntry[];
          setPositionAttribution(posRaw.map(p => ({ ...p, weight: Number(p.weight) || 0, contribution: Number(p.contribution) || 0 })));
        }
        if (secRes.ok) {
          const secRaw = await secRes.json() as AttributionEntry[];
          setSectorAttribution(secRaw.map(s => ({ ...s, weight: Number(s.weight) || 0, contribution: Number(s.contribution) || 0 })));
        }
      } else if (tab === 'rebalances') {
        const res = await fetchWithAuth(`/api/markets/indexes/${id}/rebalances`);
        if (res.ok) setRebalances(await res.json() as RebalanceEntry[]);
      }
    } catch (err) {
      console.error('[IndexDetail] Tab data error:', err);
    } finally {
      setTabLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchTabData(detailTab); }, [detailTab, fetchTabData]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const sortedHoldings = useMemo(() => {
    if (!index) return [];
    const filtered = holdingSearch
      ? index.holdings.filter(h => h.symbol.toLowerCase().includes(holdingSearch.toLowerCase()))
      : index.holdings;
    return [...filtered].sort((a, b) => {
      const aVal = a[sortField] ?? 0;
      const bVal = b[sortField] ?? 0;
      if (typeof aVal === 'string') return sortDir === 'asc' ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal);
      return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  }, [index, sortField, sortDir, holdingSearch]);

  // Pie chart data: top 10 + "Others"
  const pieData = useMemo(() => {
    if (!index || index.holdings.length === 0) return [];
    const sorted = [...index.holdings].sort((a, b) => b.weight - a.weight);
    const top = sorted.slice(0, 10).map(h => ({ name: h.symbol, value: h.weight }));
    const othersWeight = sorted.slice(10).reduce((s, h) => s + h.weight, 0);
    if (othersWeight > 0) top.push({ name: 'Others', value: othersWeight });
    return top;
  }, [index]);

  // NAV chart data (chronological)
  const navChartData = useMemo(() => {
    if (!index) return [];
    return [...index.recentNav].reverse().map(n => ({
      date: n.nav_date,
      nav: n.nav_value,
    }));
  }, [index]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDir === 'asc' ? <ChevronUp className="h-3 w-3 inline" /> : <ChevronDown className="h-3 w-3 inline" />;
  };

  if (loading) return <div className="p-6 text-adv-gray">Loading...</div>;
  if (!index) return <div className="p-6 text-adv-red">Index not found</div>;

  return (
    <div className="min-h-screen p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/markets/indexes')} className="rounded-lg border border-adv-card bg-adv-card p-2 text-adv-gray hover:text-adv-teal transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-adv-off-white">{index.name}</h1>
            <p className="text-sm text-adv-gray">{index.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={exportState === 'loading'}
            className="flex items-center gap-1.5 rounded-md border border-adv-teal/30 bg-adv-dark px-3 py-1.5 text-xs text-adv-teal hover:border-adv-teal hover:bg-adv-card transition-colors disabled:opacity-50"
            title="Export as .anton bundle"
          >
            {exportState === 'loading' ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Exporting...</>
            ) : exportState === 'done' ? (
              <><Check className="h-3.5 w-3.5" /> Downloaded</>
            ) : (
              <><Package className="h-3.5 w-3.5" /> Export .anton</>
            )}
          </button>
          {index.status === 'draft' && (
            <>
              <button onClick={handleInitializeFromUniverse} disabled={initializing}
                className="flex items-center gap-2 rounded-lg bg-adv-blue px-4 py-2 text-sm font-medium text-white hover:bg-adv-blue/80 transition-colors disabled:opacity-50">
                {initializing ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart2 className="h-4 w-4" />}
                Initialize from Universe
              </button>
              <button onClick={handleActivate} className="flex items-center gap-2 rounded-lg bg-adv-green px-4 py-2 text-sm font-medium text-white hover:bg-adv-green/80 transition-colors">
                <Play className="h-4 w-4" /> Activate
              </button>
            </>
          )}
          {index.status === 'active' && (
            <button onClick={handleTriggerRebalance} disabled={rebalancing}
              className="flex items-center gap-2 rounded-lg border border-adv-teal bg-adv-dark px-4 py-2 text-sm font-medium text-adv-teal hover:bg-adv-card transition-colors disabled:opacity-50">
              {rebalancing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Rebalance
            </button>
          )}
        </div>
      </div>

      <MarketDisclaimer compact />

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <div className="rounded-xl border border-adv-card bg-adv-card p-4">
          <div className="text-2xl font-bold text-adv-off-white">{index.current_nav.toFixed(2)}</div>
          <div className="text-xs text-adv-gray">Current NAV</div>
        </div>
        <div className="rounded-xl border border-adv-card bg-adv-card p-4">
          <div className={`text-2xl font-bold flex items-center gap-1 ${index.total_return >= 0 ? 'text-adv-green' : 'text-adv-red'}`}>
            {index.total_return >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            {(index.total_return * 100).toFixed(2)}%
          </div>
          <div className="text-xs text-adv-gray">Total Return</div>
        </div>
        <div className="rounded-xl border border-adv-card bg-adv-card p-4">
          <div className="text-2xl font-bold text-adv-off-white">{index.holdings.length}</div>
          <div className="text-xs text-adv-gray">Holdings</div>
        </div>
        <div className="rounded-xl border border-adv-card bg-adv-card p-4">
          <div className="text-2xl font-bold text-adv-off-white capitalize">{index.status}</div>
          <div className="text-xs text-adv-gray">Status</div>
        </div>
        {index.budget && index.budget > 0 && (
          <div className="rounded-xl border border-adv-card bg-adv-card p-4">
            <div className="text-2xl font-bold text-adv-teal">{(index.budget / 1000000).toFixed(0)}M</div>
            <div className="text-xs text-adv-gray">Budget ({index.currency || 'USD'})</div>
          </div>
        )}
        <div className="rounded-xl border border-adv-card bg-adv-card p-4">
          <div className="text-2xl font-bold text-adv-off-white">
            {(() => { try { return JSON.parse(index.universe || '[]').length; } catch { return 0; } })()}
          </div>
          <div className="text-xs text-adv-gray">Universe Tickers</div>
        </div>
      </div>

      {/* NAV Line Chart */}
      {navChartData.length > 1 && (
        <div className="rounded-xl border border-adv-card bg-adv-card p-5">
          <h2 className="text-lg font-semibold text-adv-off-white mb-4">NAV History</h2>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={navChartData}>
              <XAxis dataKey="date" stroke="#B0B0B0" tick={{ fontSize: 11 }} tickLine={false} />
              <YAxis stroke="#B0B0B0" tick={{ fontSize: 11 }} tickLine={false} domain={['auto', 'auto']} />
              <Tooltip
                contentStyle={{ backgroundColor: '#152238', border: '1px solid #2DD4A8', borderRadius: 8 }}
                labelStyle={{ color: '#E0E0E0' }}
                itemStyle={{ color: '#2DD4A8' }}
                formatter={(value: number) => [value.toFixed(2), 'NAV']}
              />
              <Line type="monotone" dataKey="nav" stroke="#2DD4A8" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Allocation Pie Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {pieData.length > 0 && (
          <div className="rounded-xl border border-adv-card bg-adv-card p-5">
            <h2 className="text-lg font-semibold text-adv-off-white mb-4">Allocation</h2>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} innerRadius={50} paddingAngle={1}>
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#152238', border: '1px solid #2DD4A8', borderRadius: 8 }}
                  formatter={(value: number) => [(value * 100).toFixed(1) + '%', 'Weight']}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-2 mt-2">
              {pieData.map((d, i) => (
                <span key={d.name} className="flex items-center gap-1 text-xs text-adv-gray">
                  <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                  {d.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Tabbed Detail Section */}
        <div className={`rounded-xl border border-adv-card bg-adv-card p-5 ${pieData.length > 0 ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
          {/* Tab Bar */}
          <div className="flex items-center gap-2 mb-4">
            {([
              { key: 'holdings' as const, label: 'Holdings', icon: BarChart2 },
              { key: 'attribution' as const, label: 'Attribution', icon: Layers },
              { key: 'rebalances' as const, label: 'Rebalance History', icon: Clock },
            ]).map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => setDetailTab(key)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors ${detailTab === key ? 'bg-adv-teal text-adv-dark' : 'bg-adv-card text-adv-gray hover:text-adv-off-white'}`}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>

          {/* Holdings Tab */}
          {detailTab === 'holdings' && (
            <>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-adv-off-white">Holdings</h2>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-adv-gray" />
                    <input type="text" value={holdingSearch} onChange={(e) => setHoldingSearch(e.target.value)} placeholder="Filter..."
                      className="pl-7 pr-2 py-1 rounded-lg border border-adv-dark bg-adv-dark-2 text-xs text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal w-32" />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 mb-4">
                <input type="text" value={newSymbol} onChange={(e) => setNewSymbol(e.target.value)} placeholder="Symbol"
                  className="flex-1 rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-1.5 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal" />
                <input type="number" value={newWeight} onChange={(e) => setNewWeight(parseFloat(e.target.value))} min={0.01} max={1} step={0.01}
                  className="w-20 rounded-lg border border-adv-dark bg-adv-dark-2 px-2 py-1.5 text-sm text-adv-off-white focus:outline-none focus:border-adv-teal" />
                <button onClick={handleAddHolding} className="rounded-lg bg-adv-teal px-3 py-1.5 text-sm text-adv-dark hover:bg-adv-teal-dark">
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              {index.holdings.length === 0 ? (
                <p className="text-sm text-adv-gray text-center py-4">No holdings yet. Add symbols above.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-adv-gray border-b border-adv-dark">
                        <th className="pb-2 pr-3 cursor-pointer hover:text-adv-teal" onClick={() => toggleSort('symbol')}>Symbol <SortIcon field="symbol" /></th>
                        <th className="pb-2 pr-3 cursor-pointer hover:text-adv-teal text-right" onClick={() => toggleSort('weight')}>Weight% <SortIcon field="weight" /></th>
                        <th className="pb-2 pr-3 cursor-pointer hover:text-adv-teal text-right" onClick={() => toggleSort('shares')}>Shares <SortIcon field="shares" /></th>
                        <th className="pb-2 pr-3 cursor-pointer hover:text-adv-teal text-right" onClick={() => toggleSort('entry_price')}>Entry <SortIcon field="entry_price" /></th>
                        <th className="pb-2 pr-3 cursor-pointer hover:text-adv-teal text-right" onClick={() => toggleSort('current_price')}>Current <SortIcon field="current_price" /></th>
                        <th className="pb-2 pr-3 cursor-pointer hover:text-adv-teal text-right" onClick={() => toggleSort('unrealized_pnl')}>P&L <SortIcon field="unrealized_pnl" /></th>
                        <th className="pb-2 w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedHoldings.map((h) => (
                        <tr key={h.symbol} className="border-b border-adv-dark/50 hover:bg-adv-dark-2/50">
                          <td className="py-1.5 pr-3 font-medium text-adv-off-white">{h.symbol}</td>
                          <td className="py-1.5 pr-3 text-right text-adv-gray">{(h.weight * 100).toFixed(2)}%</td>
                          <td className="py-1.5 pr-3 text-right text-adv-gray">{h.shares.toFixed(2)}</td>
                          <td className="py-1.5 pr-3 text-right text-adv-gray">{h.entry_price?.toFixed(2) ?? '-'}</td>
                          <td className="py-1.5 pr-3 text-right text-adv-gray">{h.current_price?.toFixed(2) ?? '-'}</td>
                          <td className={`py-1.5 pr-3 text-right font-medium ${h.unrealized_pnl >= 0 ? 'text-adv-green' : 'text-adv-red'}`}>
                            {h.unrealized_pnl >= 0 ? '+' : ''}{h.unrealized_pnl.toFixed(2)}
                          </td>
                          <td className="py-1.5">
                            <button onClick={() => handleRemoveHolding(h.symbol)} className="text-adv-gray hover:text-adv-red">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* Attribution Tab */}
          {detailTab === 'attribution' && (
            tabLoading ? (
              <p className="text-sm text-adv-gray text-center py-4">Loading attribution data...</p>
            ) : (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-semibold text-adv-off-white mb-3">Position Attribution</h3>
                  {positionAttribution.length === 0 ? (
                    <p className="text-sm text-adv-gray text-center py-4">No position attribution data available</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-adv-gray border-b border-adv-dark">
                            <th className="pb-2 pr-3">Symbol</th>
                            <th className="pb-2 pr-3 text-right">Weight</th>
                            <th className="pb-2 text-right">Contribution</th>
                          </tr>
                        </thead>
                        <tbody>
                          {positionAttribution.map((pa, i) => (
                            <tr key={i} className="border-b border-adv-dark/50">
                              <td className="py-1.5 pr-3 text-adv-off-white font-medium">{pa.symbol ?? '-'}</td>
                              <td className="py-1.5 pr-3 text-right text-adv-gray">{(pa.weight * 100).toFixed(2)}%</td>
                              <td className={`py-1.5 text-right font-medium ${pa.contribution >= 0 ? 'text-adv-green' : 'text-adv-red'}`}>
                                {pa.contribution >= 0 ? '+' : ''}{(pa.contribution * 100).toFixed(3)}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-adv-off-white mb-3">Sector Attribution</h3>
                  {sectorAttribution.length === 0 ? (
                    <p className="text-sm text-adv-gray text-center py-4">No sector attribution data available</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-adv-gray border-b border-adv-dark">
                            <th className="pb-2 pr-3">Sector</th>
                            <th className="pb-2 pr-3 text-right">Weight</th>
                            <th className="pb-2 text-right">Contribution</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sectorAttribution.map((sa, i) => (
                            <tr key={i} className="border-b border-adv-dark/50">
                              <td className="py-1.5 pr-3 text-adv-off-white font-medium">{sa.sector ?? '-'}</td>
                              <td className="py-1.5 pr-3 text-right text-adv-gray">{(sa.weight * 100).toFixed(2)}%</td>
                              <td className={`py-1.5 text-right font-medium ${sa.contribution >= 0 ? 'text-adv-green' : 'text-adv-red'}`}>
                                {sa.contribution >= 0 ? '+' : ''}{(sa.contribution * 100).toFixed(3)}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )
          )}

          {/* Rebalance History Tab */}
          {detailTab === 'rebalances' && (
            tabLoading ? (
              <p className="text-sm text-adv-gray text-center py-4">Loading rebalance history...</p>
            ) : rebalances.length === 0 ? (
              <p className="text-sm text-adv-gray text-center py-4">No rebalances yet</p>
            ) : (
              <div className="space-y-3">
                {rebalances.map((rb) => (
                  <div key={rb.id} className="rounded-lg border border-adv-dark bg-adv-dark-2 p-3 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-adv-off-white">{rb.rebalance_date}</div>
                      <div className="text-xs text-adv-gray capitalize">{rb.rebalance_type.replace(/_/g, ' ')}</div>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      rb.status === 'completed' ? 'bg-adv-green/10 text-adv-green' :
                      rb.status === 'pending' ? 'bg-adv-gold/10 text-adv-gold' :
                      'bg-adv-gray/10 text-adv-gray'
                    }`}>{rb.status}</span>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>

      {/* NAV History Table (fallback when no chart data) */}
      {navChartData.length <= 1 && index.recentNav.length > 0 && (
        <div className="rounded-xl border border-adv-card bg-adv-card p-5">
          <h2 className="text-lg font-semibold text-adv-off-white mb-4">NAV History</h2>
          <div className="space-y-1">
            {index.recentNav.slice(0, 15).map((nav) => (
              <div key={nav.nav_date} className="flex items-center justify-between text-sm">
                <span className="text-adv-gray">{nav.nav_date}</span>
                <span className="text-adv-off-white font-medium">{nav.nav_value.toFixed(2)}</span>
                {nav.daily_return !== null && (
                  <span className={nav.daily_return >= 0 ? 'text-adv-green' : 'text-adv-red'}>
                    {(nav.daily_return * 100).toFixed(2)}%
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {navChartData.length === 0 && index.recentNav.length === 0 && (
        <div className="rounded-xl border border-adv-card bg-adv-card p-5">
          <h2 className="text-lg font-semibold text-adv-off-white mb-4">NAV History</h2>
          <p className="text-sm text-adv-gray text-center py-4">No NAV data yet. Activate the index to start tracking.</p>
        </div>
      )}
    </div>
  );
}
