import React, { useState, useEffect } from 'react';
import { Search, Loader2, Building2, Download, Clock, AlertTriangle, CheckCircle } from 'lucide-react';
import { RoaringEntityCard } from '../components/roaring/RoaringEntityCard';
import type { RoaringEntityProfile } from '../../server/services/roaring-connector.js';

interface RecentScreen {
  id: string;
  entity_name: string;
  org_number: string;
  risk_score: string;
  hit_count: number;
  screened_at: string;
}

interface ConnectorStatus {
  mode: 'live' | 'mock';
  apiKeySet: boolean;
  connector?: { total_calls: number; last_successful_call?: string };
}

export default function RoaringSearchPage() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<RoaringEntityProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<ConnectorStatus | null>(null);
  const [recent, setRecent] = useState<RecentScreen[]>([]);
  const [batchInput, setBatchInput] = useState('');
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchResult, setBatchResult] = useState<unknown | null>(null);
  const [tab, setTab] = useState<'search' | 'batch' | 'history'>('search');

  useEffect(() => {
    fetch('/api/roaring/status').then(r => r.json()).then(setStatus).catch(() => {});
    fetch('/api/roaring/screens/recent').then(r => r.json()).then(d => setRecent(d.screens ?? [])).catch(() => {});
  }, []);

  async function handleSearch() {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setProfile(null);
    try {
      const res = await fetch(`/api/roaring/profile/${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Search failed');
      setProfile(data.profile);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleBatchScreen() {
    const orgNumbers = batchInput.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    if (orgNumbers.length === 0) return;
    setBatchLoading(true);
    try {
      const res = await fetch('/api/roaring/batch-screen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgNumbers }),
      });
      const data = await res.json();
      setBatchResult(data.result);
    } catch (err) {
      setError(String(err));
    } finally {
      setBatchLoading(false);
    }
  }

  async function handleInjectToSession() {
    if (!profile) return;
    // In a full implementation this would call /api/roaring/enrich-session with the active session ID
    alert('Entity context injected into active session (demo — wire to active session ID in production)');
  }

  function riskLabel(score: string | number) {
    const n = Number(score);
    if (n >= 70) return { label: 'HIGH', cls: 'text-adv-red' };
    if (n >= 30) return { label: 'MED', cls: 'text-adv-gold' };
    return { label: 'LOW', cls: 'text-adv-green' };
  }

  return (
    <div className="min-h-screen bg-adv-dark p-6">
      <div className="mx-auto max-w-5xl space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-adv-teal/10 border border-adv-teal/20">
                <Building2 className="h-5 w-5 text-adv-teal" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-adv-off-white">Roaring — Nordic Entity Registry</h1>
                <p className="text-xs text-adv-gray">Swedish company registry · UBO chains · Sanctions screening</p>
              </div>
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
          {(['search', 'batch', 'history'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm capitalize transition-colors ${tab === t ? 'border-b-2 border-adv-teal text-adv-teal' : 'text-adv-gray hover:text-adv-off-white'}`}
            >
              {t === 'history' ? 'Screen History' : t === 'batch' ? 'Batch Screening' : 'Entity Search'}
            </button>
          ))}
        </div>

        {/* Tab: Search */}
        {tab === 'search' && (
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-adv-gray" />
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  placeholder="Company name or org number (556123-4567)…"
                  className="w-full rounded-xl border border-adv-dark/60 bg-adv-card pl-9 pr-4 py-3 text-sm text-adv-off-white placeholder-adv-gray-med focus:border-adv-teal/40 focus:outline-none"
                />
              </div>
              <button
                onClick={handleSearch}
                disabled={loading || !query.trim()}
                className="rounded-xl bg-adv-teal/10 border border-adv-teal/30 px-6 py-3 text-sm font-medium text-adv-teal hover:bg-adv-teal/20 disabled:opacity-50 transition-colors"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Screen Entity'}
              </button>
            </div>

            {error && (
              <div className="rounded-xl border border-adv-red/30 bg-red-900/10 px-4 py-3 text-sm text-adv-red">{error}</div>
            )}

            {loading && (
              <div className="flex items-center justify-center py-12">
                <div className="text-center space-y-3">
                  <Loader2 className="h-8 w-8 animate-spin text-adv-teal mx-auto" />
                  <p className="text-sm text-adv-gray">Fetching entity profile from Roaring…</p>
                </div>
              </div>
            )}

            {profile && (
              <RoaringEntityCard
                profile={profile}
                onInjectToSession={handleInjectToSession}
                onOpenCounselDesk={() => window.open('/counsels-desk', '_blank')}
              />
            )}
          </div>
        )}

        {/* Tab: Batch */}
        {tab === 'batch' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-adv-dark/50 bg-adv-card p-4">
              <h3 className="text-sm font-medium text-adv-off-white mb-2">Batch Screening</h3>
              <p className="text-xs text-adv-gray mb-3">Enter org numbers (one per line or comma-separated). Max 100 per batch.</p>
              <textarea
                value={batchInput}
                onChange={e => setBatchInput(e.target.value)}
                placeholder="556123-4567&#10;556234-5678&#10;556345-6789"
                rows={6}
                className="w-full rounded-lg border border-adv-dark/60 bg-adv-dark/40 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray-med focus:border-adv-teal/40 focus:outline-none font-mono resize-none"
              />
              <div className="mt-3 flex items-center gap-3">
                <button
                  onClick={handleBatchScreen}
                  disabled={batchLoading || !batchInput.trim()}
                  className="flex items-center gap-2 rounded-lg bg-adv-teal/10 border border-adv-teal/30 px-4 py-2 text-sm text-adv-teal hover:bg-adv-teal/20 disabled:opacity-50 transition-colors"
                >
                  {batchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Run Batch Screen
                </button>
                {batchResult && (
                  <button className="flex items-center gap-1.5 rounded-lg bg-adv-card border border-adv-gray/20 px-3 py-2 text-sm text-adv-gray hover:text-adv-off-white transition-colors">
                    <Download className="h-4 w-4" />
                    Export XLSX
                  </button>
                )}
              </div>
            </div>

            {batchResult && (
              <div className="rounded-xl border border-adv-dark/50 bg-adv-card overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-adv-dark/50 bg-adv-dark/30">
                      <th className="px-4 py-2 text-left text-adv-gray font-medium">Entity / Org Number</th>
                      <th className="px-4 py-2 text-center text-adv-gray font-medium">Risk</th>
                      <th className="px-4 py-2 text-center text-adv-gray font-medium">Hits</th>
                    </tr>
                  </thead>
                  <tbody>
                    {((batchResult as { results?: Array<{ orgNumber: string; entityName: string; riskScore: number; hitCount: number }> }).results ?? []).map((row, i) => {
                      const { label, cls } = riskLabel(row.riskScore);
                      return (
                        <tr key={i} className="border-b border-adv-dark/30 hover:bg-adv-dark/20">
                          <td className="px-4 py-2 text-adv-off-white">{row.entityName} <span className="text-adv-gray-med ml-1">{row.orgNumber}</span></td>
                          <td className={`px-4 py-2 text-center font-medium ${cls}`}>{label}</td>
                          <td className="px-4 py-2 text-center text-adv-off-white">{row.hitCount}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab: History */}
        {tab === 'history' && (
          <div className="space-y-2">
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
                      <th className="px-4 py-2 text-left text-adv-gray font-medium">Org Number</th>
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
                        onClick={() => { setQuery(row.org_number || row.entity_name); setTab('search'); setTimeout(handleSearch, 100); }}
                      >
                        <td className="px-4 py-2 text-adv-off-white">{row.entity_name}</td>
                        <td className="px-4 py-2 text-adv-gray">{row.org_number ?? '—'}</td>
                        <td className="px-4 py-2 text-center">
                          {row.risk_score === 'HIGH' || row.risk_score === 'MEDIUM'
                            ? <AlertTriangle className="h-3.5 w-3.5 mx-auto text-adv-gold" />
                            : <CheckCircle className="h-3.5 w-3.5 mx-auto text-adv-green" />
                          }
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
