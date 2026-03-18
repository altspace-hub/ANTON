import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Play, Clock, CheckCircle2, AlertCircle,
  Loader2, Zap, RefreshCw, Target, BarChart2,
} from 'lucide-react';
import { fetchWithAuth } from '../../lib/api';
import MarketDisclaimer from '../../components/shared/MarketDisclaimer';

interface WorkflowRun {
  id: string;
  workflow_id: string;
  trigger_source: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
}

interface IndexItem {
  id: string;
  name: string;
  status: string;
}

const WORKFLOWS = [
  {
    id: 'daily-intelligence',
    name: 'Daily Intelligence Cycle',
    description: 'Fetches data, extracts atoms, runs decay, scans signals, computes indicators, and synthesises macro brief.',
    endpoint: '/api/markets/workflows/daily-intelligence',
    schedule: 'Weekdays 6 AM',
    icon: Zap,
    color: 'text-adv-teal',
  },
  {
    id: 'prediction-validation',
    name: 'Prediction Validation',
    description: 'Checks outcomes, calculates accuracy, runs calibration, investigates failures, and optimises signal weights.',
    endpoint: '/api/markets/workflows/prediction-validation',
    schedule: 'Fridays 8 PM',
    icon: Target,
    color: 'text-adv-gold',
  },
];

