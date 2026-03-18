import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Lightbulb, Plus, ChevronRight, Target,
  CheckCircle2, XCircle, AlertTriangle, Clock, Zap, Edit2, Trash2,
  Package, Loader2, Check,
} from 'lucide-react';
import { fetchWithAuth, exportMarketThesisAnton } from '../../lib/api';
import MarketDisclaimer from '../../components/shared/MarketDisclaimer';
import { ConfidenceMeter } from '../../components/shared/markets';

interface Thesis {
  id: string;
  title: string;
  description: string;
  thesis_type: string;
  status: string;
  confidence: number;
  time_horizon: string;
  success_criteria: string;
  key_assumptions: string;
  risk_factors: string;
  ai_score: number | null;
  created_at: string;
  updated_at: string;
}

const STATUS_CONFIG: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  draft: { icon: <Edit2 className="h-3.5 w-3.5" />, color: 'text-adv-gray', label: 'Draft' },
  active: { icon: <Target className="h-3.5 w-3.5" />, color: 'text-adv-teal', label: 'Active' },
  monitoring: { icon: <Clock className="h-3.5 w-3.5" />, color: 'text-adv-blue', label: 'Monitoring' },
  validated: { icon: <CheckCircle2 className="h-3.5 w-3.5" />, color: 'text-adv-green', label: 'Validated' },
  invalidated: { icon: <XCircle className="h-3.5 w-3.5" />, color: 'text-adv-red', label: 'Invalidated' },
  archived: { icon: <Clock className="h-3.5 w-3.5" />, color: 'text-adv-gray', label: 'Archived' },
};

