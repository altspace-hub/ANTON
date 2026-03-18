import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Plus, CheckCircle2, Clock, AlertTriangle, Package, Loader2, Check } from 'lucide-react';
import { fetchWithAuth, exportMarketInvestigationAnton } from '../../lib/api';
import MarketDisclaimer from '../../components/shared/MarketDisclaimer';

interface Investigation {
  id: string; trigger_type: string; title: string; question: string;
  status: string; assigned_consul: string | null; root_cause: string | null;
  created_at: string; completed_at: string | null;
}

interface InvStats {
  open: number; completed: number;
  byTrigger: Array<{ trigger_type: string; count: number }>;
  byRootCause: Array<{ root_cause: string; count: number }>;
}

const TRIGGER_TYPES = [
  'prediction_wrong', 'unexplained_win', 'assumption_breach', 'pattern_anomaly',
  'blind_spot', 'regime_shift', 'narrative_shift', 'consul_disagreement',
];

export default function MarketInvestigationPage() {
  const navigate = useNavigate();
  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [stats, setStats] = useState<InvStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newQuestion, setNewQuestion] = useState('');
  const [newTrigger, setNewTrigger] = useState('prediction_wrong');
  const [exportStates, setExportStates] = useState<Record<string, 'idle' | 'loading' | 'done'>>({});

  const handleExportInvestigation = async (invId: string) => {
    if ((exportStates[invId] ?? 'idle') !== 'idle') return;
    setExportStates((prev) => ({ ...prev, [invId]: 'loading' }));
    try {
      const blob = await exportMarketInvestigationAnton(invId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `market-investigation-${invId}.anton`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportStates((prev) => ({ ...prev, [invId]: 'done' }));
      setTimeout(() => setExportStates((prev) => ({ ...prev, [invId]: 'idle' })), 2500);
    } catch (err) {
      console.error('[Export] Error:', err);
      setExportStates((prev) => ({ ...prev, [invId]: 'idle' }));
    }
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      const [invRes, statsRes] = await Promise.all([
        fetchWithAuth(`/api/markets/investigations?${params}`),
        fetchWithAuth('/api/markets/investigations/stats'),
      ]);
      if (invRes.ok) setInvestigations(await invRes.json() as Investigation[]);
      if (statsRes.ok) setStats(await statsRes.json() as InvStats);
    } catch (err) { console.error('[MarketInvestigation] Error:', err); }
    finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async () => {
    if (!newTitle.trim() || !newQuestion.trim()) return;
    try {
      await fetchWithAuth('/api/markets/investigations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triggerType: newTrigger, title: newTitle, question: newQuestion }),
      });
      setShowCreate(false); setNewTitle(''); setNewQuestion('');
      fetchData();
    } catch (err) { console.error('[MarketInvestigation] Create error:', err); }
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
              <Search className="h-6 w-6 text-adv-blue" /> Investigations
            </h1>
            <p className="text-sm text-adv-gray">Active research — why predictions failed or unexpectedly succeeded</p>
          </div>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark">
          <Plus className="h-4 w-4" /> New Investigation
        </button>
      </div>

      <MarketDisclaimer compact />

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-xl border border-adv-card bg-adv-card p-4">
            <div className="text-2xl font-bold text-adv-gold">{stats.open}</div>
            <div className="text-xs text-adv-gray">Open</div>
          </div>
          <div className="rounded-xl border border-adv-card bg-adv-card p-4">
            <div className="text-2xl font-bold text-adv-green">{stats.completed}</div>
            <div className="text-xs text-adv-gray">Completed</div>
          </div>
          <div className="rounded-xl border border-adv-card bg-adv-card p-4">
            <div className="text-2xl font-bold text-adv-off-white">{stats.byTrigger.length}</div>
            <div className="text-xs text-adv-gray">Trigger Types</div>
          </div>
          <div className="rounded-xl border border-adv-card bg-adv-card p-4">
            <div className="text-2xl font-bold text-adv-off-white">{stats.byRootCause.length}</div>
            <div className="text-xs text-adv-gray">Root Causes</div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        {['', 'open', 'in_progress', 'completed'].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`rounded-lg px-3 py-1.5 text-xs ${statusFilter === s ? 'bg-adv-teal text-adv-dark' : 'bg-adv-card text-adv-gray hover:text-adv-off-white'}`}>
            {s || 'All'}
          </button>
        ))}
      </div>

      {showCreate && (
        <div className="rounded-xl border border-adv-teal/30 bg-adv-card p-5 space-y-4">
          <h2 className="text-lg font-semibold text-adv-off-white">New Investigation</h2>
          <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Investigation title"
            className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal" />
          <textarea value={newQuestion} onChange={(e) => setNewQuestion(e.target.value)} placeholder="Key question to investigate..."
            rows={3} className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal" />
          <select value={newTrigger} onChange={(e) => setNewTrigger(e.target.value)} className="rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white">
            {TRIGGER_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
          </select>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={!newTitle.trim() || !newQuestion.trim()} className="rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark disabled:opacity-50">Create</button>
            <button onClick={() => setShowCreate(false)} className="rounded-lg border border-adv-dark px-4 py-2 text-sm text-adv-gray">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-adv-gray">Loading...</p>
      ) : investigations.length === 0 ? (
        <div className="text-center py-16">
          <Search className="h-12 w-12 text-adv-gray mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-adv-off-white">No investigations yet</h2>
          <p className="text-sm text-adv-gray">Investigations are triggered when predictions fail or succeed unexpectedly</p>
        </div>
      ) : (
        <div className="space-y-3">
          {investigations.map((inv) => (
            <div key={inv.id} className="rounded-xl border border-adv-card bg-adv-card p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {inv.status === 'completed' ? <CheckCircle2 className="h-3.5 w-3.5 text-adv-green" /> :
                     inv.status === 'in_progress' ? <Clock className="h-3.5 w-3.5 text-adv-gold" /> :
                     <AlertTriangle className="h-3.5 w-3.5 text-adv-blue" />}
                    <span className="text-xs text-adv-gray capitalize">{inv.status}</span>
                    <span className="text-xs text-adv-teal capitalize">{inv.trigger_type.replace(/_/g, ' ')}</span>
                    {inv.root_cause && <span className="text-xs text-adv-gold capitalize">Root: {inv.root_cause.replace(/_/g, ' ')}</span>}
                  </div>
                  <h3 className="text-sm font-semibold text-adv-off-white">{inv.title}</h3>
                  <p className="text-xs text-adv-gray mt-1">{inv.question}</p>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => handleExportInvestigation(inv.id)}
                    disabled={(exportStates[inv.id] ?? 'idle') === 'loading'}
                    className="flex items-center gap-1.5 rounded-md border border-adv-teal/30 bg-adv-dark px-3 py-1.5 text-xs text-adv-teal hover:border-adv-teal hover:bg-adv-card transition-colors disabled:opacity-50"
                    title="Export as .anton bundle"
                  >
                    {(exportStates[inv.id] ?? 'idle') === 'loading' ? (
                      <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Exporting...</>
                    ) : (exportStates[inv.id] ?? 'idle') === 'done' ? (
                      <><Check className="h-3.5 w-3.5" /> Downloaded</>
                    ) : (
                      <><Package className="h-3.5 w-3.5" /> Export .anton</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
