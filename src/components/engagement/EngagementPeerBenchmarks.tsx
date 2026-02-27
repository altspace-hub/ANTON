/**
 * EngagementPeerBenchmarks.tsx
 * Peer Benchmarking section — embedded in Resource Collection Phase.
 * Two modes: Web search (Claude + internet) or Internal Library (previous engagements, anonymised).
 */

import { useState, useEffect } from 'react';
import {
  Search, BookOpen, Globe, Loader2, Trash2, ChevronDown, ChevronUp,
  Plus, BarChart2, AlertCircle, CheckCircle, Building
} from 'lucide-react';
import { getAuthHeader } from '@/lib/api';
import type { EngagementData, PeerBenchmark } from '@/pages/EngagementWorkspacePage';

interface Props {
  engagement: EngagementData;
  onReload: () => void;
}

interface PeerLibraryEntry {
  id: string;
  label: string;               // anonymized label e.g. "Peer Institution A"
  domain: string;
  engagement_type: string;
  overall_score: number | null;
  completed_at: string;
}

type Tab = 'web' | 'internal';

export default function EngagementPeerBenchmarks({ engagement, onReload }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('web');

  // Web search state
  const [webQuery, setWebQuery] = useState('');
  const [webSearching, setWebSearching] = useState(false);
  const [webError, setWebError] = useState<string | null>(null);

  // Internal library state
  const [library, setLibrary] = useState<PeerLibraryEntry[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [addingFromInternal, setAddingFromInternal] = useState<string | null>(null);

  const benchmarks: PeerBenchmark[] = (engagement as unknown as { peer_benchmarks?: PeerBenchmark[] }).peer_benchmarks || [];

  useEffect(() => {
    if (expanded && activeTab === 'internal' && library.length === 0) {
      loadLibrary();
    }
  }, [expanded, activeTab]);

  async function loadLibrary() {
    setLoadingLibrary(true);
    try {
      const res = await fetch('/api/engagements/peer-library', { headers: getAuthHeader() });
      if (res.ok) setLibrary(await res.json());
    } finally {
      setLoadingLibrary(false);
    }
  }

  async function runWebSearch() {
    if (!webQuery.trim()) return;
    setWebSearching(true);
    setWebError(null);
    try {
      const res = await fetch(`/api/engagements/${engagement.id}/peer-benchmarks/web-search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ query: webQuery.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      setWebQuery('');
      onReload();
    } catch (e) {
      setWebError(String(e));
    } finally {
      setWebSearching(false);
    }
  }

  async function addFromInternal(sourceId: string) {
    setAddingFromInternal(sourceId);
    try {
      await fetch(`/api/engagements/${engagement.id}/peer-benchmarks/from-internal/${sourceId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({}),
      });
      onReload();
    } finally {
      setAddingFromInternal(null);
    }
  }

  async function deleteBenchmark(benchmarkId: string) {
    await fetch(`/api/engagements/${engagement.id}/peer-benchmarks/${benchmarkId}`, {
      method: 'DELETE',
      headers: getAuthHeader(),
    });
    onReload();
  }

  const alreadyAdded = new Set(benchmarks.map(b => b.source_engagement_id).filter(Boolean));

  return (
    <div className="bg-adv-card border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-adv-dark-2/30 transition-colors"
        onClick={() => setExpanded(p => !p)}
      >
        <BarChart2 className="h-4 w-4 text-adv-teal shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-adv-off-white">Peer Benchmarks</p>
          <p className="text-xs text-adv-gray-med">{benchmarks.length} benchmark{benchmarks.length !== 1 ? 's' : ''} added</p>
        </div>
        <span className="text-[10px] bg-adv-blue/10 text-adv-blue border border-adv-blue/20 rounded-full px-2 py-0.5">Optional</span>
        {expanded ? <ChevronUp className="h-4 w-4 text-adv-gray-med" /> : <ChevronDown className="h-4 w-4 text-adv-gray-med" />}
      </div>

      {expanded && (
        <div className="border-t border-border p-4 space-y-4">
          <p className="text-xs text-adv-gray">
            Compare this engagement's scope and context against industry benchmarks or previous engagements.
            Benchmarks are injected into execution to help ANTON calibrate findings and maturity assessments.
            Peer names are always anonymised.
          </p>

          {/* Existing benchmarks */}
          {benchmarks.length > 0 && (
            <div className="space-y-2">
              {benchmarks.map(b => <BenchmarkCard key={b.id} benchmark={b} onDelete={() => deleteBenchmark(b.id)} />)}
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 bg-adv-dark-2 rounded-lg p-1">
            {([['web', Globe, 'Web Search'], ['internal', BookOpen, 'Internal Library']] as [Tab, React.ComponentType<{className?: string}>, string][]).map(([id, Icon, label]) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  activeTab === id ? 'bg-adv-card text-adv-teal shadow' : 'text-adv-gray hover:text-adv-off-white'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* Web search tab */}
          {activeTab === 'web' && (
            <div className="space-y-3">
              <p className="text-xs text-adv-gray">
                ANTON will search the internet for publicly available benchmark information — industry reports, regulatory findings, published maturity assessments — relevant to your query.
              </p>
              <div className="flex gap-2">
                <input
                  value={webQuery}
                  onChange={e => setWebQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && runWebSearch()}
                  placeholder="e.g. AML maturity benchmarks Nordic banks 2024"
                  className="flex-1 bg-adv-dark-2 border border-border rounded-lg px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray-med focus:outline-none focus:border-adv-teal"
                />
                <button
                  onClick={runWebSearch}
                  disabled={!webQuery.trim() || webSearching}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-adv-teal text-adv-dark text-sm font-medium hover:bg-adv-teal-dark disabled:opacity-50 transition-colors shrink-0"
                >
                  {webSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  {webSearching ? 'Searching…' : 'Search'}
                </button>
              </div>
              {webError && (
                <div className="flex items-start gap-2 text-xs text-adv-red bg-adv-red/10 border border-adv-red/20 rounded-lg px-3 py-2">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  {webError}
                </div>
              )}
            </div>
          )}

          {/* Internal library tab */}
          {activeTab === 'internal' && (
            <div className="space-y-3">
              <p className="text-xs text-adv-gray">
                Select completed engagements from the internal library. Client names are replaced with anonymous labels (Peer Institution A, B…). Scores and key findings are retained.
              </p>
              {loadingLibrary ? (
                <div className="flex items-center gap-2 text-xs text-adv-gray py-4 justify-center">
                  <Loader2 className="h-4 w-4 animate-spin text-adv-teal" />
                  Loading library…
                </div>
              ) : library.length === 0 ? (
                <div className="text-center py-6 text-xs text-adv-gray-med border border-dashed border-border rounded-lg">
                  No completed engagements available yet.
                  <br />Complete other engagements and enable them as benchmarks in their settings.
                </div>
              ) : (
                <div className="space-y-2">
                  {library.filter(e => e.id !== engagement.id).map(entry => {
                    const isAdded = alreadyAdded.has(entry.id);
                    const isAdding = addingFromInternal === entry.id;
                    return (
                      <div key={entry.id} className="flex items-center gap-3 bg-adv-dark-2 rounded-lg px-3 py-2.5">
                        <Building className="h-4 w-4 text-adv-blue shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-adv-off-white">{entry.label}</p>
                          <p className="text-[10px] text-adv-gray-med mt-0.5">{entry.domain} · {entry.engagement_type}</p>
                        </div>
                        {entry.overall_score !== null && (
                          <span className="text-xs text-adv-teal font-medium shrink-0">{entry.overall_score}/100</span>
                        )}
                        {isAdded ? (
                          <span className="flex items-center gap-1 text-[10px] text-adv-green shrink-0">
                            <CheckCircle className="h-3 w-3" /> Added
                          </span>
                        ) : (
                          <button
                            onClick={() => addFromInternal(entry.id)}
                            disabled={isAdding}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-adv-teal/10 text-adv-teal text-[10px] font-medium hover:bg-adv-teal-dim border border-adv-teal/20 disabled:opacity-50 transition-colors shrink-0"
                          >
                            {isAdding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                            Add
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── BenchmarkCard ─────────────────────────────────────────────────────────────

function BenchmarkCard({ benchmark, onDelete }: { benchmark: PeerBenchmark; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);

  const maturity = (() => {
    try { return JSON.parse(benchmark.maturity_data || '{}'); } catch { return {}; }
  })();

  const findings = (() => {
    try { return JSON.parse(benchmark.key_findings || '[]'); } catch { return []; }
  })() as string[];

  return (
    <div className="bg-adv-dark-2 rounded-xl border border-border overflow-hidden">
      <div className="flex items-center gap-3 px-3 py-2.5">
        {benchmark.benchmark_type === 'web_search'
          ? <Globe className="h-3.5 w-3.5 text-adv-blue shrink-0" />
          : <BookOpen className="h-3.5 w-3.5 text-adv-gold shrink-0" />}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-adv-off-white">{benchmark.anonymized_label}</p>
          <p className="text-[10px] text-adv-gray-med mt-0.5">
            {benchmark.domain || 'Unknown domain'}
            {benchmark.scope_similarity && ` · ${benchmark.scope_similarity}`}
          </p>
        </div>
        <button onClick={() => setExpanded(p => !p)} className="text-adv-gray-med hover:text-adv-teal p-1 transition-colors">
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        <button onClick={onDelete} className="text-adv-gray-med hover:text-adv-red p-1 transition-colors">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {expanded && (findings.length > 0 || Object.keys(maturity).length > 0) && (
        <div className="border-t border-border px-3 py-3 space-y-2">
          {findings.length > 0 && (
            <div>
              <p className="text-[10px] text-adv-gray-med uppercase tracking-wider mb-1">Key Findings</p>
              <ul className="space-y-0.5">
                {findings.slice(0, 4).map((f, i) => (
                  <li key={i} className="text-xs text-adv-gray flex items-start gap-1.5">
                    <span className="text-adv-teal shrink-0 mt-0.5">·</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {typeof maturity === 'object' && Object.keys(maturity).length > 0 && (
            <div>
              <p className="text-[10px] text-adv-gray-med uppercase tracking-wider mb-1.5">Maturity Scores</p>
              <div className="space-y-1.5">
                {Object.entries(maturity).slice(0, 5).map(([area, score]) => (
                  <div key={area} className="flex items-center gap-2">
                    <span className="text-[10px] text-adv-gray flex-1 truncate capitalize">{area.replace(/_/g, ' ')}</span>
                    <div className="w-24 h-1.5 bg-adv-dark rounded-full overflow-hidden">
                      <div
                        className="h-full bg-adv-teal rounded-full"
                        style={{ width: `${Math.min(100, Number(score) || 0)}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-adv-off-white w-6 text-right">{String(score)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