export default function MarketThesesPage() {
  const navigate = useNavigate();
  const [theses, setTheses] = useState<Thesis[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newType, setNewType] = useState('investment');
  const [newHorizon, setNewHorizon] = useState('medium');
  const [exportStates, setExportStates] = useState<Record<string, 'idle' | 'loading' | 'done'>>({});

  const handleExportThesis = async (thesisId: string) => {
    if ((exportStates[thesisId] ?? 'idle') !== 'idle') return;
    setExportStates((prev) => ({ ...prev, [thesisId]: 'loading' }));
    try {
      const blob = await exportMarketThesisAnton(thesisId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `market-thesis-${thesisId}.anton`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportStates((prev) => ({ ...prev, [thesisId]: 'done' }));
      setTimeout(() => setExportStates((prev) => ({ ...prev, [thesisId]: 'idle' })), 2500);
    } catch (err) {
      console.error('[Export] Error:', err);
      setExportStates((prev) => ({ ...prev, [thesisId]: 'idle' }));
    }
  };

  const fetchTheses = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetchWithAuth(`/api/markets/theses?${params}`);
      if (!res.ok) throw new Error('Failed to load theses');
      const rawTheses = await res.json() as Thesis[];
      setTheses(rawTheses.map(t => ({
        ...t,
        confidence: Number(t.confidence) || 0,
        ai_score: t.ai_score != null ? Number(t.ai_score) : null,
      })));
    } catch (err) {
      console.error('[MarketTheses] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchTheses(); }, [fetchTheses]);

  const handleCreate = async () => {
    if (!newTitle.trim() || !newDescription.trim()) return;
    try {
      await fetchWithAuth('/api/markets/theses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle, description: newDescription,
          thesisType: newType, timeHorizon: newHorizon,
        }),
      });
      setShowCreate(false);
      setNewTitle(''); setNewDescription('');
      fetchTheses();
    } catch (err) {
      console.error('[MarketTheses] Create error:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this thesis?')) return;
    try {
      await fetchWithAuth(`/api/markets/theses/${id}`, { method: 'DELETE' });
      fetchTheses();
    } catch (err) {
      console.error('[MarketTheses] Delete error:', err);
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
              <Lightbulb className="h-6 w-6 text-adv-gold" />
              Investment Theses
            </h1>
            <p className="mt-0.5 text-sm text-adv-gray">Formulate, evidence, and track investment hypotheses</p>
          </div>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors">
          <Plus className="h-4 w-4" /> New Thesis
        </button>
      </div>

      <MarketDisclaimer compact />

      {/* Filters */}
      <div className="flex items-center gap-2">
        {['', 'draft', 'active', 'monitoring', 'validated', 'invalidated'].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${statusFilter === s ? 'bg-adv-teal text-adv-dark' : 'bg-adv-card text-adv-gray hover:text-adv-off-white'}`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="rounded-xl border border-adv-teal/30 bg-adv-card p-5 space-y-4">
          <h2 className="text-lg font-semibold text-adv-off-white">New Thesis</h2>
          <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Thesis title"
            className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal" />
          <textarea value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="Describe your thesis, including the rationale and expected outcome..."
            rows={4} className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal" />
          <div className="flex gap-4">
            <select value={newType} onChange={(e) => setNewType(e.target.value)} className="rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white focus:outline-none focus:border-adv-teal">
              <option value="investment">Investment</option>
              <option value="macro">Macro</option>
              <option value="sector">Sector</option>
              <option value="event">Event</option>
              <option value="contrarian">Contrarian</option>
            </select>
            <select value={newHorizon} onChange={(e) => setNewHorizon(e.target.value)} className="rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white focus:outline-none focus:border-adv-teal">
              <option value="short">Short (&lt; 1 month)</option>
              <option value="medium">Medium (1-6 months)</option>
              <option value="long">Long (6+ months)</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={!newTitle.trim() || !newDescription.trim()} className="rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50">Create</button>
            <button onClick={() => setShowCreate(false)} className="rounded-lg border border-adv-dark px-4 py-2 text-sm text-adv-gray hover:text-adv-off-white">Cancel</button>
          </div>
        </div>
      )}

      {/* Theses List */}
      {loading ? (
        <p className="text-sm text-adv-gray">Loading theses...</p>
      ) : theses.length === 0 ? (
        <div className="text-center py-16">
          <Lightbulb className="h-12 w-12 text-adv-gray mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-adv-off-white mb-1">No theses yet</h2>
          <p className="text-sm text-adv-gray">Create your first investment thesis to start building evidence</p>
        </div>
      ) : (
        <div className="space-y-3">
          {theses.map((thesis) => {
            const statusCfg = STATUS_CONFIG[thesis.status] ?? STATUS_CONFIG.draft;
            return (
              <div key={thesis.id} className="rounded-xl border border-adv-card bg-adv-card p-4 hover:border-adv-teal/30 transition-colors cursor-pointer" onClick={() => navigate(`/markets/theses/${thesis.id}`)}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`flex items-center gap-1 text-xs font-medium ${statusCfg.color}`}>
                        {statusCfg.icon} {statusCfg.label}
                      </span>
                      <span className="text-xs text-adv-gray capitalize">{thesis.thesis_type}</span>
                      <span className="text-xs text-adv-gray">{thesis.time_horizon}</span>
                      <span className="w-16"><ConfidenceMeter value={thesis.confidence} size="sm" /></span>
                      {thesis.ai_score !== null && (
                        <span className="flex items-center gap-1 text-xs text-purple-400">
                          <Zap className="h-3 w-3" /> AI: {Math.round(thesis.ai_score * 100)}
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-semibold text-adv-off-white">{thesis.title}</h3>
                    <p className="mt-1 text-xs text-adv-gray line-clamp-2">{thesis.description}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleExportThesis(thesis.id); }}
                      disabled={(exportStates[thesis.id] ?? 'idle') === 'loading'}
                      className="flex items-center gap-1.5 rounded-md border border-adv-teal/30 bg-adv-dark px-3 py-1.5 text-xs text-adv-teal hover:border-adv-teal hover:bg-adv-card transition-colors disabled:opacity-50"
                      title="Export as .anton bundle"
                    >
                      {(exportStates[thesis.id] ?? 'idle') === 'loading' ? (
                        <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Exporting...</>
                      ) : (exportStates[thesis.id] ?? 'idle') === 'done' ? (
                        <><Check className="h-3.5 w-3.5" /> Downloaded</>
                      ) : (
                        <><Package className="h-3.5 w-3.5" /> Export .anton</>
                      )}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(thesis.id); }} className="p-1.5 text-adv-gray hover:text-adv-red transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <ChevronRight className="h-4 w-4 text-adv-gray" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
