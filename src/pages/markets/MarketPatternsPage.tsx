import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Activity, Loader2, ChevronDown, ChevronUp,
  CheckCircle2, XCircle, AlertTriangle, Zap,
} from 'lucide-react';
import { fetchWithAuth } from '../../lib/api';
import MarketDisclaimer from '../../components/shared/MarketDisclaimer';
import { ConfidenceMeter } from '../../components/shared/markets';

interface Pattern {
  id: string;
  pattern_type: string;
  description: string;
  severity: string;
  confidence: number;
  affected_symbols: string;
  status: string;
  detected_at: string;
}

interface Regime {
  id: string;
  regime_type: string;
  confidence: number;
  started_at: string;
  evidence: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  low: 'text-adv-gray',
  medium: 'text-adv-gold',
  high: 'text-orange-400',
  critical: 'text-adv-red',
};

const SEVERITY_BG: Record<string, string> = {
  low: 'bg-adv-gray/10 border-adv-gray/30',
  medium: 'bg-adv-gold/10 border-adv-gold/30',
  high: 'bg-orange-400/10 border-orange-400/30',
  critical: 'bg-adv-red/10 border-adv-red/30',
};

export default function MarketPatternsPage() {
  const navigate = useNavigate();
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [regime, setRegime] = useState<Regime | null>(null);
  const [loading, setLoading] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [showRegimeForm, setShowRegimeForm] = useState(false);
  const [regimeType, setRegimeType] = useState('bull');
  const [regimeConfidence, setRegimeConfidence] = useState(0.5);
  const [regimeEvidence, setRegimeEvidence] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (typeFilter) params.set('type', typeFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (severityFilter) params.set('severity', severityFilter);
      const [patRes, regRes] = await Promise.all([
        fetchWithAuth(`/api/markets/patterns?${params}`),
        fetchWithAuth('/api/markets/regime'),
      ]);
      if (patRes.ok) {
        const patRaw = await patRes.json() as Pattern[];
        setPatterns(patRaw.map(p => ({ ...p, confidence: Number(p.confidence) || 0 })));
      }
      if (regRes.ok) {
        const data = await regRes.json() as Regime | null;
        setRegime(data ? { ...data, confidence: Number(data.confidence) || 0 } : null);
      }
    } catch (err) {
      console.error('[MarketPatterns] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [typeFilter, statusFilter, severityFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDetect = async () => {
    setDetecting(true);
    try {
      await fetchWithAuth('/api/markets/patterns/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      fetchData();
    } catch (err) {
      console.error('[MarketPatterns] Detect error:', err);
    } finally {
      setDetecting(false);
    }
  };

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      await fetchWithAuth(`/api/markets/patterns/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      fetchData();
    } catch (err) {
      console.error('[MarketPatterns] Status update error:', err);
    }
  };

  const handleRecordRegime = async () => {
    if (!regimeEvidence.trim()) return;
    try {
      await fetchWithAuth('/api/markets/regime', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          regimeType,
          confidence: regimeConfidence,
          evidence: regimeEvidence,
        }),
      });
      setShowRegimeForm(false);
      setRegimeEvidence('');
      fetchData();
    } catch (err) {
      console.error('[MarketPatterns] Regime error:', err);
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
              <Activity className="h-6 w-6 text-adv-gold" />
              Patterns &amp; Regime
            </h1>
            <p className="mt-0.5 text-sm text-adv-gray">Detect market patterns and track regime changes</p>
          </div>
        </div>
        <button onClick={handleDetect} disabled={detecting} className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50">
          {detecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
          Run Detectors
        </button>
      </div>

      <MarketDisclaimer compact />

      {/* Current Regime */}
      <div className="rounded-xl border border-adv-card bg-adv-card p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-adv-off-white">Current Regime</h2>
          <button
            onClick={() => setShowRegimeForm(!showRegimeForm)}
            className="text-xs text-adv-teal hover:text-adv-teal-dark transition-colors"
          >
            {showRegimeForm ? <ChevronUp className="h-4 w-4 inline" /> : <ChevronDown className="h-4 w-4 inline" />}
            {' '}Record Change
          </button>
        </div>
        {regime ? (
          <div className="rounded-lg border border-adv-dark bg-adv-dark-2 p-3">
            <div className="flex items-center gap-3">
              <span className="text-lg font-bold text-adv-off-white capitalize">{regime.regime_type}</span>
              <span className="w-20"><ConfidenceMeter value={regime.confidence} size="sm" /></span>
              <span className="text-xs text-adv-gray">Since {new Date(regime.started_at).toLocaleDateString()}</span>
            </div>
            {regime.evidence && (
              <p className="mt-2 text-xs text-adv-gray">{regime.evidence}</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-adv-gray">No regime detected</p>
        )}

        {/* Regime Form */}
        {showRegimeForm && (
          <div className="mt-4 space-y-3 rounded-lg border border-adv-teal/30 bg-adv-dark-2 p-4">
            <h3 className="text-sm font-medium text-adv-off-white">Record Regime Change</h3>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-xs text-adv-gray mb-1">Regime Type</label>
                <select value={regimeType} onChange={(e) => setRegimeType(e.target.value)} className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white focus:outline-none focus:border-adv-teal">
                  <option value="bull">Bull</option>
                  <option value="bear">Bear</option>
                  <option value="sideways">Sideways</option>
                  <option value="volatile">Volatile</option>
                  <option value="crisis">Crisis</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs text-adv-gray mb-1">Confidence: {Math.round(regimeConfidence * 100)}%</label>
                <input type="range" min={0} max={1} step={0.05} value={regimeConfidence} onChange={(e) => setRegimeConfidence(parseFloat(e.target.value))}
                  className="w-full accent-adv-teal" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-adv-gray mb-1">Evidence</label>
              <textarea value={regimeEvidence} onChange={(e) => setRegimeEvidence(e.target.value)} placeholder="Describe the evidence for this regime change..."
                rows={3} className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal" />
            </div>
            <div className="flex gap-2">
              <button onClick={handleRecordRegime} disabled={!regimeEvidence.trim()} className="rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50">Record</button>
              <button onClick={() => setShowRegimeForm(false)} className="rounded-lg border border-adv-dark px-4 py-2 text-sm text-adv-gray hover:text-adv-off-white">Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-adv-gray">Type:</span>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-1.5 text-xs text-adv-off-white focus:outline-none focus:border-adv-teal">
            <option value="">All</option>
            <option value="divergence">Divergence</option>
            <option value="correlation_break">Correlation Break</option>
            <option value="volume_anomaly">Volume Anomaly</option>
            <option value="sentiment_shift">Sentiment Shift</option>
            <option value="momentum_change">Momentum Change</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-adv-gray">Status:</span>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-1.5 text-xs text-adv-off-white focus:outline-none focus:border-adv-teal">
            <option value="">All</option>
            <option value="detected">Detected</option>
            <option value="confirmed">Confirmed</option>
            <option value="resolved">Resolved</option>
            <option value="false_positive">False Positive</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-adv-gray">Severity:</span>
          <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)} className="rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-1.5 text-xs text-adv-off-white focus:outline-none focus:border-adv-teal">
            <option value="">All</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
      </div>

      {/* Pattern List */}
      {loading ? (
        <p className="text-sm text-adv-gray">Loading patterns...</p>
      ) : patterns.length === 0 ? (
        <div className="text-center py-16">
          <Activity className="h-12 w-12 text-adv-gray mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-adv-off-white mb-1">No patterns detected</h2>
          <p className="text-sm text-adv-gray">Run the detector to scan for market patterns</p>
        </div>
      ) : (
        <div className="space-y-3">
          {patterns.map((pattern) => (
            <div key={pattern.id} className="rounded-xl border border-adv-card bg-adv-card p-4 hover:border-adv-teal/30 transition-colors">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${SEVERITY_BG[pattern.severity] || ''} ${SEVERITY_COLORS[pattern.severity] || 'text-adv-gray'}`}>
                      {pattern.severity}
                    </span>
                    <span className="text-xs text-adv-gray capitalize">{pattern.pattern_type.replace(/_/g, ' ')}</span>
                    <span className="text-xs text-adv-gray capitalize">{pattern.status.replace(/_/g, ' ')}</span>
                    <span className="w-16"><ConfidenceMeter value={pattern.confidence} size="sm" /></span>
                  </div>
                  <p className="text-sm text-adv-off-white">{pattern.description}</p>
                  {pattern.affected_symbols && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {pattern.affected_symbols.split(',').map((sym) => (
                        <span key={sym} className="rounded bg-adv-dark-2 px-1.5 py-0.5 text-xs text-adv-blue font-medium">
                          {sym.trim()}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="mt-1 text-xs text-adv-gray">Detected: {new Date(pattern.detected_at).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  {pattern.status !== 'resolved' && (
                    <button onClick={() => handleUpdateStatus(pattern.id, 'resolved')} className="flex items-center gap-1 rounded-md border border-adv-dark bg-adv-dark-2 px-3 py-1.5 text-xs text-adv-green hover:border-adv-green transition-colors">
                      <CheckCircle2 className="h-3 w-3" /> Resolved
                    </button>
                  )}
                  {pattern.status !== 'false_positive' && (
                    <button onClick={() => handleUpdateStatus(pattern.id, 'false_positive')} className="flex items-center gap-1 rounded-md border border-adv-dark bg-adv-dark-2 px-3 py-1.5 text-xs text-adv-red hover:border-adv-red transition-colors">
                      <XCircle className="h-3 w-3" /> False Positive
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
