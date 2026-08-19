import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Brain, RefreshCw, BarChart2, BookOpen, Users, Zap, Package, Loader2, Check, TrendingUp, Activity, Scale } from 'lucide-react';
import { fetchWithAuth, exportMarketIntelligenceModelAnton } from '../../lib/api';
import MarketDisclaimer from '../../components/shared/MarketDisclaimer';

interface CalibrationEntry {
  bucket_low: number; bucket_high: number; sample_size: number;
  actual_accuracy: number; stated_confidence_avg: number; calibration_error: number; is_overconfident: number;
}

/**
 * Prediction -> portfolio attribution. `pnlBps` is a POSITION's contribution;
 * several predictions can inform one weight change, so the API rolls up to one
 * row per (rebalance, symbol) before totalling. `predictionsCredited` shows
 * that fan-out, and rawSumPnlPct is the (inflated) naive sum kept alongside so
 * the difference is visible rather than silently corrected.
 */
interface AttributionPosition {
  rebalanceId: string; symbol: string; executedAt: string;
  weightChangePct: number; subsequentReturnPct: number; pnlBps: number;
  returnLowPct: number; returnHighPct: number;
  predictionsCredited: number; avgSignalScore: number;
}
interface AttributionSummary {
  positions: AttributionPosition[];
  totals: {
    distinctPositions: number; totalPnlPct: number; helped: number; hurt: number;
    attributedPredictions: number; rawSumPnlPct: number;
  };
  coverage: {
    attributionRows: number; computedRows: number; pendingRows: number;
    lastRebalanceAt: string | null; rebalanceCount: number;
  };
}

interface Narrative {
  id: string; title: string; description: string; narrative_type: string;
  strength: number; momentum: string; lifecycle: string;
}

interface LearningEvent {
  id: string; learning_type: string; description: string; impact: string; created_at: string;
}

interface Backtest {
  id: string; strategy_name: string; start_date: string; end_date: string;
  total_return: number; sharpe_ratio: number | null; status: string;
}

interface ConsulPerformance {
  consul_name: string; accuracy: number; total_calls: number; avg_confidence: number;
}

interface LearningStats {
  totalEvents: number;
  byType: Array<{ learning_type: string; count: number }>;
  recentTrends: Array<{ period: string; count: number }>;
}

