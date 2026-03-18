import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Target, Plus, CheckCircle2, XCircle, Clock,
  BarChart2, TrendingUp, TrendingDown, Minus,
} from 'lucide-react';
import { fetchWithAuth } from '../../lib/api';
import MarketDisclaimer from '../../components/shared/MarketDisclaimer';
import { ConfidenceMeter } from '../../components/shared/markets';

interface Prediction {
  id: string;
  thesis_id: string | null;
  title: string;
  description: string;
  prediction_type: string;
  target_symbol: string | null;
  predicted_outcome: string;
  predicted_direction: string | null;
  confidence: number;
  time_horizon_days: number | null;
  deadline: string | null;
  status: string;
  was_correct: number | null;
  brier_score: number | null;
  created_at: string;
}

interface TrackRecordData {
  trackRecord: { totalValidated: number; totalCorrect: number; accuracy: number; averageBrierScore: number | null };
  calibration: Array<{ bucket: string; total: number; accuracy: number; avg_confidence: number; calibration_error: number }>;
  byHorizon: Array<{ horizon: string; total: number; correct: number }>;
  bySymbol: Array<{ symbol: string; total: number; correct: number; accuracy: number }>;
}

const DIRECTION_ICONS: Record<string, React.ReactNode> = {
  up: <TrendingUp className="h-3.5 w-3.5 text-adv-green" />,
  down: <TrendingDown className="h-3.5 w-3.5 text-adv-red" />,
  flat: <Minus className="h-3.5 w-3.5 text-adv-gray" />,
};

