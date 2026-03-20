import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, RefreshCw, BarChart2, Star, Clock, Briefcase } from 'lucide-react';
import { fetchWithAuth } from '../../lib/api';

interface CapabilityCard {
  formatVersion: string;
  instanceHash: string;
  displayName: string;
  generatedAt: string;
  modules: Array<{ moduleId: string; area: string; executionCount: number; avgQualityScore: number | null }>;
  areas: string[];
  stats: { totalSessions: number; totalModulesUsed: number; avgOverallQuality: number | null; activeSince: string | null };
  professionalContext?: { roleTitle?: string; organisation?: string; expertise?: string; focusAreas?: string[] };
}

export default function CommunityCapabilityCardPage() {
  const navigate = useNavigate();
  const [card, setCard] = useState<CapabilityCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchCard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/api/community/capability-card');
      if (res.ok) setCard(await res.json());
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchCard(); }, [fetchCard]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetchWithAuth('/api/community/capability-card/refresh', { method: 'POST' });
      if (res.ok) setCard(await res.json());
    } catch {} finally { setRefreshing(false); }
  };

  return (
    <div className="min-h-screen p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/community')} className="rounded-lg border border-adv-card bg-adv-card p-2 text-adv-gray hover:text-adv-teal"><ArrowLeft className="h-4 w-4" /></button>
          <div>
            <h1 className="text-2xl font-bold text-adv-off-white flex items-center gap-3"><Eye className="h-6 w-6 text-adv-teal" /> My Capability Card</h1>
            <p className="text-sm text-adv-gray">What this ANTON instance can do — shared with contacts on connection</p>
          </div>
        </div>
        <button onClick={handleRefresh} disabled={refreshing} className="flex items-center gap-2 rounded-lg border border-adv-teal px-4 py-2 text-sm text-adv-teal hover:bg-adv-teal/10 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh Card
        </button>
      </div>

      {loading ? <p className="text-sm text-adv-gray">Loading...</p> : !card ? <p className="text-sm text-adv-gray">No capability card generated yet.</p> : (
        <div className="space-y-6">
          {/* Identity Header */}
          <div className="rounded-xl border border-adv-card bg-adv-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-adv-off-white">{card.displayName}</h2>
                <p className="text-xs text-adv-gray font-mono mt-1">{card.instanceHash}</p>
              </div>
              <span className="text-xs text-adv-gray">v{card.formatVersion} · Generated {new Date(card.generatedAt).toLocaleDateString()}</span>
            </div>

            {card.professionalContext && (
              <div className="flex items-center gap-4 text-sm text-adv-gray">
                {card.professionalContext.roleTitle && <span className="flex items-center gap-1"><Briefcase className="h-3.5 w-3.5" /> {card.professionalContext.roleTitle}</span>}
                {card.professionalContext.organisation && <span>@ {card.professionalContext.organisation}</span>}
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-xl border border-adv-card bg-adv-card p-4 text-center">
              <div className="text-2xl font-bold text-adv-teal">{card.stats.totalSessions}</div>
              <div className="text-xs text-adv-gray">Sessions</div>
            </div>
            <div className="rounded-xl border border-adv-card bg-adv-card p-4 text-center">
              <div className="text-2xl font-bold text-adv-off-white">{card.stats.totalModulesUsed}</div>
              <div className="text-xs text-adv-gray">Modules Used</div>
            </div>
            <div className="rounded-xl border border-adv-card bg-adv-card p-4 text-center">
              <div className="text-2xl font-bold text-adv-gold">{card.stats.avgOverallQuality?.toFixed(1) ?? 'N/A'}</div>
              <div className="text-xs text-adv-gray">Avg Quality</div>
            </div>
            <div className="rounded-xl border border-adv-card bg-adv-card p-4 text-center">
              <div className="text-2xl font-bold text-adv-off-white">{card.stats.activeSince ? new Date(card.stats.activeSince).toLocaleDateString() : 'N/A'}</div>
              <div className="text-xs text-adv-gray">Active Since</div>
            </div>
          </div>

          {/* Modules */}
          <div className="rounded-xl border border-adv-card bg-adv-card p-5">
            <h3 className="text-lg font-semibold text-adv-off-white mb-4 flex items-center gap-2"><BarChart2 className="h-5 w-5 text-adv-teal" /> Module Capabilities</h3>
            {card.modules.length === 0 ? (
              <p className="text-sm text-adv-gray text-center py-4">No modules used yet. Use ANTON modules to build your capability profile.</p>
            ) : (
              <div className="space-y-2">
                {card.modules.map(m => (
                  <div key={m.moduleId} className="flex items-center justify-between rounded-lg bg-adv-dark-2 px-4 py-3">
                    <div>
                      <span className="text-sm font-medium text-adv-off-white">{m.moduleId}</span>
                      <span className="ml-2 text-xs text-adv-gray">{m.area}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-adv-gray flex items-center gap-1"><Clock className="h-3 w-3" /> {m.executionCount}x</span>
                      {m.avgQualityScore != null && (
                        <span className="text-adv-gold flex items-center gap-1"><Star className="h-3 w-3" /> {Number(m.avgQualityScore).toFixed(1)}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="rounded-xl border border-adv-blue/20 bg-adv-blue/5 p-4 text-sm text-adv-gray">
            <p className="font-medium text-adv-blue mb-1">About Capability Cards</p>
            <p>Your capability card is automatically generated from your ANTON usage history. When you connect with another ANTON instance, capability cards are exchanged so both sides know what the other can do. This enables intelligent task delegation — the system knows who has the right expertise for each task.</p>
          </div>
        </div>
      )}
    </div>
  );
}
