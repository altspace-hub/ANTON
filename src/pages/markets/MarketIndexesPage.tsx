import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, BarChart2, Plus, Trophy, TrendingUp, TrendingDown,
} from 'lucide-react';
import { fetchWithAuth } from '../../lib/api';
import MarketDisclaimer from '../../components/shared/MarketDisclaimer';

interface IndexItem {
  id: string;
  name: string;
  description: string;
  index_type: string;
  philosophy: string | null;
  status: string;
  current_nav: number;
  total_return: number;
  max_holdings: number;
  rebalance_frequency: string;
  weighting_method: string;
  budget: number | null;
  currency: string | null;
  universe: string;
  created_at: string;
}

interface LeaderboardEntry {
  id: string;
  name: string;
  current_nav: number;
  total_return: number;
  status: string;
}

export default function MarketIndexesPage() {
  const navigate = useNavigate();
  const [indexes, setIndexes] = useState<IndexItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newType, setNewType] = useState('custom');
  const [newWeighting, setNewWeighting] = useState('equal');
  const [view, setView] = useState<'list' | 'leaderboard'>('list');
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [lbPeriod, setLbPeriod] = useState('1m');
  const [lbLoading, setLbLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/api/markets/indexes');
      if (res.ok) {
        const rows = await res.json() as IndexItem[];
        setIndexes(rows.map(r => ({ ...r, current_nav: Number(r.current_nav) || 0, total_return: Number(r.total_return) || 0, budget: r.budget != null ? Number(r.budget) : null })));
      }
    } catch (err) {
      console.error('[MarketIndexes] Error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fetchLeaderboard = useCallback(async () => {
    setLbLoading(true);
    try {
      const res = await fetchWithAuth(`/api/markets/indexes/leaderboard?period=${lbPeriod}`);
      if (res.ok) {
        const rows = await res.json() as LeaderboardEntry[];
        setLeaderboard(rows.map(r => ({ ...r, current_nav: Number(r.current_nav) || 0, total_return: Number(r.total_return) || 0 })));
      }
    } catch (err) {
      console.error('[MarketIndexes] Leaderboard error:', err);
    } finally {
      setLbLoading(false);
    }
  }, [lbPeriod]);

  useEffect(() => { if (view === 'leaderboard') fetchLeaderboard(); }, [view, fetchLeaderboard]);

  const handleCreate = async () => {
    if (!newName.trim() || !newDesc.trim()) return;
    try {
      const res = await fetchWithAuth('/api/markets/indexes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, description: newDesc, indexType: newType, weightingMethod: newWeighting }),
      });
      if (res.ok) {
        const { id } = await res.json() as { id: string };
        setShowCreate(false);
        setNewName(''); setNewDesc('');
        navigate(`/markets/indexes/${id}`);
      }
    } catch (err) {
      console.error('[MarketIndexes] Create error:', err);
    }
  };

  return (
    <div className="min-h-screen p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/markets')} className="rounded-lg border border-adv-card bg-adv-card p-2 text-adv-gray hover:text-adv-teal transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-adv-off-white flex items-center gap-3">
              <BarChart2 className="h-6 w-6 text-adv-teal" />
              ANTON Indexes
            </h1>
            <p className="mt-0.5 text-sm text-adv-gray">Paper-traded synthetic benchmark portfolios</p>
          </div>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors">
          <Plus className="h-4 w-4" /> Create Index
        </button>
      </div>

      <MarketDisclaimer compact />

      {/* View Toggle */}
      <div className="flex items-center gap-2">
        <button onClick={() => setView('list')}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors ${view === 'list' ? 'bg-adv-teal text-adv-dark' : 'bg-adv-card text-adv-gray hover:text-adv-off-white'}`}>
          <BarChart2 className="h-3.5 w-3.5" /> List
        </button>
        <button onClick={() => setView('leaderboard')}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors ${view === 'leaderboard' ? 'bg-adv-teal text-adv-dark' : 'bg-adv-card text-adv-gray hover:text-adv-off-white'}`}>
          <Trophy className="h-3.5 w-3.5" /> Leaderboard
        </button>
      </div>

      {showCreate && (
        <div className="rounded-xl border border-adv-teal/30 bg-adv-card p-5 space-y-4">
          <h2 className="text-lg font-semibold text-adv-off-white">New Index</h2>
          <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Index name (e.g. ANTON Nordic 30)"
            className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal" />
          <textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Investment philosophy and selection criteria..."
            rows={3} className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal" />
          <div className="flex gap-4">
            <select value={newType} onChange={(e) => setNewType(e.target.value)} className="rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white">
              <option value="geographic">Geographic</option>
              <option value="sector">Sector</option>
              <option value="philosophy">Philosophy</option>
              <option value="custom">Custom</option>
            </select>
            <select value={newWeighting} onChange={(e) => setNewWeighting(e.target.value)} className="rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white">
              <option value="equal">Equal Weight</option>
              <option value="market_cap">Market Cap</option>
              <option value="conviction">Conviction</option>
              <option value="risk_parity">Risk Parity</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={!newName.trim() || !newDesc.trim()} className="rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50">Create</button>
            <button onClick={() => setShowCreate(false)} className="rounded-lg border border-adv-dark px-4 py-2 text-sm text-adv-gray">Cancel</button>
          </div>
        </div>
      )}

      {/* Leaderboard View */}
      {view === 'leaderboard' && (
        <div className="rounded-xl border border-adv-card bg-adv-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-adv-off-white flex items-center gap-2">
              <Trophy className="h-5 w-5 text-adv-gold" /> Leaderboard
            </h2>
            <div className="flex items-center gap-1">
              {['1w', '1m', '3m', 'ytd', '1y'].map((p) => (
                <button key={p} onClick={() => setLbPeriod(p)}
                  className={`rounded px-2 py-1 text-xs transition-colors ${lbPeriod === p ? 'bg-adv-teal text-adv-dark' : 'bg-adv-dark text-adv-gray hover:text-adv-off-white'}`}>
                  {p.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          {lbLoading ? (
            <p className="text-sm text-adv-gray">Loading leaderboard...</p>
          ) : leaderboard.length === 0 ? (
            <p className="text-sm text-adv-gray text-center py-8">No leaderboard data available. Activate indexes to start tracking performance.</p>
          ) : (
            <div className="space-y-2">
              {leaderboard.map((entry, rank) => (
                <div key={entry.id} onClick={() => navigate(`/markets/indexes/${entry.id}`)}
                  className="flex items-center gap-4 rounded-lg border border-adv-dark bg-adv-dark-2 px-4 py-3 cursor-pointer hover:border-adv-teal/30 transition-colors">
                  <span className={`text-lg font-bold w-8 text-center ${rank === 0 ? 'text-adv-gold' : rank === 1 ? 'text-adv-gray' : rank === 2 ? 'text-orange-400' : 'text-adv-gray'}`}>
                    #{rank + 1}
                  </span>
                  <div className="flex-1">
                    <span className="text-sm font-medium text-adv-off-white">{entry.name}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-adv-off-white">{entry.current_nav.toFixed(2)}</div>
                    <div className="text-xs text-adv-gray">NAV</div>
                  </div>
                  <div className="text-right w-24">
                    <div className={`text-sm font-bold flex items-center justify-end gap-1 ${entry.total_return >= 0 ? 'text-adv-green' : 'text-adv-red'}`}>
                      {entry.total_return >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                      {(entry.total_return * 100).toFixed(2)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Index List View */}
      {view === 'list' && (loading ? (
        <p className="text-sm text-adv-gray">Loading indexes...</p>
      ) : indexes.length === 0 ? (
        <div className="text-center py-16">
          <BarChart2 className="h-12 w-12 text-adv-gray mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-adv-off-white mb-1">No indexes yet</h2>
          <p className="text-sm text-adv-gray">Create paper-traded index portfolios to track ANTON's intelligence performance</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {indexes.map((idx) => (
            <div key={idx.id} onClick={() => navigate(`/markets/indexes/${idx.id}`)}
              className="rounded-xl border border-adv-card bg-adv-card p-4 cursor-pointer hover:border-adv-teal/30 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  idx.status === 'active' ? 'bg-adv-green/10 text-adv-green' : 'bg-adv-gray/10 text-adv-gray'
                }`}>{idx.status}</span>
                <span className="text-xs text-adv-gray capitalize">{idx.index_type}</span>
              </div>
              <h3 className="text-sm font-semibold text-adv-off-white">{idx.name}</h3>
              <p className="mt-1 text-xs text-adv-gray line-clamp-2">{idx.description}</p>
              <div className="mt-3 flex items-center justify-between">
                <div>
                  <div className="text-lg font-bold text-adv-off-white">{idx.current_nav.toFixed(2)}</div>
                  <div className="text-xs text-adv-gray">NAV</div>
                </div>
                <div className="text-right">
                  <div className={`text-lg font-bold flex items-center gap-1 ${idx.total_return >= 0 ? 'text-adv-green' : 'text-adv-red'}`}>
                    {idx.total_return >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                    {(idx.total_return * 100).toFixed(2)}%
                  </div>
                  <div className="text-xs text-adv-gray">Return</div>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-adv-gray flex-wrap">
                <span>{idx.max_holdings} max</span>
                <span>|</span>
                <span>{idx.rebalance_frequency}</span>
                <span>|</span>
                <span>{idx.weighting_method.replace('_', ' ')}</span>
                {idx.budget && idx.budget > 0 && (
                  <>
                    <span>|</span>
                    <span className="text-adv-teal">
                      {(idx.budget / 1000000).toFixed(0)}M {idx.currency || 'USD'}
                    </span>
                  </>
                )}
                {(() => {
                  try {
                    const u = JSON.parse(idx.universe || '[]');
                    return Array.isArray(u) && u.length > 0 && typeof u[0] === 'string' ? (
                      <>
                        <span>|</span>
                        <span>{u.length} tickers</span>
                      </>
                    ) : null;
                  } catch { return null; }
                })()}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
