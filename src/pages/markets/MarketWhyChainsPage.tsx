import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, GitBranch, Plus, ChevronRight, CheckCircle2, Clock,
} from 'lucide-react';
import { fetchWithAuth } from '../../lib/api';
import MarketDisclaimer from '../../components/shared/MarketDisclaimer';

interface WhyChain {
  id: string;
  title: string;
  direction: string;
  status: string;
  level_count: number;
  root_cause_type: string | null;
  trigger_event: string | null;
  created_at: string;
}

interface WhyChainStats {
  total: number;
  completed: number;
  in_progress: number;
  avg_levels: number;
}

const DIRECTION_COLORS: Record<string, string> = {
  failure_analysis: 'text-adv-red bg-adv-red/10',
  success_analysis: 'text-adv-green bg-adv-green/10',
};

const STATUS_CONFIG: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  in_progress: { icon: <Clock className="h-3.5 w-3.5" />, color: 'text-adv-gold', label: 'In Progress' },
  completed: { icon: <CheckCircle2 className="h-3.5 w-3.5" />, color: 'text-adv-green', label: 'Completed' },
};

export default function MarketWhyChainsPage() {
  const navigate = useNavigate();
  const [chains, setChains] = useState<WhyChain[]>([]);
  const [stats, setStats] = useState<WhyChainStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [directionFilter, setDirectionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDirection, setNewDirection] = useState('failure_analysis');
  const [newTriggerEvent, setNewTriggerEvent] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (directionFilter) params.set('direction', directionFilter);
      if (statusFilter) params.set('status', statusFilter);
      const [chainsRes, statsRes] = await Promise.all([
        fetchWithAuth(`/api/markets/why-chains?${params}`),
        fetchWithAuth('/api/markets/why-chains/stats'),
      ]);
      if (chainsRes.ok) setChains(await chainsRes.json() as WhyChain[]);
      if (statsRes.ok) {
        const statsRaw = await statsRes.json() as WhyChainStats;
        setStats({
          total: Number(statsRaw.total) || 0,
          completed: Number(statsRaw.completed) || 0,
          in_progress: Number(statsRaw.in_progress) || 0,
          avg_levels: Number(statsRaw.avg_levels) || 0,
        });
      }
    } catch (err) {
      console.error('[MarketWhyChains] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [directionFilter, statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    try {
      await fetchWithAuth('/api/markets/why-chains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle,
          direction: newDirection,
          triggerEvent: newTriggerEvent || undefined,
        }),
      });
      setShowCreate(false);
      setNewTitle('');
      setNewTriggerEvent('');
      fetchData();
    } catch (err) {
      console.error('[MarketWhyChains] Create error:', err);
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
              <GitBranch className="h-6 w-6 text-orange-400" />
              Why Chains
            </h1>
            <p className="mt-0.5 text-sm text-adv-gray">Root cause analysis — trace failures and successes to their origins</p>
          </div>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors">
          <Plus className="h-4 w-4" /> New Chain
        </button>
      </div>

      <MarketDisclaimer compact />

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-xl border border-adv-card bg-adv-card p-4">
            <div className="text-2xl font-bold text-adv-off-white">{stats.total}</div>
            <div className="text-xs text-adv-gray">Total Chains</div>
          </div>
          <div className="rounded-xl border border-adv-card bg-adv-card p-4">
            <div className="text-2xl font-bold text-adv-green">{stats.completed}</div>
            <div className="text-xs text-adv-gray">Completed</div>
          </div>
          <div className="rounded-xl border border-adv-card bg-adv-card p-4">
            <div className="text-2xl font-bold text-adv-gold">{stats.in_progress}</div>
            <div className="text-xs text-adv-gray">In Progress</div>
          </div>
          <div className="rounded-xl border border-adv-card bg-adv-card p-4">
            <div className="text-2xl font-bold text-adv-teal">{stats.avg_levels?.toFixed(1) ?? '0'}</div>
            <div className="text-xs text-adv-gray">Avg Levels</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2">
        {['', 'failure_analysis', 'success_analysis'].map((d) => (
          <button key={d} onClick={() => setDirectionFilter(d)}
            className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${directionFilter === d ? 'bg-adv-teal text-adv-dark' : 'bg-adv-card text-adv-gray hover:text-adv-off-white'}`}
          >
            {d ? d.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'All'}
          </button>
        ))}
        <div className="w-px h-5 bg-adv-dark mx-1" />
        {['', 'in_progress', 'completed'].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${statusFilter === s ? 'bg-adv-teal text-adv-dark' : 'bg-adv-card text-adv-gray hover:text-adv-off-white'}`}
          >
            {s ? s.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'All Status'}
          </button>
        ))}
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="rounded-xl border border-adv-teal/30 bg-adv-card p-5 space-y-4">
          <h2 className="text-lg font-semibold text-adv-off-white">New Why Chain</h2>
          <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Chain title"
            className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal" />
          <select value={newDirection} onChange={(e) => setNewDirection(e.target.value)}
            className="rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white focus:outline-none focus:border-adv-teal">
            <option value="failure_analysis">Failure Analysis</option>
            <option value="success_analysis">Success Analysis</option>
          </select>
          <textarea value={newTriggerEvent} onChange={(e) => setNewTriggerEvent(e.target.value)} placeholder="Trigger event — what happened that prompted this analysis?"
            rows={3} className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal" />
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={!newTitle.trim()} className="rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50">Create</button>
            <button onClick={() => setShowCreate(false)} className="rounded-lg border border-adv-dark px-4 py-2 text-sm text-adv-gray hover:text-adv-off-white">Cancel</button>
          </div>
        </div>
      )}

      {/* Chains List */}
      {loading ? (
        <p className="text-sm text-adv-gray">Loading chains...</p>
      ) : chains.length === 0 ? (
        <div className="text-center py-16">
          <GitBranch className="h-12 w-12 text-adv-gray mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-adv-off-white mb-1">No why chains yet</h2>
          <p className="text-sm text-adv-gray">Create a why chain to trace market events to their root causes</p>
        </div>
      ) : (
        <div className="space-y-3">
          {chains.map((chain) => {
            const statusCfg = STATUS_CONFIG[chain.status] ?? STATUS_CONFIG.in_progress;
            const dirColor = DIRECTION_COLORS[chain.direction] ?? 'text-adv-gray bg-adv-gray/10';
            return (
              <div key={chain.id}
                onClick={() => navigate(`/markets/why-chains/${chain.id}`)}
                className="rounded-xl border border-adv-card bg-adv-card p-4 hover:border-adv-teal/30 transition-colors cursor-pointer">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium ${statusCfg.color}`}>
                        {statusCfg.icon} {statusCfg.label}
                      </span>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${dirColor}`}>
                        {chain.direction.replace('_', ' ')}
                      </span>
                      <span className="text-xs text-adv-gray">{chain.level_count} levels</span>
                      {chain.root_cause_type && (
                        <span className="text-xs text-adv-teal capitalize">{chain.root_cause_type.replace('_', ' ')}</span>
                      )}
                    </div>
                    <h3 className="text-sm font-semibold text-adv-off-white">{chain.title}</h3>
                    {chain.trigger_event && (
                      <p className="mt-1 text-xs text-adv-gray line-clamp-2">{chain.trigger_event}</p>
                    )}
                  </div>
                  <ChevronRight className="h-5 w-5 text-adv-gray shrink-0 ml-4" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
