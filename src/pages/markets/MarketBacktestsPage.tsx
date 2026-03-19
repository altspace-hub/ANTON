import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Clock, Play, ChevronDown, ChevronUp,
  TrendingUp, TrendingDown, Brain, Loader2,
} from 'lucide-react';
import { fetchWithAuth } from '../../lib/api';
import MarketDisclaimer from '../../components/shared/MarketDisclaimer';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface BacktestItem {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  universe: string;
  strategy: string;
  status: string;
  total_return: number | null;
  sharpe_ratio: number | null;
  max_drawdown: number | null;
  predictions_correct: number | null;
  predictions_total: number | null;
  use_ai: boolean;
  created_at: string;
}

interface DaySnapshot {
  day: string;
  nav: number;
}

const PRESET_UNIVERSES: Record<string, string[]> = {
  FAANG: ['META', 'AAPL', 'AMZN', 'NFLX', 'GOOGL'],
  'S&P Leaders': ['AAPL', 'MSFT', 'AMZN', 'NVDA', 'GOOGL', 'META', 'TSLA', 'BRK.B', 'UNH', 'JNJ'],
  'All 20': [
    'AAPL', 'MSFT', 'AMZN', 'NVDA', 'GOOGL', 'META', 'TSLA', 'BRK.B', 'UNH', 'JNJ',
    'V', 'XOM', 'JPM', 'PG', 'MA', 'HD', 'CVX', 'LLY', 'MRK', 'ABBV',
  ],
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function MarketBacktestsPage() {
  const navigate = useNavigate();

  /* List state */
  const [backtests, setBacktests] = useState<BacktestItem[]>([]);
  const [loading, setLoading] = useState(true);

  /* Create form state */
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [presetChecks, setPresetChecks] = useState<Record<string, boolean>>({});
  const [customSymbols, setCustomSymbols] = useState('');
  const [rebalance, setRebalance] = useState('monthly');
  const [weighting, setWeighting] = useState('equal');
  const [useAI, setUseAI] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  /* Expanded detail state */
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [daySnapshots, setDaySnapshots] = useState<DaySnapshot[]>([]);
  const [daysLoading, setDaysLoading] = useState(false);

  /* ---- Fetch list ---- */
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/api/markets/backtests');
      if (res.ok) {
        const rows = (await res.json()) as BacktestItem[];
        setBacktests(
          rows.map((r) => ({
            ...r,
            total_return: r.total_return != null ? Number(r.total_return) : null,
            sharpe_ratio: r.sharpe_ratio != null ? Number(r.sharpe_ratio) : null,
            max_drawdown: r.max_drawdown != null ? Number(r.max_drawdown) : null,
            predictions_correct: r.predictions_correct != null ? Number(r.predictions_correct) : null,
            predictions_total: r.predictions_total != null ? Number(r.predictions_total) : null,
          })),
        );
      }
    } catch (err) {
      console.error('[MarketBacktests] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ---- Create backtest ---- */
  const buildUniverse = (): string[] => {
    const symbols = new Set<string>();
    for (const [key, checked] of Object.entries(presetChecks)) {
      if (checked && PRESET_UNIVERSES[key]) {
        PRESET_UNIVERSES[key].forEach((s) => symbols.add(s));
      }
    }
    if (customSymbols.trim()) {
      customSymbols
        .split(/[,\s]+/)
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
        .forEach((s) => symbols.add(s));
    }
    return Array.from(symbols);
  };

  const handleCreate = async () => {
    const universe = buildUniverse();
    if (!name.trim() || !startDate || !endDate || universe.length === 0) return;
    setSubmitting(true);
    try {
      const res = await fetchWithAuth('/api/markets/backtests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          startDate,
          endDate,
          universe,
          strategy: { rebalance, weighting, useAI },
        }),
      });
      if (res.ok) {
        setShowCreate(false);
        setName('');
        setStartDate('');
        setEndDate('');
        setPresetChecks({});
        setCustomSymbols('');
        setRebalance('monthly');
        setWeighting('equal');
        setUseAI(false);
        await fetchData();
      }
    } catch (err) {
      console.error('[MarketBacktests] create error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  /* ---- Expand / fetch day snapshots ---- */
  const toggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setDaySnapshots([]);
      return;
    }
    setExpandedId(id);
    setDaysLoading(true);
    try {
      const res = await fetchWithAuth(`/api/markets/backtests/${id}/days`);
      if (res.ok) {
        const rows = (await res.json()) as DaySnapshot[];
        setDaySnapshots(rows.map((r) => ({ ...r, nav: Number(r.nav) })));
      } else {
        setDaySnapshots([]);
      }
    } catch {
      setDaySnapshots([]);
    } finally {
      setDaysLoading(false);
    }
  };

  /* ---- Simple sparkline SVG ---- */
  const renderNavChart = (data: DaySnapshot[]) => {
    if (data.length < 2) return <p className="text-xs text-adv-gray">Not enough data for chart.</p>;
    const navs = data.map((d) => d.nav);
    const minNav = Math.min(...navs);
    const maxNav = Math.max(...navs);
    const range = maxNav - minNav || 1;
    const w = 600;
    const h = 120;
    const points = data
      .map((d, i) => {
        const x = (i / (data.length - 1)) * w;
        const y = h - ((d.nav - minNav) / range) * (h - 10) - 5;
        return `${x},${y}`;
      })
      .join(' ');
    const isPositive = navs[navs.length - 1] >= navs[0];
    return (
      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ maxHeight: 140 }}>
          <polyline
            points={points}
            fill="none"
            stroke={isPositive ? '#27AE60' : '#E74C3C'}
            strokeWidth="2"
          />
        </svg>
        <div className="flex justify-between text-[10px] text-adv-gray mt-1">
          <span>{data[0].day}</span>
          <span>{data[data.length - 1].day}</span>
        </div>
      </div>
    );
  };

  /* ---- Status badge ---- */
  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      completed: 'bg-adv-green/10 text-adv-green',
      running: 'bg-adv-blue/10 text-adv-blue',
      pending: 'bg-adv-gold/10 text-adv-gold',
      failed: 'bg-adv-red/10 text-adv-red',
    };
    return (
      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${map[status] ?? 'bg-adv-gray/10 text-adv-gray'}`}>
        {status}
      </span>
    );
  };

  /* ------------------------------------------------------------------ */
  /*  Render                                                             */
  /* ------------------------------------------------------------------ */

  return (
    <div className="min-h-screen p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/markets')}
            className="rounded-lg border border-adv-card bg-adv-card p-2 text-adv-gray hover:text-adv-teal transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-adv-off-white flex items-center gap-3">
              <Clock className="h-6 w-6 text-adv-teal" />
              Backtesting — Time Machine
            </h1>
            <p className="mt-0.5 text-sm text-adv-gray">
              Test strategies against historical data. Speed-run predictions and learning.
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
        >
          <Play className="h-4 w-4" /> New Backtest
        </button>
      </div>

      <MarketDisclaimer compact />

      {/* ---- Create form ---- */}
      {showCreate && (
        <div className="rounded-xl border border-adv-teal/30 bg-adv-card p-5 space-y-4">
          <h2 className="text-lg font-semibold text-adv-off-white">Create Backtest</h2>

          {/* Name */}
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Backtest name (e.g. FAANG Q1 2025)"
            className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal"
          />

          {/* Dates */}
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs text-adv-gray mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white focus:outline-none focus:border-adv-teal"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-adv-gray mb-1">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white focus:outline-none focus:border-adv-teal"
              />
            </div>
          </div>

          {/* Universe presets */}
          <div>
            <label className="block text-xs text-adv-gray mb-2">Universe</label>
            <div className="flex gap-4 flex-wrap">
              {Object.keys(PRESET_UNIVERSES).map((key) => (
                <label key={key} className="flex items-center gap-1.5 text-sm text-adv-off-white cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!presetChecks[key]}
                    onChange={(e) => setPresetChecks((p) => ({ ...p, [key]: e.target.checked }))}
                    className="accent-adv-teal"
                  />
                  {key}{' '}
                  <span className="text-xs text-adv-gray">({PRESET_UNIVERSES[key].length})</span>
                </label>
              ))}
            </div>
            <input
              type="text"
              value={customSymbols}
              onChange={(e) => setCustomSymbols(e.target.value)}
              placeholder="Or add custom symbols: TSLA, AMD, COIN ..."
              className="mt-2 w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal"
            />
          </div>

          {/* Strategy */}
          <div className="flex gap-4">
            <div>
              <label className="block text-xs text-adv-gray mb-1">Rebalance Frequency</label>
              <select
                value={rebalance}
                onChange={(e) => setRebalance(e.target.value)}
                className="rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-adv-gray mb-1">Weighting</label>
              <select
                value={weighting}
                onChange={(e) => setWeighting(e.target.value)}
                className="rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white"
              >
                <option value="equal">Equal Weight</option>
                <option value="conviction">Conviction</option>
              </select>
            </div>
          </div>

          {/* AI toggle */}
          <label className="flex items-center gap-2 text-sm text-adv-off-white cursor-pointer">
            <input
              type="checkbox"
              checked={useAI}
              onChange={(e) => setUseAI(e.target.checked)}
              className="accent-adv-teal"
            />
            <Brain className="h-4 w-4 text-adv-teal" />
            AI analysis
            <span className="text-xs text-adv-gray">(slower, costs API calls)</span>
          </label>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={!name.trim() || !startDate || !endDate || buildUniverse().length === 0 || submitting}
              className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50 transition-colors"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Run Backtest
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="rounded-lg border border-adv-dark px-4 py-2 text-sm text-adv-gray"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ---- Results list ---- */}
      {loading ? (
        <p className="text-sm text-adv-gray">Loading backtests...</p>
      ) : backtests.length === 0 ? (
        <div className="text-center py-16">
          <Clock className="h-12 w-12 text-adv-gray mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-adv-off-white mb-1">No backtests yet</h2>
          <p className="text-sm text-adv-gray">
            Create a backtest to simulate strategies against historical data.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {backtests.map((bt) => {
            const isExpanded = expandedId === bt.id;
            const accuracy =
              bt.predictions_total && bt.predictions_total > 0
                ? ((bt.predictions_correct ?? 0) / bt.predictions_total) * 100
                : null;
            return (
              <div
                key={bt.id}
                className="rounded-xl border border-adv-card bg-adv-card transition-colors"
              >
                {/* Summary row */}
                <button
                  onClick={() => toggleExpand(bt.id)}
                  className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-adv-dark-2/40 transition-colors rounded-xl"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-adv-off-white truncate">
                        {bt.name}
                      </span>
                      {statusBadge(bt.status)}
                    </div>
                    <p className="text-xs text-adv-gray mt-0.5">
                      {bt.start_date} — {bt.end_date}
                    </p>
                  </div>

                  {bt.status === 'completed' && (
                    <>
                      {/* Total return */}
                      <div className="text-right w-24">
                        <div
                          className={`text-sm font-bold flex items-center justify-end gap-1 ${
                            (bt.total_return ?? 0) >= 0 ? 'text-adv-green' : 'text-adv-red'
                          }`}
                        >
                          {(bt.total_return ?? 0) >= 0 ? (
                            <TrendingUp className="h-3.5 w-3.5" />
                          ) : (
                            <TrendingDown className="h-3.5 w-3.5" />
                          )}
                          {((bt.total_return ?? 0) * 100).toFixed(2)}%
                        </div>
                        <div className="text-[10px] text-adv-gray">Return</div>
                      </div>

                      {/* Sharpe */}
                      <div className="text-right w-16 hidden sm:block">
                        <div className="text-sm font-medium text-adv-off-white">
                          {bt.sharpe_ratio != null ? bt.sharpe_ratio.toFixed(2) : '—'}
                        </div>
                        <div className="text-[10px] text-adv-gray">Sharpe</div>
                      </div>

                      {/* Max drawdown */}
                      <div className="text-right w-20 hidden md:block">
                        <div className="text-sm font-medium text-adv-red">
                          {bt.max_drawdown != null
                            ? `${(bt.max_drawdown * 100).toFixed(1)}%`
                            : '—'}
                        </div>
                        <div className="text-[10px] text-adv-gray">Max DD</div>
                      </div>

                      {/* Predictions */}
                      <div className="text-right w-24 hidden lg:block">
                        <div className="text-sm font-medium text-adv-off-white">
                          {bt.predictions_correct ?? 0}/{bt.predictions_total ?? 0}
                          {accuracy != null && (
                            <span className="text-xs text-adv-gray ml-1">
                              ({accuracy.toFixed(0)}%)
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-adv-gray">Predictions</div>
                      </div>
                    </>
                  )}

                  {bt.status === 'running' && (
                    <Loader2 className="h-4 w-4 text-adv-blue animate-spin" />
                  )}

                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-adv-gray flex-shrink-0" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-adv-gray flex-shrink-0" />
                  )}
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-5 pb-5 pt-1 border-t border-adv-dark">
                    {daysLoading ? (
                      <p className="text-xs text-adv-gray py-4">Loading daily snapshots...</p>
                    ) : (
                      renderNavChart(daySnapshots)
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
