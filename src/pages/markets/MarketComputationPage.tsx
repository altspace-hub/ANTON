import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Calculator, Play, Clock, CheckCircle2, AlertCircle,
  Loader2, RefreshCw, ChevronDown, ChevronUp,
} from 'lucide-react';
import { fetchWithAuth } from '../../lib/api';
import MarketDisclaimer from '../../components/shared/MarketDisclaimer';

interface Template {
  name: string;
  description: string;
  inputSchema: string;
}

interface LogEntry {
  id: string;
  template_name: string;
  status: string;
  execution_time_ms: number | null;
  triggered_by: string;
  created_at: string;
}

export default function MarketComputationPage() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningTemplate, setRunningTemplate] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<Record<string, unknown> | null>(null);
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);
  const [inputJson, setInputJson] = useState('{}');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [tplRes, logRes] = await Promise.all([
        fetchWithAuth('/api/markets/compute/templates'),
        fetchWithAuth('/api/markets/compute/logs?limit=20'),
      ]);
      if (tplRes.ok) setTemplates(await tplRes.json() as Template[]);
      if (logRes.ok) setLogs(await logRes.json() as LogEntry[]);
    } catch (err) {
      console.error('[MarketComputation] Error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRun = async (templateName: string) => {
    setRunningTemplate(templateName);
    setRunResult(null);
    try {
      let params: Record<string, unknown> = {};
      try { params = JSON.parse(inputJson); } catch { /* use empty */ }

      const res = await fetchWithAuth('/api/markets/compute/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateName, params }),
      });
      if (res.ok) {
        const result = await res.json();
        setRunResult(result as Record<string, unknown>);
      }
      fetchData();
    } catch (err) {
      console.error('[MarketComputation] Run error:', err);
    } finally {
      setRunningTemplate(null);
    }
  };

  // Group templates by category
  const categories: Record<string, Template[]> = {};
  const categoryLabels: Record<string, string> = {
    basic: 'Basic Analytics',
    risk: 'Risk & Technical',
    advanced: 'Advanced Statistical',
    portfolio: 'Portfolio Construction',
  };

  for (const t of templates) {
    const idx = templates.indexOf(t);
    let cat = 'advanced';
    if (idx < 5) cat = 'basic';
    else if (idx < 13) cat = 'risk';
    else if (idx >= templates.length - 7) cat = 'portfolio';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(t);
  }

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
              Computation Templates
            </h1>
            <p className="mt-0.5 text-sm text-adv-gray">{templates.length} quantitative templates — pure Python, no external dependencies</p>
          </div>
        </div>
        <button onClick={fetchData} disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-adv-card bg-adv-card px-3 py-2 text-sm text-adv-gray hover:text-adv-teal transition-colors">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <MarketDisclaimer compact />

      {/* Run Result */}
      {runResult && (
        <div className="rounded-xl border border-adv-teal/30 bg-adv-card p-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold text-adv-off-white">Run Result</h2>
            <button onClick={() => setRunResult(null)} className="text-xs text-adv-gray hover:text-adv-off-white">Dismiss</button>
          </div>
          <div className="flex items-center gap-3 mb-3">
            {runResult.success ? (
              <CheckCircle2 className="h-4 w-4 text-adv-green" />
            ) : (
              <AlertCircle className="h-4 w-4 text-adv-red" />
            )}
            <span className={`text-sm font-medium ${runResult.success ? 'text-adv-green' : 'text-adv-red'}`}>
              {runResult.success ? 'Success' : 'Error'}
            </span>
            {runResult.durationMs != null && (
              <span className="text-xs text-adv-gray">{Number(runResult.durationMs).toFixed(0)}ms</span>
            )}
          </div>
          <pre className="text-xs text-adv-off-white bg-adv-dark-2 rounded-lg p-3 max-h-48 overflow-auto whitespace-pre-wrap">
            {JSON.stringify(runResult.output ?? runResult.error, null, 2)}
          </pre>
        </div>
      )}

      {/* Templates by Category */}
      {Object.entries(categories).map(([cat, catTemplates]) => (
        <div key={cat}>
          <h2 className="text-lg font-semibold text-adv-off-white mb-3">{categoryLabels[cat] || cat}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {catTemplates.map((t) => (
              <div key={t.name} className="rounded-xl border border-adv-card bg-adv-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-adv-off-white">{t.name.replace(/_/g, ' ')}</span>
                  <button
                    onClick={() => setExpandedTemplate(expandedTemplate === t.name ? null : t.name)}
                    className="text-adv-gray hover:text-adv-teal"
                  >
                    {expandedTemplate === t.name ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-adv-gray mb-3">{t.description}</p>

                {expandedTemplate === t.name && (
                  <div className="space-y-2 mb-3">
                    <div className="text-xs text-adv-gray">
                      <span className="font-medium">Schema:</span> <code className="text-adv-teal">{t.inputSchema}</code>
                    </div>
                    <textarea
                      value={inputJson}
                      onChange={(e) => setInputJson(e.target.value)}
                      rows={3}
                      placeholder='{"key": "value"}'
                      className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-xs text-adv-off-white font-mono placeholder-adv-gray focus:outline-none focus:border-adv-teal"
                    />
                  </div>
                )}

                <button
                  onClick={() => handleRun(t.name)}
                  disabled={runningTemplate === t.name}
                  className="flex items-center gap-1.5 rounded-md bg-adv-dark-2 border border-adv-dark px-3 py-1.5 text-xs text-adv-teal hover:border-adv-teal transition-colors disabled:opacity-50"
                >
                  {runningTemplate === t.name ? (
                    <><Loader2 className="h-3 w-3 animate-spin" /> Running...</>
                  ) : (
                    <><Play className="h-3 w-3" /> Run</>
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Recent Computation Logs */}
      <div className="rounded-xl border border-adv-card bg-adv-card p-5">
        <h2 className="text-lg font-semibold text-adv-off-white mb-4">Recent Computations</h2>
        {logs.length === 0 ? (
          <p className="text-sm text-adv-gray text-center py-4">No computations yet. Run a template above.</p>
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
                    <Loader2 className="h-4 w-4 text-adv-gold animate-spin" />
                  )}
                  <span className="text-sm text-adv-off-white">{log.template_name.replace(/_/g, ' ')}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-adv-gray">{log.triggered_by}</span>
                  {log.execution_time_ms !== null && (
                    <span className="text-xs text-adv-gray">{log.execution_time_ms}ms</span>
                  )}
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
