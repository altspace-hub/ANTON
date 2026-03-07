import React, { useState, useEffect } from 'react';
import { Search, Loader2, Shield, Clock, AlertTriangle, CheckCircle, Bell, Globe, Upload } from 'lucide-react';
import { DJScreeningPanel } from '../components/dowjones/DJScreeningPanel';
import type { DJScreenResult, AdverseMediaResult } from '../../server/services/dowjones-connector.js';

interface RecentScreen {
  id: string;
  entity_name: string;
  risk_score: string;
  hit_count: number;
  screened_at: string;
}

interface Monitoring {
  id: string;
  entity_name: string;
  registered_at: string;
  alert_count: number;
  status: string;
}

interface ConnectorStatus {
  mode: 'live' | 'mock';
  apiKeySet: boolean;
  connector?: { total_calls: number; last_successful_call?: string };
}

export default function DJScreeningPage() {
  const [entityName, setEntityName] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DJScreenResult | null>(null);
  const [adverseMedia, setAdverseMedia] = useState<AdverseMediaResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<ConnectorStatus | null>(null);
  const [recent, setRecent] = useState<RecentScreen[]>([]);
  const [monitoring, setMonitoring] = useState<Monitoring[]>([]);
  const [tab, setTab] = useState<'screen' | 'batch' | 'monitoring' | 'history'>('screen');
  const [batchInput, setBatchInput] = useState('');
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchResult, setBatchResult] = useState<unknown | null>(null);
  const [availableLists, setAvailableLists] = useState<Array<{ id: string; name: string; type: string; entityCount: number }>>([]);

  useEffect(() => {
    fetch('/api/dowjones/status').then(r => r.json()).then(setStatus).catch(() => {});
    fetch('/api/dowjones/screens/recent').then(r => r.json()).then(d => setRecent(d.screens ?? [])).catch(() => {});
    fetch('/api/dowjones/monitoring').then(r => r.json()).then(d => setMonitoring(d.monitoring ?? [])).catch(() => {});
    fetch('/api/dowjones/lists').then(r => r.json()).then(d => setAvailableLists(d.lists ?? [])).catch(() => {});
  }, []);

  async function handleScreen() {
    if (!entityName.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setAdverseMedia(null);
    try {
      const [screenRes, amRes] = await Promise.allSettled([
        fetch('/api/dowjones/screen', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: entityName.trim() }),
        }).then(r => r.json()),
        fetch(`/api/dowjones/adverse-media?q=${encodeURIComponent(entityName.trim())}`).then(r => r.json()),
      ]);
      if (screenRes.status === 'fulfilled' && !screenRes.value.error) {
        setResult(screenRes.value.result);
      } else if (screenRes.status === 'rejected' || screenRes.value.error) {
        throw new Error(screenRes.status === 'rejected' ? String(screenRes.reason) : screenRes.value.error);
      }
      if (amRes.status === 'fulfilled' && !amRes.value.error) {
        setAdverseMedia(amRes.value.result);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleBatch() {
    const entities = batchInput.split(/[\n,]+/).map(s => s.trim()).filter(Boolean).map(name => ({ name }));
    if (entities.length === 0) return;
    setBatchLoading(true);
    try {
      const res = await fetch('/api/dowjones/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entities }),
      });
      const data = await res.json();
      setBatchResult(data.result);
    } catch (err) {
      setError(String(err));
    } finally {
      setBatchLoading(false);
    }
  }

  async function handleAddToMonitoring() {
    if (!result) return;
    try {
      const res = await fetch('/api/dowjones/monitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: result.referenceId, entityName: result.entityQueried }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Refresh monitoring list after successful registration
      const monData = await fetch('/api/dowjones/monitoring').then(r => r.json());
      setMonitoring(monData.monitoring ?? []);
      alert(`"${result.entityQueried}" added to monitoring watchlist.`);
    } catch (err) {
      setError(`Monitoring registration failed: ${String(err)}`);
    }
  }

  const RISK_ICON = {
    HIGH: <AlertTriangle className="h-4 w-4 text-adv-red" />,
    MEDIUM: <AlertTriangle className="h-4 w-4 text-adv-gold" />,
    LOW: <CheckCircle className="h-4 w-4 text-adv-green" />,
    CLEAR: <CheckCircle className="h-4 w-4 text-adv-teal" />,
  };

  return (
    <div className="min-h-screen bg-adv-dark p-6">
      <div className="mx-auto max-w-5xl space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-adv-blue/10 border border-adv-blue/20">
              <Shield className="h-5 w-5 text-adv-blue" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-adv-off-white">Dow Jones Risk & Compliance</h1>
              <p className="text-xs text-adv-gray">Global sanctions · 1.4M+ PEPs · Adverse media · SOE intelligence</p>
            </div>
          </div>
          {status && (
            <div className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${
              status.mode === 'live'
                ? 'border-adv-green/30 bg-adv-green/5 text-adv-green'
                : 'border-adv-gold/30 bg-adv-gold/5 text-adv-gold'
            }`}>
              <div className={`h-2 w-2 rounded-full ${status.mode === 'live' ? 'bg-adv-green' : 'bg-adv-gold'}`} />
              {status.mode === 'live' ? 'Live API' : 'Mock Demo Mode'}
              {status.connector && <span className="text-adv-gray-med">· {status.connector.total_calls} calls</span>}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-adv-dark-2">
          {(['screen', 'batch', 'monitoring', 'history'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm transition-colors ${tab === t ? 'border-b-2 border-adv-teal text-adv-teal' : 'text-adv-gray hover:text-adv-off-white'}`}
            >
              {t === 'screen' ? 'Screen Entity' : t === 'batch' ? 'Batch Screen' : t === 'monitoring' ? `Monitoring (${monitoring.length})` : 'History'}
            </button>
          ))}
        </div>

        {/* Tab: Screen */}
        {tab === 'screen' && (
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-adv-gray" />
                <input
                  type="text"
                  value={entityName}
                  onChange={e => setEntityName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleScreen()}
                  placeholder="Individual name or entity name…"
                  className="w-full rounded-xl border border-adv-dark/60 bg-adv-card pl-9 pr-4 py-3 text-sm text-adv-off-white placeholder-adv-gray-med focus:border-adv-teal/40 focus:outline-none"
                />
              </div>
              <button
                onClick={handleScreen}
                disabled={loading || !entityName.trim()}
                className="rounded-xl bg-adv-teal/10 border border-adv-teal/30 px-6 py-3 text-sm font-medium text-adv-teal hover:bg-adv-teal/20 disabled:opacity-50 transition-colors"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Screen'}
              </button>
            </div>

            {error && <div className="rounded-xl border border-adv-red/30 bg-red-900/10 px-4 py-3 text-sm text-adv-red">{error}</div>}
            {loading && (
              <div className="flex items-center justify-center py-12">
                <div className="text-center space-y-3">
                  <Loader2 className="h-8 w-8 animate-spin text-adv-teal mx-auto" />
                  <p className="text-sm text-adv-gray">Screening against 50+ sanctions lists, 1.4M+ PEPs, 35,000+ media sources…</p>
                </div>
              </div>
            )}
            {result && (
              <DJScreeningPanel
                result={result}
                adverseMedia={adverseMedia ?? undefined}
                onAddToMonitoring={handleAddToMonitoring}
                onExportAudit={() => alert('Audit export — wire to /api/export in production')}
                onOpenCounselDesk={() => window.open('/counsels-desk', '_blank')}
              />
            )}

            {/* Available lists */}
            {availableLists.length > 0 && !result && (
              <div className="rounded-xl border border-adv-dark/50 bg-adv-card p-4">
                <h3 className="text-xs font-semibold text-adv-gray mb-3">Screening Coverage</h3>
                <div className="grid grid-cols-2 gap-2">
                  {availableLists.map(list => (
                    <div key={list.id} className="flex items-center justify-between rounded-lg bg-adv-dark/30 px-3 py-2">
                      <div>
                        <div className="text-xs text-adv-off-white">{list.name}</div>
                        <div className="text-[10px] text-adv-gray-med">{list.type}</div>
                      </div>
                      {list.entityCount > 0 && (
                        <div className="text-[10px] text-adv-gray">{list.entityCount.toLocaleString()}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab: Batch */}
        {tab === 'batch' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-adv-dark/50 bg-adv-card p-4">
              <h3 className="text-sm font-medium text-adv-off-white mb-2">Batch Entity Screening</h3>
              <p className="text-xs text-adv-gray mb-3">Enter entity names (one per line). Max 100 per batch. Screened against all active lists simultaneously.</p>
              <textarea
                value={batchInput}
                onChange={e => setBatchInput(e.target.value)}
                placeholder="Acme Holdings AB&#10;John Smith&#10;Nordic Capital Fund III"
                rows={6}
                className="w-full rounded-lg border border-adv-dark/60 bg-adv-dark/40 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray-med focus:border-adv-teal/40 focus:outline-none resize-none"
              />
              <div className="mt-3 flex items-center gap-3">
                <button
                  onClick={handleBatch}
                  disabled={batchLoading || !batchInput.trim()}
                  className="flex items-center gap-2 rounded-lg bg-adv-teal/10 border border-adv-teal/30 px-4 py-2 text-sm text-adv-teal hover:bg-adv-teal/20 disabled:opacity-50 transition-colors"
                >
                  {batchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Run Batch Screen
                </button>
              </div>
            </div>
            {batchResult && (
              <div className="rounded-xl border border-adv-dark/50 bg-adv-card overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-adv-dark/50 bg-adv-dark/30">
                      <th className="px-4 py-2 text-left text-adv-gray font-medium">Entity</th>
                      <th className="px-4 py-2 text-center text-adv-gray font-medium">Risk</th>
                      <th className="px-4 py-2 text-center text-adv-gray font-medium">Hits</th>
                      <th className="px-4 py-2 text-right text-adv-gray font-medium">Reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {((batchResult as { results?: Array<{ entityName: string; riskScore: string; hitCount: number; referenceId: string }> }).results ?? []).map((row, i) => (
                      <tr key={i} className="border-b border-adv-dark/30 hover:bg-adv-dark/20">
                        <td className="px-4 py-2 text-adv-off-white">{row.entityName}</td>
                        <td className="px-4 py-2 text-center">
                          <div className="flex justify-center">{RISK_ICON[row.riskScore as keyof typeof RISK_ICON] ?? RISK_ICON.CLEAR}</div>
                        </td>
                        <td className="px-4 py-2 text-center text-adv-off-white">{row.hitCount}</td>
                        <td className="px-4 py-2 text-right text-adv-gray-med font-mono text-[10px]">{row.referenceId.slice(-8)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab: Monitoring */}
        {tab === 'monitoring' && (
          <div className="space-y-3">
            {monitoring.length === 0 ? (
              <div className="rounded-xl border border-adv-dark/50 bg-adv-card px-6 py-12 text-center">
                <Bell className="h-8 w-8 text-adv-gray mx-auto mb-3" />
                <p className="text-sm text-adv-gray">No entities under active monitoring</p>
                <p className="text-xs text-adv-gray-med mt-1">Screen an entity and click "Add to monitoring" to start receiving alerts</p>
              </div>
            ) : (
              <div className="rounded-xl border border-adv-dark/50 bg-adv-card overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-adv-dark/50 bg-adv-dark/30">
                      <th className="px-4 py-2 text-left text-adv-gray font-medium">Entity</th>
                      <th className="px-4 py-2 text-center text-adv-gray font-medium">Alerts</th>
                      <th className="px-4 py-2 text-center text-adv-gray font-medium">Status</th>
                      <th className="px-4 py-2 text-right text-adv-gray font-medium">Registered</th>
                      <th className="px-4 py-2 text-right text-adv-gray font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {monitoring.map(row => (
                      <tr key={row.id} className="border-b border-adv-dark/30 hover:bg-adv-dark/20">
                        <td className="px-4 py-2 text-adv-off-white">{row.entity_name}</td>
                        <td className="px-4 py-2 text-center">
                          <span className={`font-medium ${row.alert_count > 0 ? 'text-adv-red' : 'text-adv-gray'}`}>{row.alert_count}</span>
                        </td>
                        <td className="px-4 py-2 text-center">
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] ${
                            row.status === 'active' ? 'border-adv-green/30 bg-adv-green/5 text-adv-green' : 'border-adv-gray/30 bg-adv-card text-adv-gray'
                          }`}>
                            {row.status}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right text-adv-gray">{new Date(row.registered_at).toLocaleDateString()}</td>
                        <td className="px-4 py-2 text-right">
                          {row.status === 'active' && (
                            <button
                              onClick={async () => {
                                await fetch(`/api/dowjones/monitor/${row.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'cancelled' }) });
                                const d = await fetch('/api/dowjones/monitoring').then(r => r.json());
                                setMonitoring(d.monitoring ?? []);
                              }}
                              className="text-[10px] text-adv-red/70 hover:text-adv-red transition-colors"
                            >
                              Cancel
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="rounded-lg border border-adv-teal/20 bg-adv-teal/5 px-3 py-2 text-xs text-adv-teal">
              <Globe className="h-3.5 w-3.5 inline mr-1" />
              Dow Jones sends real-time webhook alerts when monitored entities are added to or removed from any watchlist.
              {status?.mode === 'mock' && ' (Mock mode — alerts simulated locally)'}
            </div>
          </div>
        )}

        {/* Tab: History */}
        {tab === 'history' && (
          <div>
            {recent.length === 0 ? (
              <div className="rounded-xl border border-adv-dark/50 bg-adv-card px-6 py-12 text-center">
                <Clock className="h-8 w-8 text-adv-gray mx-auto mb-3" />
                <p className="text-sm text-adv-gray">No screening history yet</p>
              </div>
            ) : (
              <div className="rounded-xl border border-adv-dark/50 bg-adv-card overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-adv-dark/50 bg-adv-dark/30">
                      <th className="px-4 py-2 text-left text-adv-gray font-medium">Entity</th>
                      <th className="px-4 py-2 text-center text-adv-gray font-medium">Risk</th>
                      <th className="px-4 py-2 text-center text-adv-gray font-medium">Hits</th>
                      <th className="px-4 py-2 text-right text-adv-gray font-medium">Screened</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map(row => (
                      <tr
                        key={row.id}
                        className="border-b border-adv-dark/30 hover:bg-adv-dark/20 cursor-pointer"
                        onClick={() => { setEntityName(row.entity_name); setTab('screen'); setTimeout(handleScreen, 100); }}
                      >
                        <td className="px-4 py-2 text-adv-off-white">{row.entity_name}</td>
                        <td className="px-4 py-2 text-center">
                          <div className="flex justify-center">{RISK_ICON[row.risk_score as keyof typeof RISK_ICON] ?? RISK_ICON.CLEAR}</div>
                        </td>
                        <td className="px-4 py-2 text-center text-adv-off-white">{row.hit_count}</td>
                        <td className="px-4 py-2 text-right text-adv-gray">{new Date(row.screened_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