export default function MarketWorkflowsPage() {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<Record<string, unknown> | null>(null);
  const [rebalanceIndexId, setRebalanceIndexId] = useState('');
  const [indexes, setIndexes] = useState<IndexItem[]>([]);

  const fetchIndexes = useCallback(async () => {
    try {
      const res = await fetchWithAuth('/api/markets/indexes');
      if (res.ok) setIndexes(await res.json() as IndexItem[]);
    } catch (err) {
      console.error('[MarketWorkflows] Indexes error:', err);
    }
  }, []);

  useEffect(() => { fetchIndexes(); }, [fetchIndexes]);

  const fetchRuns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/api/markets/workflows/runs?limit=30');
      if (res.ok) {
        const data = await res.json() as { runs: WorkflowRun[] };
        setRuns(data.runs || []);
      }
    } catch (err) {
      console.error('[MarketWorkflows] Error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRuns(); }, [fetchRuns]);

  const handleTrigger = async (wf: typeof WORKFLOWS[number]) => {
    setRunning(wf.id);
    setLastResult(null);
    try {
      const res = await fetchWithAuth(wf.endpoint, { method: 'POST' });
      if (res.ok) {
        const result = await res.json();
        setLastResult(result as Record<string, unknown>);
      }
      fetchRuns();
    } catch (err) {
      console.error('[MarketWorkflows] Trigger error:', err);
    } finally {
      setRunning(null);
    }
  };

  const handleTriggerRebalance = async () => {
    if (!rebalanceIndexId) return;
    setRunning('index-rebalance');
    setLastResult(null);
    try {
      const res = await fetchWithAuth(`/api/markets/workflows/rebalance/${rebalanceIndexId}`, { method: 'POST' });
      if (res.ok) {
        const result = await res.json();
        setLastResult(result as Record<string, unknown>);
      }
      fetchRuns();
    } catch (err) {
      console.error('[MarketWorkflows] Rebalance error:', err);
    } finally {
      setRunning(null);
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
              <Zap className="h-6 w-6 text-adv-teal" />
              Market Workflows
            </h1>
            <p className="mt-0.5 text-sm text-adv-gray">Automated intelligence cycles, rebalance, and prediction validation</p>
          </div>
        </div>
        <button onClick={fetchRuns} disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-adv-card bg-adv-card px-3 py-2 text-sm text-adv-gray hover:text-adv-teal transition-colors">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <MarketDisclaimer compact />

      {/* Workflow Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {WORKFLOWS.map((wf) => (
          <div key={wf.id} className="rounded-xl border border-adv-card bg-adv-card p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <wf.icon className={`h-5 w-5 ${wf.color}`} />
                <h2 className="text-lg font-semibold text-adv-off-white">{wf.name}</h2>
              </div>
              <span className="text-xs text-adv-gray flex items-center gap-1">
                <Clock className="h-3 w-3" /> {wf.schedule}
              </span>
            </div>
            <p className="text-sm text-adv-gray mb-4">{wf.description}</p>
            <button
              onClick={() => handleTrigger(wf)}
              disabled={running === wf.id}
              className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50"
            >
              {running === wf.id ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Running...</>
              ) : (
                <><Play className="h-4 w-4" /> Run Now</>
              )}
            </button>
          </div>
        ))}

        {/* Index Rebalance Card */}
        <div className="rounded-xl border border-adv-card bg-adv-card p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <BarChart2 className="h-5 w-5 text-adv-blue" />
              <h2 className="text-lg font-semibold text-adv-off-white">Index Rebalance</h2>
            </div>
            <span className="text-xs text-adv-gray flex items-center gap-1">
              <Clock className="h-3 w-3" /> Monthly
            </span>
          </div>
          <p className="text-sm text-adv-gray mb-4">AI-driven portfolio rebalance: analyses atoms, generates trade proposals, and applies approved changes.</p>
          <div className="mb-3">
            <label className="block text-xs text-adv-gray mb-1">Select Index</label>
            <select
              value={rebalanceIndexId}
              onChange={(e) => setRebalanceIndexId(e.target.value)}
              className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white focus:outline-none focus:border-adv-teal"
            >
              <option value="">Choose an index...</option>
              {indexes.map((idx) => (
                <option key={idx.id} value={idx.id}>{idx.name} ({idx.status})</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleTriggerRebalance}
            disabled={running === 'index-rebalance' || !rebalanceIndexId}
            className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50"
          >
            {running === 'index-rebalance' ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Running...</>
            ) : (
              <><Play className="h-4 w-4" /> Run Now</>
            )}
          </button>
        </div>
      </div>

      {/* Last Result */}
      {lastResult && (
        <div className="rounded-xl border border-adv-teal/30 bg-adv-card p-5">
          <h2 className="text-lg font-semibold text-adv-off-white mb-3">Last Run Result</h2>
          <div className="flex items-center gap-4 mb-3">
            <span className={`text-sm font-medium ${lastResult.status === 'completed' ? 'text-adv-green' : 'text-adv-red'}`}>
              {String(lastResult.status).toUpperCase()}
            </span>
            <span className="text-sm text-adv-gray">{String(lastResult.stepsCompleted || 0)} steps completed</span>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {(lastResult.stepResults as Array<{ step: string; status: string; error?: string }> || []).map((sr, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                {sr.status === 'success' ? (
                  <CheckCircle2 className="h-4 w-4 text-adv-green flex-shrink-0" />
                ) : sr.status === 'error' ? (
                  <AlertCircle className="h-4 w-4 text-adv-red flex-shrink-0" />
                ) : (
                  <Clock className="h-4 w-4 text-adv-gray flex-shrink-0" />
                )}
                <span className="text-adv-off-white">{sr.step}</span>
                {sr.error && <span className="text-xs text-adv-red ml-auto truncate max-w-xs">{sr.error}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Runs */}
      <div className="rounded-xl border border-adv-card bg-adv-card p-5">
        <h2 className="text-lg font-semibold text-adv-off-white mb-4">Recent Workflow Runs</h2>
        {loading && runs.length === 0 ? (
          <p className="text-sm text-adv-gray">Loading...</p>
        ) : runs.length === 0 ? (
          <p className="text-sm text-adv-gray text-center py-6">No workflow runs yet. Trigger a workflow above or wait for the scheduled cron.</p>
        ) : (
          <div className="space-y-2">
            {runs.map((run) => (
              <div key={run.id} className="flex items-center justify-between rounded-lg border border-adv-dark bg-adv-dark-2 px-4 py-2">
                <div className="flex items-center gap-3">
                  {run.status === 'completed' ? (
                    <CheckCircle2 className="h-4 w-4 text-adv-green" />
                  ) : run.status === 'failed' ? (
                    <AlertCircle className="h-4 w-4 text-adv-red" />
                  ) : (
                    <Loader2 className="h-4 w-4 text-adv-gold animate-spin" />
                  )}
                  <span className="text-sm text-adv-off-white">{run.workflow_id.replace('wf_markets_', '').replace(/_/g, ' ')}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-adv-gray">{new Date(run.started_at).toLocaleString()}</span>
                  <span className={`text-xs font-medium ${
                    run.status === 'completed' ? 'text-adv-green' : run.status === 'failed' ? 'text-adv-red' : 'text-adv-gold'
                  }`}>{run.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
