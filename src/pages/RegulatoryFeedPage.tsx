/**
 * LONE-07/18: Regulatory Feed Page
 *
 * Lets FCP users subscribe to regulatory sources and generate AI-powered digests
 * summarising the latest developments from EBA, ESMA, FATF, EUR-Lex, FCA, etc.
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Rss,
  Plus,
  Trash2,
  RefreshCw,
  BookOpen,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Globe,
  Filter,
} from 'lucide-react';
import { fetchWithAuth, API_BASE } from '@/lib/api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// ── Types ────────────────────────────────────────────────────────────────────

interface RegulatorySource {
  id: string;
  name: string;
  url: string;
  category: string;
  description: string;
}

interface Subscription {
  id: string;
  source_id: string;
  source_name: string;
  source_url: string;
  category: string;
  created_at: string;
}

interface DigestSummary {
  id: string;
  title: string;
  sources: string[];
  period_from: string;
  period_to: string;
  token_count: number;
  created_at: string;
}

interface DigestFull extends DigestSummary {
  content: string;
}

// ── Category labels ───────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  eu: 'European Union',
  fatf: 'FATF / AML Global',
  nordic: 'Nordic / National',
  uk: 'United Kingdom',
  basel: 'Basel / BIS',
  iosco: 'IOSCO',
  global: 'Global',
};

const CATEGORY_ORDER = ['eu', 'fatf', 'nordic', 'uk', 'basel', 'iosco', 'global'];

// ── Component ────────────────────────────────────────────────────────────────

export default function RegulatoryFeedPage() {
  const navigate = useNavigate();
  const [sources, setSources] = useState<RegulatorySource[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [digests, setDigests] = useState<DigestSummary[]>([]);
  const [selectedDigest, setSelectedDigest] = useState<DigestFull | null>(null);
  const [activeTab, setActiveTab] = useState<'sources' | 'digests'>('sources');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [period, setPeriod] = useState<'7d' | '30d'>('7d');
  const [focus, setFocus] = useState('');
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    loadSources();
    loadSubscriptions();
    loadDigests();
  }, []);

  async function loadSources() {
    try {
      const res = await fetchWithAuth(`${API_BASE}/regulatory-feed/sources`);
      if (res.ok) setSources(await res.json());
    } catch {}
  }

  async function loadSubscriptions() {
    try {
      const res = await fetchWithAuth(`${API_BASE}/regulatory-feed/subscriptions`);
      if (res.ok) setSubscriptions(await res.json());
    } catch {}
  }

  async function loadDigests() {
    try {
      const res = await fetchWithAuth(`${API_BASE}/regulatory-feed/digests`);
      if (res.ok) setDigests(await res.json());
    } catch {}
  }

  async function subscribe(sourceId: string) {
    try {
      const res = await fetchWithAuth(`${API_BASE}/regulatory-feed/subscriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_id: sourceId }),
      });
      if (res.ok) await loadSubscriptions();
    } catch (err) {
      setError('Failed to subscribe');
    }
  }

  async function unsubscribe(subId: string) {
    try {
      const res = await fetchWithAuth(`${API_BASE}/regulatory-feed/subscriptions/${subId}`, {
        method: 'DELETE',
      });
      if (res.ok) await loadSubscriptions();
    } catch (err) {
      setError('Failed to unsubscribe');
    }
  }

  async function generateDigest() {
    const subscribedIds = subscriptions.map(s => s.source_id);
    if (subscribedIds.length === 0) {
      setError('Subscribe to at least one source before generating a digest.');
      return;
    }
    setIsGenerating(true);
    setStreamText('');
    setError('');
    setActiveTab('digests');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetchWithAuth(`${API_BASE}/regulatory-feed/digest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_ids: subscribedIds, period, focus: focus.trim() || undefined }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || 'Request failed');
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response stream');
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        for (const line of text.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const raw = line.slice(5).trim();
          if (!raw || raw === '[DONE]') continue;
          try {
            const msg = JSON.parse(raw) as { type: string; content?: string; digestId?: string };
            if (msg.type === 'text' && msg.content) {
              setStreamText(prev => prev + msg.content);
            }
            if (msg.type === 'done') {
              await loadDigests();
            }
          } catch {}
        }
      }
    } catch (err: unknown) {
      if ((err as { name?: string }).name !== 'AbortError') {
        setError(err instanceof Error ? err.message : 'Digest generation failed');
      }
    } finally {
      setIsGenerating(false);
    }
  }

  function stopGeneration() {
    abortRef.current?.abort();
  }

  async function openDigest(id: string) {
    try {
      const res = await fetchWithAuth(`${API_BASE}/regulatory-feed/digests/${id}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedDigest(data);
      }
    } catch {}
  }

  const subscribedIds = new Set(subscriptions.map(s => s.source_id));
  const groupedSources = CATEGORY_ORDER.reduce<Record<string, RegulatorySource[]>>((acc, cat) => {
    const filtered = sources.filter(s => s.category === cat && (categoryFilter === 'all' || s.category === categoryFilter));
    if (filtered.length > 0) acc[cat] = filtered;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <Rss className="h-5 w-5 text-adv-teal" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-adv-off-white">Regulatory Feed</h1>
              <p className="text-sm text-adv-gray">
                Subscribe to regulatory sources · Generate AI-powered digests
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={period}
              onChange={e => setPeriod(e.target.value as '7d' | '30d')}
              className="bg-card border border-border text-adv-off-white text-sm rounded-lg px-3 py-2"
            >
              <option value="7d">Past 7 days</option>
              <option value="30d">Past 30 days</option>
            </select>
            {isGenerating ? (
              <button
                onClick={stopGeneration}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-medium transition-colors"
              >
                <AlertCircle className="h-4 w-4" />
                Stop
              </button>
            ) : (
              <button
                onClick={generateDigest}
                disabled={subscriptions.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-adv-teal-dark text-primary-foreground rounded-lg text-sm font-semibold transition-colors disabled:opacity-40"
              >
                <RefreshCw className="h-4 w-4" />
                Generate Digest
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-500/30 rounded-lg text-red-300 text-sm flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
            <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-200">✕</button>
          </div>
        )}

        {/* Subscription summary */}
        <div className="mb-4 p-3 bg-card border border-border rounded-lg flex items-center gap-4 text-sm">
          <span className="text-adv-gray">
            <span className="text-adv-off-white font-semibold">{subscriptions.length}</span> source{subscriptions.length !== 1 ? 's' : ''} subscribed
          </span>
          {subscriptions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {subscriptions.map(s => (
                <span key={s.id} className="px-2 py-0.5 bg-primary/20 text-adv-teal rounded-full text-xs">
                  {s.source_name.split(' ')[0]}
                </span>
              ))}
            </div>
          )}
          {subscriptions.length > 0 && (
            <div className="ml-auto">
              <textarea
                value={focus}
                onChange={e => setFocus(e.target.value)}
                placeholder="Custom focus (optional) — e.g. 'AML transaction monitoring RTS'"
                rows={1}
                className="bg-secondary border border-border text-sm text-adv-off-white placeholder-adv-gray-med rounded-lg px-3 py-1.5 w-80 resize-none"
              />
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-card p-1 rounded-lg w-fit">
          {(['sources', 'digests'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors capitalize ${
                activeTab === tab
                  ? 'bg-primary text-primary-foreground'
                  : 'text-adv-gray hover:text-adv-off-white'
              }`}
            >
              {tab === 'sources' ? `Sources (${sources.length})` : `Digests (${digests.length})`}
            </button>
          ))}
        </div>

        {/* Sources tab */}
        {activeTab === 'sources' && (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <Filter className="h-4 w-4 text-adv-gray" />
              <div className="flex gap-1.5 flex-wrap">
                <button
                  onClick={() => setCategoryFilter('all')}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    categoryFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-adv-gray hover:text-adv-off-white'
                  }`}
                >
                  All
                </button>
                {CATEGORY_ORDER.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      categoryFilter === cat ? 'bg-primary text-primary-foreground' : 'bg-muted text-adv-gray hover:text-adv-off-white'
                    }`}
                  >
                    {CATEGORY_LABELS[cat]}
                  </button>
                ))}
              </div>
            </div>

            {Object.entries(groupedSources).map(([cat, catSources]) => (
              <div key={cat} className="mb-6">
                <h2 className="text-xs font-semibold text-adv-gray uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Globe className="h-3.5 w-3.5" />
                  {CATEGORY_LABELS[cat] ?? cat}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {catSources.map(source => {
                    const isSubscribed = subscribedIds.has(source.id);
                    const sub = subscriptions.find(s => s.source_id === source.id);
                    return (
                      <div
                        key={source.id}
                        className={`p-4 rounded-lg border transition-colors ${
                          isSubscribed
                            ? 'bg-adv-teal-soft border-adv-teal/40'
                            : 'bg-card border-border hover:border-adv-teal/30'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {isSubscribed && <CheckCircle2 className="h-4 w-4 text-adv-teal shrink-0" />}
                              <span className="font-medium text-sm text-adv-off-white truncate">{source.name}</span>
                            </div>
                            <p className="text-xs text-adv-gray leading-relaxed">{source.description}</p>
                          </div>
                          <button
                            onClick={() => isSubscribed && sub ? unsubscribe(sub.id) : subscribe(source.id)}
                            className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                              isSubscribed
                                ? 'bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-500/20'
                                : 'bg-primary/20 hover:bg-primary/30 text-adv-teal border border-adv-teal/20'
                            }`}
                          >
                            {isSubscribed ? <Trash2 className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                            {isSubscribed ? 'Remove' : 'Subscribe'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Digests tab */}
        {activeTab === 'digests' && (
          <div className="flex gap-6">
            {/* Digest list */}
            <div className="w-72 shrink-0">
              {isGenerating && streamText && (
                <div className="mb-3 p-3 bg-adv-teal-soft border border-adv-teal/30 rounded-lg text-xs text-adv-teal animate-pulse">
                  Generating digest…
                </div>
              )}
              {digests.length === 0 && !isGenerating ? (
                <div className="p-6 text-center text-adv-gray-med text-sm">
                  <BookOpen className="h-8 w-8 mx-auto mb-3 opacity-40" />
                  <p>No digests yet.</p>
                  <p className="mt-1">Subscribe to sources and click "Generate Digest".</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {digests.map(digest => (
                    <button
                      key={digest.id}
                      onClick={() => openDigest(digest.id)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        selectedDigest?.id === digest.id
                          ? 'bg-adv-teal-soft border-adv-teal/40'
                          : 'bg-card border-border hover:border-adv-teal/30'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-adv-off-white leading-tight">{digest.title}</p>
                        <ChevronRight className="h-4 w-4 text-adv-gray-med shrink-0 mt-0.5" />
                      </div>
                      <p className="text-xs text-adv-gray-med mt-1">
                        {new Date(digest.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {' · '}{digest.sources.length} source{digest.sources.length !== 1 ? 's' : ''}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Digest content */}
            <div className="flex-1 min-w-0">
              {isGenerating && streamText ? (
                <div className="p-6 bg-card rounded-xl border border-border">
                  <div className="prose-output prose-sm max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {streamText}
                    </ReactMarkdown>
                    <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-0.5" />
                  </div>
                </div>
              ) : selectedDigest ? (
                <div className="p-6 bg-card rounded-xl border border-border">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-semibold text-adv-off-white">{selectedDigest.title}</h2>
                    <span className="text-xs text-adv-gray-med">
                      {new Date(selectedDigest.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </span>
                  </div>
                  <div className="prose-output prose-sm max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {selectedDigest.content}
                    </ReactMarkdown>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-48 bg-card rounded-xl border border-border text-adv-gray-med text-sm">
                  Select a digest to view it
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