export default function MarketLearningPage() {
  const navigate = useNavigate();
  const [calibration, setCalibration] = useState<CalibrationEntry[]>([]);
  const [narratives, setNarratives] = useState<Narrative[]>([]);
  const [events, setEvents] = useState<LearningEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportState, setExportState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [activeTab, setActiveTab] = useState<'backtests' | 'consul' | 'stats' | 'attribution'>('backtests');
  const [backtests, setBacktests] = useState<Backtest[]>([]);
  const [consulPerf, setConsulPerf] = useState<ConsulPerformance[]>([]);
  const [learningStats, setLearningStats] = useState<LearningStats | null>(null);
  const [attribution, setAttribution] = useState<AttributionSummary | null>(null);
  const [tabLoading, setTabLoading] = useState(false);

  const handleExport = async () => {
    if (exportState !== 'idle') return;
    setExportState('loading');
    try {
      const blob = await exportMarketIntelligenceModelAnton();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'market-intelligence-model.anton';
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
    setLoading(true);
    try {
      const [calRes, narRes, evRes] = await Promise.all([
        fetchWithAuth('/api/markets/learning/calibration'),
        fetchWithAuth('/api/markets/learning/narratives'),
        fetchWithAuth('/api/markets/learning/events'),
      ]);
      if (calRes.ok) {
        const calRaw = await calRes.json() as CalibrationEntry[];
        setCalibration(calRaw.map(c => ({
          ...c,
          bucket_low: Number(c.bucket_low) || 0,
          bucket_high: Number(c.bucket_high) || 0,
          sample_size: Number(c.sample_size) || 0,
          actual_accuracy: Number(c.actual_accuracy) || 0,
          stated_confidence_avg: Number(c.stated_confidence_avg) || 0,
          calibration_error: Number(c.calibration_error) || 0,
        })));
      }
      if (narRes.ok) {
        const narRaw = await narRes.json() as Narrative[];
        setNarratives(narRaw.map(n => ({ ...n, strength: Number(n.strength) || 0 })));
      }
      if (evRes.ok) setEvents(await evRes.json() as LearningEvent[]);
    } catch (err) { console.error('[MarketLearning] Error:', err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRunCalibration = async () => {
    await fetchWithAuth('/api/markets/learning/calibration/run', { method: 'POST' });
    fetchData();
  };

  const fetchTabData = useCallback(async (tab: typeof activeTab) => {
    setTabLoading(true);
    try {
      if (tab === 'backtests') {
        const res = await fetchWithAuth('/api/markets/learning/backtests');
        if (res.ok) {
          const btRaw = await res.json() as Backtest[];
          setBacktests(btRaw.map(bt => ({
            ...bt,
            total_return: Number(bt.total_return) || 0,
            sharpe_ratio: bt.sharpe_ratio != null ? Number(bt.sharpe_ratio) : null,
          })));
        }
      } else if (tab === 'consul') {
        const res = await fetchWithAuth('/api/markets/learning/consul-performance');
        if (res.ok) {
          const cpRaw = await res.json() as ConsulPerformance[];
          setConsulPerf(cpRaw.map(cp => ({
            ...cp,
            accuracy: Number(cp.accuracy) || 0,
            total_calls: Number(cp.total_calls) || 0,
            avg_confidence: Number(cp.avg_confidence) || 0,
          })));
        }
      } else if (tab === 'stats') {
        const res = await fetchWithAuth('/api/markets/learning/stats');
        if (res.ok) setLearningStats(await res.json() as LearningStats);
      } else if (tab === 'attribution') {
        const res = await fetchWithAuth('/api/markets/learning/attribution/summary');
        if (res.ok) setAttribution(await res.json() as AttributionSummary);
      }
    } catch (err) {
      console.error('[MarketLearning] Tab data error:', err);
    } finally {
      setTabLoading(false);
    }
  }, []);

  useEffect(() => { fetchTabData(activeTab); }, [activeTab, fetchTabData]);

  return (
    <div className="min-h-screen p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/markets')} className="rounded-lg border border-adv-card bg-adv-card p-2 text-adv-gray hover:text-adv-teal transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-adv-off-white flex items-center gap-3">
              <Brain className="h-6 w-6 text-purple-400" />
              Learning & Intelligence
            </h1>
            <p className="text-sm text-adv-gray">Calibration, narratives, signal weights, meta-learning</p>
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
          <button onClick={handleRunCalibration} className="flex items-center gap-2 rounded-lg border border-adv-card bg-adv-card px-3 py-2 text-sm text-adv-gray hover:text-adv-teal transition-colors">
            <RefreshCw className="h-4 w-4" /> Run Calibration
          </button>
        </div>
      </div>

      <MarketDisclaimer compact />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Calibration */}
        <div className="rounded-xl border border-adv-card bg-adv-card p-5">
          <h2 className="text-lg font-semibold text-adv-off-white mb-4 flex items-center gap-2">
            <BarChart2 className="h-5 w-5 text-adv-teal" /> Confidence Calibration
          </h2>
          {calibration.length === 0 ? (
            <p className="text-sm text-adv-gray text-center py-4">Run calibration to see results</p>
          ) : (
            <div className="space-y-3">
              {calibration.map((c, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-sm text-adv-off-white">{Math.round(c.bucket_low * 100)}-{Math.round(c.bucket_high * 100)}%</span>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-adv-gray">n={c.sample_size}</span>
                    <span className={`text-sm font-medium ${c.is_overconfident ? 'text-adv-red' : 'text-adv-green'}`}>
                      {(c.actual_accuracy * 100).toFixed(1)}% actual
                    </span>
                    <span className="text-xs text-adv-gray">err: {(c.calibration_error * 100).toFixed(1)}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Narratives */}
        <div className="rounded-xl border border-adv-card bg-adv-card p-5">
          <h2 className="text-lg font-semibold text-adv-off-white mb-4 flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-adv-gold" /> Market Narratives
          </h2>
          {narratives.length === 0 ? (
            <p className="text-sm text-adv-gray text-center py-4">No narratives tracked yet</p>
          ) : (
            <div className="space-y-3">
              {narratives.map((n) => (
                <div key={n.id} className="rounded-lg border border-adv-dark bg-adv-dark-2 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-adv-teal capitalize">{n.lifecycle}</span>
                    <span className="text-xs text-adv-gray">{n.narrative_type}</span>
                    <span className="text-xs text-adv-gray">str: {(n.strength * 100).toFixed(0)}%</span>
                  </div>
                  <h3 className="text-sm font-medium text-adv-off-white">{n.title}</h3>
                  <p className="text-xs text-adv-gray line-clamp-2 mt-1">{n.description}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Learning Events */}
        <div className="rounded-xl border border-adv-card bg-adv-card p-5 lg:col-span-2">
          <h2 className="text-lg font-semibold text-adv-off-white mb-4 flex items-center gap-2">
            <Zap className="h-5 w-5 text-adv-green" /> Learning Events
          </h2>
          {events.length === 0 ? (
            <p className="text-sm text-adv-gray text-center py-4">Learning events are generated from prediction validations and investigations</p>
          ) : (
            <div className="space-y-2">
              {events.map((e) => (
                <div key={e.id} className="flex items-center gap-3 rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    e.impact === 'high' ? 'bg-adv-green/10 text-adv-green' : e.impact === 'medium' ? 'bg-adv-gold/10 text-adv-gold' : 'bg-adv-gray/10 text-adv-gray'
                  }`}>{e.impact}</span>
                  <span className="text-xs text-adv-teal capitalize">{e.learning_type.replace(/_/g, ' ')}</span>
                  <span className="text-sm text-adv-off-white flex-1">{e.description}</span>
                  <span className="text-xs text-adv-gray">{new Date(e.created_at).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Advanced Learning Tabs */}
      <div className="rounded-xl border border-adv-card bg-adv-card p-5">
        <div className="flex items-center gap-2 mb-4">
          {([
            { key: 'backtests' as const, label: 'Backtests', icon: TrendingUp },
            { key: 'consul' as const, label: 'Consul Performance', icon: Users },
            { key: 'stats' as const, label: 'Learning Stats', icon: Activity },
            { key: 'attribution' as const, label: 'Portfolio Impact', icon: Scale },
          ]).map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors ${activeTab === key ? 'bg-adv-teal text-adv-dark' : 'bg-adv-card text-adv-gray hover:text-adv-off-white'}`}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>

        {tabLoading ? (
          <p className="text-sm text-adv-gray text-center py-4">Loading...</p>
        ) : activeTab === 'backtests' ? (
          backtests.length === 0 ? (
            <p className="text-sm text-adv-gray text-center py-4">No backtests yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-adv-gray border-b border-adv-dark">
                    <th className="pb-2 pr-3">Strategy</th>
                    <th className="pb-2 pr-3">Start</th>
                    <th className="pb-2 pr-3">End</th>
                    <th className="pb-2 pr-3 text-right">Return</th>
                    <th className="pb-2 pr-3 text-right">Sharpe</th>
                    <th className="pb-2 text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {backtests.map((bt) => (
                    <tr key={bt.id} className="border-b border-adv-dark/50">
                      <td className="py-1.5 pr-3 text-adv-off-white font-medium">{bt.strategy_name}</td>
                      <td className="py-1.5 pr-3 text-adv-gray">{bt.start_date}</td>
                      <td className="py-1.5 pr-3 text-adv-gray">{bt.end_date}</td>
                      <td className={`py-1.5 pr-3 text-right font-medium ${bt.total_return >= 0 ? 'text-adv-green' : 'text-adv-red'}`}>
                        {(bt.total_return * 100).toFixed(2)}%
                      </td>
                      <td className="py-1.5 pr-3 text-right text-adv-gray">{bt.sharpe_ratio?.toFixed(2) ?? '-'}</td>
                      <td className="py-1.5 text-right">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${bt.status === 'completed' ? 'bg-adv-green/10 text-adv-green' : 'bg-adv-gray/10 text-adv-gray'}`}>{bt.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : activeTab === 'consul' ? (
          consulPerf.length === 0 ? (
            <p className="text-sm text-adv-gray text-center py-4">No consul performance data yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-adv-gray border-b border-adv-dark">
                    <th className="pb-2 pr-3">Consul</th>
                    <th className="pb-2 pr-3 text-right">Accuracy</th>
                    <th className="pb-2 pr-3 text-right">Total Calls</th>
                    <th className="pb-2 text-right">Avg Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {consulPerf.map((cp) => (
                    <tr key={cp.consul_name} className="border-b border-adv-dark/50">
                      <td className="py-1.5 pr-3 text-adv-off-white font-medium capitalize">{cp.consul_name.replace(/_/g, ' ')}</td>
                      <td className={`py-1.5 pr-3 text-right font-medium ${cp.accuracy >= 0.5 ? 'text-adv-green' : 'text-adv-red'}`}>
                        {(cp.accuracy * 100).toFixed(1)}%
                      </td>
                      <td className="py-1.5 pr-3 text-right text-adv-gray">{cp.total_calls}</td>
                      <td className="py-1.5 text-right text-adv-gray">{(cp.avg_confidence * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : activeTab === 'attribution' ? (
          !attribution || attribution.totals.distinctPositions === 0 ? (
            <p className="text-sm text-adv-gray text-center py-4">
              No prediction has reached the portfolio yet — attribution is recorded when a rebalance acts on a signal.
            </p>
          ) : (
            <div className="space-y-4">
              {/* Headline: did the signals add or subtract? */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg bg-adv-dark p-3">
                  <p className="text-xs text-adv-gray">Signal contribution</p>
                  <p className={`text-lg font-semibold ${attribution.totals.totalPnlPct >= 0 ? 'text-adv-green' : 'text-adv-red'}`}>
                    {attribution.totals.totalPnlPct >= 0 ? '+' : ''}{attribution.totals.totalPnlPct.toFixed(3)}%
                  </p>
                </div>
                <div className="rounded-lg bg-adv-dark p-3">
                  <p className="text-xs text-adv-gray">Positions</p>
                  <p className="text-lg font-semibold text-adv-off-white">{attribution.totals.distinctPositions}</p>
                </div>
                <div className="rounded-lg bg-adv-dark p-3">
                  <p className="text-xs text-adv-gray">Helped / hurt</p>
                  <p className="text-lg font-semibold text-adv-off-white">
                    <span className="text-adv-green">{attribution.totals.helped}</span>
                    {' / '}
                    <span className="text-adv-red">{attribution.totals.hurt}</span>
                  </p>
                </div>
                <div className="rounded-lg bg-adv-dark p-3">
                  <p className="text-xs text-adv-gray">Last rebalance</p>
                  <p className="text-lg font-semibold text-adv-off-white">{attribution.coverage.lastRebalanceAt ?? '—'}</p>
                </div>
              </div>

              {/* The caveat belongs next to the number, not in a doc nobody opens. */}
              <p className="text-xs text-adv-gray-med leading-relaxed">
                Contribution is weight change x subsequent return, rolled up to one row per position.
                {attribution.totals.attributedPredictions > attribution.totals.distinctPositions && (
                  <> {attribution.totals.attributedPredictions} predictions informed {attribution.totals.distinctPositions} positions,
                  so summing per-prediction rows would report {attribution.totals.rawSumPnlPct >= 0 ? '+' : ''}{attribution.totals.rawSumPnlPct.toFixed(3)}% by counting
                  each position once per prediction.</>
                )}
                {attribution.coverage.pendingRows > 0 && <> {attribution.coverage.pendingRows} row(s) still awaiting maturity.</>}
              </p>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-adv-gray border-b border-adv-dark">
                      <th className="pb-2 pr-3">Symbol</th>
                      <th className="pb-2 pr-3">Rebalanced</th>
                      <th className="pb-2 pr-3 text-right">Weight change</th>
                      <th className="pb-2 pr-3 text-right">Subsequent return</th>
                      <th className="pb-2 pr-3 text-right">Contribution</th>
                      <th className="pb-2 text-right">Predictions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attribution.positions.map((pos) => (
                      <tr key={`${pos.rebalanceId}-${pos.symbol}`} className="border-b border-adv-dark/50">
                        <td className="py-1.5 pr-3 text-adv-off-white font-medium">{pos.symbol}</td>
                        <td className="py-1.5 pr-3 text-adv-gray">{pos.executedAt}</td>
                        <td className={`py-1.5 pr-3 text-right ${pos.weightChangePct >= 0 ? 'text-adv-green' : 'text-adv-red'}`}>
                          {pos.weightChangePct >= 0 ? '+' : ''}{pos.weightChangePct.toFixed(2)}%
                        </td>
                        <td className="py-1.5 pr-3 text-right text-adv-gray">
                          {pos.subsequentReturnPct >= 0 ? '+' : ''}{pos.subsequentReturnPct.toFixed(2)}%
                          {Math.abs(pos.returnHighPct - pos.returnLowPct) > 0.01 && (
                            <span className="text-adv-gray-med"> ({pos.returnLowPct.toFixed(1)}..{pos.returnHighPct.toFixed(1)})</span>
                          )}
                        </td>
                        <td className={`py-1.5 pr-3 text-right font-medium ${pos.pnlBps >= 0 ? 'text-adv-green' : 'text-adv-red'}`}>
                          {pos.pnlBps >= 0 ? '+' : ''}{pos.pnlBps.toFixed(1)} bps
                        </td>
                        <td className="py-1.5 text-right text-adv-gray">{pos.predictionsCredited}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        ) : (
          /* Learning Stats tab */
          !learningStats ? (
            <p className="text-sm text-adv-gray text-center py-4">No learning stats available</p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-lg border border-adv-dark bg-adv-dark-2 p-4">
                  <div className="text-2xl font-bold text-adv-off-white">{learningStats.totalEvents}</div>
                  <div className="text-xs text-adv-gray">Total Learning Events</div>
                </div>
                {learningStats.byType.slice(0, 2).map((bt) => (
                  <div key={bt.learning_type} className="rounded-lg border border-adv-dark bg-adv-dark-2 p-4">
                    <div className="text-2xl font-bold text-adv-teal">{bt.count}</div>
                    <div className="text-xs text-adv-gray capitalize">{bt.learning_type.replace(/_/g, ' ')}</div>
                  </div>
                ))}
              </div>
              {learningStats.byType.length > 2 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-adv-off-white">Breakdown by Type</h3>
                  {learningStats.byType.map((bt) => (
                    <div key={bt.learning_type} className="flex items-center justify-between rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2">
                      <span className="text-sm text-adv-off-white capitalize">{bt.learning_type.replace(/_/g, ' ')}</span>
                      <span className="text-sm font-medium text-adv-teal">{bt.count}</span>
                    </div>
                  ))}
                </div>
              )}
              {learningStats.recentTrends.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-adv-off-white">Recent Trends</h3>
                  {learningStats.recentTrends.map((rt) => (
                    <div key={rt.period} className="flex items-center justify-between rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2">
                      <span className="text-sm text-adv-gray">{rt.period}</span>
                      <span className="text-sm font-medium text-adv-off-white">{rt.count} events</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
}
