import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Calculator, Play, Loader2, CheckCircle2,
  AlertCircle, Clock, Lightbulb, ChevronRight,
} from 'lucide-react';
import { fetchWithAuth } from '../../lib/api';
import MarketDisclaimer from '../../components/shared/MarketDisclaimer';
import { ConfidenceMeter } from '../../components/shared/markets';

interface RCIResult {
  reason: { templateId: string; params: Record<string, unknown> };
  compute: { result: unknown };
  interpret: { summary: string; confidence: number; caveats: string[] };
}

interface SuggestedTemplate {
  template_id: string;
  description: string;
  params: Record<string, unknown>;
}

interface LogEntry {
  id: string;
  template_id: string;
  status: string;
  created_at: string;
}

export default function MarketRCIPage() {
  const navigate = useNavigate();
  const [question, setQuestion] = useState('');
  const [context, setContext] = useState('');
  const [running, setRunning] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [result, setResult] = useState<RCIResult | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestedTemplate[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const res = await fetchWithAuth('/api/markets/computation/logs?limit=10');
      if (res.ok) setLogs(await res.json() as LogEntry[]);
    } catch (err) {
      console.error('[MarketRCI] Logs error:', err);
    } finally {
      setLogsLoading(false);
    }
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const handleSuggest = async () => {
    if (!question.trim()) return;
    setSuggesting(true);
    setSuggestions([]);
    try {
      const res = await fetchWithAuth('/api/markets/rci/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, context: context || undefined }),
      });
      if (res.ok) {
        const data = await res.json();
        setSuggestions((data as { templates: SuggestedTemplate[] }).templates || data as SuggestedTemplate[]);
      }
    } catch (err) {
      console.error('[MarketRCI] Suggest error:', err);
    } finally {
      setSuggesting(false);
    }
  };

  const handleRun = async () => {
    if (!question.trim()) return;
    setRunning(true);
    setResult(null);
    try {
      const res = await fetchWithAuth('/api/markets/rci', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, context: context || undefined }),
      });
      if (res.ok) {
        const rciRaw = await res.json() as RCIResult;
        setResult({
          ...rciRaw,
          interpret: {
            ...rciRaw.interpret,
            confidence: Number(rciRaw.interpret.confidence) || 0,
          },
        });
      }
      fetchLogs();
    } catch (err) {
      console.error('[MarketRCI] Run error:', err);
    } finally {
      setRunning(false);
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
              <Calculator className="h-6 w-6 text-purple-400" />
              RCI Pipeline
            </h1>
            <p className="mt-0.5 text-sm text-adv-gray">Reason-Compute-Interpret: structured quantitative analysis</p>
          </div>
        </div>
      </div>

      <MarketDisclaimer compact />

      {/* Input Section */}
      <div className="rounded-xl border border-adv-card bg-adv-card p-5 space-y-4">
        <h2 className="text-lg font-semibold text-adv-off-white">Ask a Question</h2>
        <div>
          <label className="block text-xs text-adv-gray mb-1">Question *</label>
          <textarea value={question} onChange={(e) => setQuestion(e.target.value)}
            placeholder="What quantitative question do you want to analyze? e.g., 'Is AAPL showing mean-reversion signals relative to its 200-day moving average?'"
            rows={3} className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal" />
        </div>
        <div>
          <label className="block text-xs text-adv-gray mb-1">Context (optional)</label>
          <textarea value={context} onChange={(e) => setContext(e.target.value)}
            placeholder="Additional context, constraints, or data points..."
            rows={2} className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal" />
        </div>
        <div className="flex gap-3">
          <button onClick={handleSuggest} disabled={!question.trim() || suggesting} className="flex items-center gap-2 rounded-lg border border-adv-card bg-adv-dark-2 px-4 py-2 text-sm text-adv-teal hover:border-adv-teal transition-colors disabled:opacity-50">
            {suggesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lightbulb className="h-4 w-4" />}
            Suggest Templates
          </button>
          <button onClick={handleRun} disabled={!question.trim() || running} className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50">
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Run Full Pipeline
          </button>
        </div>
      </div>

      {/* Suggested Templates */}
      {suggestions.length > 0 && (
        <div className="rounded-xl border border-adv-card bg-adv-card p-5 space-y-3">
          <h2 className="text-lg font-semibold text-adv-off-white">Suggested Templates</h2>
          <div className="space-y-2">
            {suggestions.map((s, idx) => (
              <div key={idx} className="rounded-lg border border-adv-dark bg-adv-dark-2 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <ChevronRight className="h-3.5 w-3.5 text-adv-teal" />
                  <span className="text-sm font-medium text-adv-off-white">{s.template_id}</span>
                </div>
                <p className="text-xs text-adv-gray mb-1">{s.description}</p>
                {Object.keys(s.params).length > 0 && (
                  <pre className="text-xs text-adv-gray bg-adv-dark rounded-md px-2 py-1 mt-1 overflow-auto">
                    {JSON.stringify(s.params, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* RCI Result */}
      {result && (
        <div className="space-y-4">
          {/* Phase 1: REASON */}
          <div className="rounded-xl border border-purple-400/30 bg-adv-card p-5">
            <h2 className="text-sm font-semibold text-purple-400 uppercase tracking-wide mb-3 flex items-center gap-2">
              <span className="flex items-center justify-center h-5 w-5 rounded-full bg-purple-400/20 text-xs font-bold">1</span>
              Reason
            </h2>
            <div className="rounded-lg border border-adv-dark bg-adv-dark-2 p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-adv-gray">Template:</span>
                <span className="text-sm font-medium text-adv-off-white">{result.reason.templateId}</span>
              </div>
              {Object.keys(result.reason.params).length > 0 && (
                <pre className="text-xs text-adv-gray bg-adv-dark rounded-md px-2 py-1 mt-2 overflow-auto">
                  {JSON.stringify(result.reason.params, null, 2)}
                </pre>
              )}
            </div>
          </div>

          {/* Phase 2: COMPUTE */}
          <div className="rounded-xl border border-adv-blue/30 bg-adv-card p-5">
            <h2 className="text-sm font-semibold text-adv-blue uppercase tracking-wide mb-3 flex items-center gap-2">
              <span className="flex items-center justify-center h-5 w-5 rounded-full bg-adv-blue/20 text-xs font-bold">2</span>
              Compute
            </h2>
            <pre className="text-xs text-adv-off-white bg-adv-dark-2 rounded-lg p-3 max-h-64 overflow-auto whitespace-pre-wrap">
              {typeof result.compute.result === 'string'
                ? result.compute.result
                : JSON.stringify(result.compute.result, null, 2)}
            </pre>
          </div>

          {/* Phase 3: INTERPRET */}
          <div className="rounded-xl border border-adv-teal/30 bg-adv-card p-5">
            <h2 className="text-sm font-semibold text-adv-teal uppercase tracking-wide mb-3 flex items-center gap-2">
              <span className="flex items-center justify-center h-5 w-5 rounded-full bg-adv-teal/20 text-xs font-bold">3</span>
              Interpret
            </h2>
            <div className="space-y-3">
              <div>
                <h3 className="text-xs text-adv-gray font-medium mb-1">Summary</h3>
                <p className="text-sm text-adv-off-white">{result.interpret.summary}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-adv-gray">Confidence:</span>
                <span className="w-32"><ConfidenceMeter value={result.interpret.confidence} size="md" /></span>
              </div>
              {result.interpret.caveats && result.interpret.caveats.length > 0 && (
                <div>
                  <h3 className="text-xs text-adv-gray font-medium mb-1">Caveats</h3>
                  <ul className="space-y-1">
                    {result.interpret.caveats.map((caveat, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-adv-gold">
                        <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                        {caveat}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Recent Runs */}
      <div className="rounded-xl border border-adv-card bg-adv-card p-5">
        <h2 className="text-lg font-semibold text-adv-off-white mb-4">Recent Runs</h2>
        {logsLoading ? (
          <p className="text-sm text-adv-gray">Loading logs...</p>
        ) : logs.length === 0 ? (
          <p className="text-sm text-adv-gray text-center py-4">No computation logs yet. Run the pipeline above.</p>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <div key={log.id} className="flex items-center justify-between rounded-lg border border-adv-dark bg-adv-dark-2 px-4 py-2">
                <div className="flex items-center gap-3">
                  {log.status === 'success' ? (
                    <CheckCircle2 className="h-4 w-4 text-adv-green" />
                  ) : log.status === 'error' ? (
                    <AlertCircle className="h-4 w-4 text-adv-red" />
                  ) : (
                    <Clock className="h-4 w-4 text-adv-gold" />
                  )}
                  <span className="text-sm text-adv-off-white">{log.template_id.replace(/_/g, ' ')}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`text-xs capitalize ${log.status === 'success' ? 'text-adv-green' : log.status === 'error' ? 'text-adv-red' : 'text-adv-gray'}`}>
                    {log.status}
                  </span>
                  <span className="text-xs text-adv-gray">{new Date(log.created_at).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