export default function MarketPredictionsPage() {
  const navigate = useNavigate();
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [trackRecord, setTrackRecord] = useState<TrackRecordData | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newOutcome, setNewOutcome] = useState('');
  const [newDirection, setNewDirection] = useState('up');
  const [newSymbol, setNewSymbol] = useState('');
  const [newConfidence, setNewConfidence] = useState(0.5);
  const [newDays, setNewDays] = useState(30);
  const [validatingId, setValidatingId] = useState<string | null>(null);
  const [valOutcome, setValOutcome] = useState('');
  const [valCorrect, setValCorrect] = useState<boolean | null>(null);
  const [valExplanation, setValExplanation] = useState('');
  const [valLessons, setValLessons] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      const [predRes, trRes] = await Promise.all([
        fetchWithAuth(`/api/markets/predictions?${params}`),
        fetchWithAuth('/api/markets/predictions/track-record'),
      ]);
      if (predRes.ok) {
        const predRaw = await predRes.json() as Prediction[];
        setPredictions(predRaw.map(p => ({
          ...p,
          confidence: Number(p.confidence) || 0,
          brier_score: p.brier_score != null ? Number(p.brier_score) : null,
          time_horizon_days: p.time_horizon_days != null ? Number(p.time_horizon_days) : null,
        })));
      }
      if (trRes.ok) {
        const trRaw = await trRes.json() as TrackRecordData;
        setTrackRecord({
          ...trRaw,
          trackRecord: {
            ...trRaw.trackRecord,
            accuracy: Number(trRaw.trackRecord.accuracy) || 0,
            averageBrierScore: trRaw.trackRecord.averageBrierScore != null ? Number(trRaw.trackRecord.averageBrierScore) : null,
            totalValidated: Number(trRaw.trackRecord.totalValidated) || 0,
            totalCorrect: Number(trRaw.trackRecord.totalCorrect) || 0,
          },
          calibration: trRaw.calibration.map(b => ({
            ...b,
            accuracy: Number(b.accuracy) || 0,
            avg_confidence: Number(b.avg_confidence) || 0,
          })),
          byHorizon: trRaw.byHorizon,
          bySymbol: trRaw.bySymbol,
        });
      }
    } catch (err) {
      console.error('[MarketPredictions] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async () => {
    if (!newTitle.trim() || !newOutcome.trim()) return;
    try {
      await fetchWithAuth('/api/markets/predictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle, description: newOutcome,
          predictedOutcome: newOutcome, predictedDirection: newDirection,
          targetSymbol: newSymbol || undefined, confidence: newConfidence,
          timeHorizonDays: newDays,
        }),
      });
      setShowCreate(false);
      setNewTitle(''); setNewOutcome(''); setNewSymbol('');
      fetchData();
    } catch (err) {
      console.error('[MarketPredictions] Create error:', err);
    }
  };

  const handleValidate = async (id: string) => {
    if (valCorrect === null || !valOutcome.trim()) return;
    try {
      await fetchWithAuth(`/api/markets/predictions/${id}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actualOutcome: valOutcome,
          wasCorrect: valCorrect,
          explanation: valExplanation,
          lessonsLearned: valLessons,
        }),
      });
      setValidatingId(null);
      setValOutcome(''); setValCorrect(null); setValExplanation(''); setValLessons('');
      fetchData();
    } catch (err) {
      console.error('[MarketPredictions] Validate error:', err);
    }
  };

  const handleUpdateSignalWeights = async () => {
    try {
      await fetchWithAuth('/api/markets/predictions/update-signal-weights', { method: 'POST' });
      fetchData();
    } catch (err) {
      console.error('[MarketPredictions] Signal weights error:', err);
    }
  };

  const tr = trackRecord?.trackRecord;

  return (
    <div className="min-h-screen p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/markets')} className="rounded-lg border border-adv-card bg-adv-card p-2 text-adv-gray hover:text-adv-teal transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-adv-off-white flex items-center gap-3">
              <Target className="h-6 w-6 text-adv-teal" />
              Predictions & Track Record
            </h1>
            <p className="mt-0.5 text-sm text-adv-gray">Track, validate, and learn from market predictions</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleUpdateSignalWeights} className="flex items-center gap-2 rounded-lg border border-adv-card bg-adv-card px-3 py-2 text-sm text-adv-gray hover:text-adv-teal transition-colors">
            <BarChart2 className="h-4 w-4" /> Update Signal Weights
          </button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors">
            <Plus className="h-4 w-4" /> New Prediction
          </button>
        </div>
      </div>

      <MarketDisclaimer compact />

      {/* Track Record Summary */}
      {tr && tr.totalValidated > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-xl border border-adv-card bg-adv-card p-4">
            <div className="text-2xl font-bold text-adv-off-white">{tr.totalValidated}</div>
            <div className="text-xs text-adv-gray">Validated</div>
          </div>
          <div className="rounded-xl border border-adv-card bg-adv-card p-4">
            <div className={`text-2xl font-bold ${tr.accuracy >= 0.5 ? 'text-adv-green' : 'text-adv-red'}`}>
              {Math.round(tr.accuracy * 100)}%
            </div>
            <div className="text-xs text-adv-gray">Accuracy</div>
          </div>
          <div className="rounded-xl border border-adv-card bg-adv-card p-4">
            <div className="text-2xl font-bold text-adv-off-white">{tr.totalCorrect}</div>
            <div className="text-xs text-adv-gray">Correct</div>
          </div>
          <div className="rounded-xl border border-adv-card bg-adv-card p-4">
            <div className="text-2xl font-bold text-adv-blue">
              {tr.averageBrierScore !== null ? tr.averageBrierScore.toFixed(3) : 'N/A'}
            </div>
            <div className="text-xs text-adv-gray">Avg Brier Score</div>
          </div>
        </div>
      )}

      {/* Calibration Chart */}
      {trackRecord && trackRecord.calibration.length > 0 && (
        <div className="rounded-xl border border-adv-card bg-adv-card p-5">
          <h2 className="text-lg font-semibold text-adv-off-white mb-4 flex items-center gap-2">
            <BarChart2 className="h-5 w-5 text-adv-teal" /> Calibration Chart
          </h2>
          <div className="space-y-3">
            {trackRecord.calibration.map((bucket, i) => {
              const accuracyPct = Math.round(bucket.accuracy * 100);
              const expectedPct = Math.round(bucket.avg_confidence * 100);
              const isOverconfident = accuracyPct < expectedPct;
              return (
                <div key={i} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-adv-off-white font-medium">{bucket.bucket}</span>
                    <span className="text-adv-gray">Accuracy: {accuracyPct}% | Expected: {expectedPct}%</span>
                  </div>
                  <div className="relative h-5 bg-adv-dark-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${isOverconfident ? 'bg-adv-red/70' : 'bg-adv-green/70'}`}
                      style={{ width: `${Math.min(accuracyPct, 100)}%` }}
                    />
                    <div
                      className="absolute top-0 h-full w-0.5 bg-adv-off-white/60"
                      style={{ left: `${Math.min(expectedPct, 100)}%` }}
                      title={`Expected: ${expectedPct}%`}
                    />
                  </div>
                </div>
              );
            })}
            <div className="flex items-center gap-4 mt-2 text-xs text-adv-gray">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-adv-red/70" /> Overconfident</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-adv-green/70" /> Underconfident / Well-calibrated</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-adv-off-white/60" /> Expected confidence</span>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2">
        {['', 'active', 'validated', 'invalidated', 'expired'].map((s) => (
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
          <h2 className="text-lg font-semibold text-adv-off-white">New Prediction</h2>
          <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Prediction title"
            className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal" />
          <textarea value={newOutcome} onChange={(e) => setNewOutcome(e.target.value)} placeholder="Predicted outcome (specific and measurable)"
            rows={3} className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-adv-gray mb-1">Symbol</label>
              <input type="text" value={newSymbol} onChange={(e) => setNewSymbol(e.target.value)} placeholder="AAPL"
                className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white focus:outline-none focus:border-adv-teal" />
            </div>
            <div>
              <label className="block text-xs text-adv-gray mb-1">Direction</label>
              <select value={newDirection} onChange={(e) => setNewDirection(e.target.value)} className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white focus:outline-none focus:border-adv-teal">
                <option value="up">Up</option>
                <option value="down">Down</option>
                <option value="flat">Flat</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-adv-gray mb-1">Confidence</label>
              <input type="number" value={newConfidence} onChange={(e) => setNewConfidence(parseFloat(e.target.value))} min={0} max={1} step={0.05}
                className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white focus:outline-none focus:border-adv-teal" />
            </div>
            <div>
              <label className="block text-xs text-adv-gray mb-1">Days to outcome</label>
              <input type="number" value={newDays} onChange={(e) => setNewDays(parseInt(e.target.value, 10))} min={1}
                className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white focus:outline-none focus:border-adv-teal" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={!newTitle.trim() || !newOutcome.trim()} className="rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50">Create</button>
            <button onClick={() => setShowCreate(false)} className="rounded-lg border border-adv-dark px-4 py-2 text-sm text-adv-gray">Cancel</button>
          </div>
        </div>
      )}

      {/* Predictions List */}
      {loading ? (
        <p className="text-sm text-adv-gray">Loading predictions...</p>
      ) : predictions.length === 0 ? (
        <div className="text-center py-16">
          <Target className="h-12 w-12 text-adv-gray mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-adv-off-white mb-1">No predictions yet</h2>
          <p className="text-sm text-adv-gray">Make specific, measurable predictions to build your track record</p>
        </div>
      ) : (
        <div className="space-y-3">
          {predictions.map((pred) => (
            <div key={pred.id} className="rounded-xl border border-adv-card bg-adv-card p-4">
              <div className="flex items-center gap-2 mb-1">
                {pred.status === 'active' && <Clock className="h-3.5 w-3.5 text-adv-teal" />}
                {pred.was_correct === 1 && <CheckCircle2 className="h-3.5 w-3.5 text-adv-green" />}
                {pred.was_correct === 0 && <XCircle className="h-3.5 w-3.5 text-adv-red" />}
                <span className="text-xs text-adv-gray capitalize">{pred.status}</span>
                {pred.target_symbol && <span className="text-xs font-medium text-adv-blue">{pred.target_symbol}</span>}
                {pred.predicted_direction && DIRECTION_ICONS[pred.predicted_direction]}
                <span className="w-16"><ConfidenceMeter value={pred.confidence} size="sm" /></span>
                {pred.brier_score !== null && (
                  <span className="text-xs text-adv-gray">Brier: {pred.brier_score.toFixed(3)}</span>
                )}
              </div>
              <h3 className="text-sm font-semibold text-adv-off-white">{pred.title}</h3>
              <p className="mt-1 text-xs text-adv-gray line-clamp-2">{pred.predicted_outcome}</p>
              {pred.time_horizon_days && (
                <p className="mt-1 text-xs text-adv-gray">{pred.time_horizon_days} day horizon</p>
              )}
              {pred.status === 'active' && validatingId !== pred.id && (
                <button
                  onClick={() => { setValidatingId(pred.id); setValOutcome(''); setValCorrect(null); setValExplanation(''); setValLessons(''); }}
                  className="mt-2 flex items-center gap-1 rounded-lg border border-adv-teal/30 px-3 py-1 text-xs text-adv-teal hover:bg-adv-teal/10 transition-colors"
                >
                  <CheckCircle2 className="h-3 w-3" /> Validate
                </button>
              )}
              {validatingId === pred.id && (
                <div className="mt-3 rounded-lg border border-adv-teal/20 bg-adv-dark-2 p-4 space-y-3">
                  <h4 className="text-sm font-medium text-adv-off-white">Validate Prediction</h4>
                  <div>
                    <label className="block text-xs text-adv-gray mb-1">Actual Outcome</label>
                    <textarea value={valOutcome} onChange={(e) => setValOutcome(e.target.value)} placeholder="What actually happened?"
                      rows={2} className="w-full rounded-lg border border-adv-dark bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal" />
                  </div>
                  <div>
                    <label className="block text-xs text-adv-gray mb-1">Was this prediction correct?</label>
                    <div className="flex gap-2">
                      <button onClick={() => setValCorrect(true)}
                        className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs transition-colors ${valCorrect === true ? 'bg-adv-green text-white' : 'bg-adv-dark text-adv-gray hover:text-adv-off-white'}`}>
                        <CheckCircle2 className="h-3 w-3" /> Correct
                      </button>
                      <button onClick={() => setValCorrect(false)}
                        className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs transition-colors ${valCorrect === false ? 'bg-adv-red text-white' : 'bg-adv-dark text-adv-gray hover:text-adv-off-white'}`}>
                        <XCircle className="h-3 w-3" /> Incorrect
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-adv-gray mb-1">Explanation</label>
                    <textarea value={valExplanation} onChange={(e) => setValExplanation(e.target.value)} placeholder="Why was it correct/incorrect?"
                      rows={2} className="w-full rounded-lg border border-adv-dark bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal" />
                  </div>
                  <div>
                    <label className="block text-xs text-adv-gray mb-1">Lessons Learned</label>
                    <textarea value={valLessons} onChange={(e) => setValLessons(e.target.value)} placeholder="Key takeaways for future predictions"
                      rows={2} className="w-full rounded-lg border border-adv-dark bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleValidate(pred.id)} disabled={valCorrect === null || !valOutcome.trim()}
                      className="rounded-lg bg-adv-teal px-4 py-1.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50">Submit</button>
                    <button onClick={() => setValidatingId(null)}
                      className="rounded-lg border border-adv-dark px-4 py-1.5 text-sm text-adv-gray hover:text-adv-off-white">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
