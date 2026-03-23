/**
 * PathfinderPage — Full search experience with council-of-models architecture
 * Phase 1-6: Search bar, depth selector, streaming results, threads, documents,
 *            follow-ups, suggestions, cost display, pipe-to-module
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Compass, Search, History, Sparkles } from 'lucide-react';
import DepthSelector from '@/components/pathfinder/DepthSelector';
import SearchModeSelector from '@/components/pathfinder/SearchModeSelector';
import PathfinderResultPanel from '@/components/pathfinder/PathfinderResultPanel';
import PathfinderThreadTabs from '@/components/pathfinder/PathfinderThreadTabs';
import DocumentUploadPanel from '@/components/pathfinder/DocumentUploadPanel';
import FollowUpInput from '@/components/pathfinder/FollowUpInput';
import ProactiveSuggestions from '@/components/pathfinder/ProactiveSuggestions';
import PipeToModuleButton from '@/components/pathfinder/PipeToModuleButton';
import SmartActionBar from '@/components/pathfinder/SmartActionBar';
import PathfinderCostDisplay from '@/components/pathfinder/PathfinderCostDisplay';
import ImproveSearchPanel from '@/components/pathfinder/ImproveSearchPanel';
import { useSessionStore } from '@/stores/useSessionStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import {
  streamPathfinderSearch,
  streamPathfinderFollowUp,
  fetchSearchById,
  fetchThreads,
  createThread,
  updateThread,
  deleteThread,
  fetchDocuments,
  type SearchDepth,
  type SearchMode,
  type PathfinderEvent,
  type PathfinderThread,
  type PathfinderDocument,
  type PathfinderModelResult,
  type PathfinderWebSource,
} from '@/lib/pathfinder-api';

interface ModelStatus {
  modelId: string;
  role: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  durationMs?: number;
}

export default function PathfinderPage() {
  const [searchParams] = useSearchParams();
  const { areaId } = useSessionStore();
  const { location: userLocation } = useSettingsStore();
  const [query, setQuery] = useState('');
  const [depth, setDepth] = useState<SearchDepth>('quick');
  const [searchMode, setSearchMode] = useState<SearchMode>('knowledge');
  const [phase, setPhase] = useState<'idle' | 'searching' | 'synthesizing' | 'complete' | 'error'>('idle');
  const [synthesis, setSynthesis] = useState('');
  const [thinking, setThinking] = useState('');
  const [modelStatuses, setModelStatuses] = useState<ModelStatus[]>([]);
  const [modelResults, setModelResults] = useState<PathfinderModelResult[]>([]);
  const [webSources, setWebSources] = useState<PathfinderWebSource[]>([]);
  const [inputTokens, setInputTokens] = useState(0);
  const [outputTokens, setOutputTokens] = useState(0);
  const [costUsd, setCostUsd] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [searchId, setSearchId] = useState<string | null>(null);
  const [localSources, setLocalSources] = useState<PathfinderWebSource[]>([]);
  const [enrichedQuery, setEnrichedQuery] = useState<string>('');
  const [followUpSuggestions, setFollowUpSuggestions] = useState<string[]>([]);
  const [followUpText, setFollowUpText] = useState('');
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [preSearchReasoning, setPreSearchReasoning] = useState('');
  const [showImprove, setShowImprove] = useState(false);
  const [error, setError] = useState<string | undefined>();

  // Threads
  const [threads, setThreads] = useState<PathfinderThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

  // Documents
  const [documents, setDocuments] = useState<PathfinderDocument[]>([]);
  const [showDocPanel, setShowDocPanel] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  // Load threads + documents
  useEffect(() => {
    fetchThreads().then(r => setThreads(Array.isArray(r?.threads) ? r.threads : [])).catch(() => {});
  }, []);

  useEffect(() => {
    fetchDocuments(activeThreadId || undefined).then(r => setDocuments(Array.isArray(r?.documents) ? r.documents : [])).catch(() => {});
  }, [activeThreadId]);

  // Load search from URL param (for "Open in Pathfinder" flow)
  useEffect(() => {
    const sid = searchParams.get('searchId');
    if (sid) {
      fetchSearchById(sid).then(data => {
        const s = data.search;
        if (!s) return;
        setSearchId(sid);
        setQuery(s.query as string);
        setDepth((s.depth as SearchDepth) || 'quick');
        setSynthesis((s.synthesis as string) || '');
        setThinking((s.thinking as string) || '');
        setModelResults(Array.isArray(s.model_results) ? s.model_results : []);
        setWebSources(Array.isArray(s.web_sources) ? s.web_sources : []);
        setInputTokens((s.input_tokens as number) || 0);
        setOutputTokens((s.output_tokens as number) || 0);
        setCostUsd((s.cost_usd as number) || 0);
        setDurationMs((s.duration_ms as number) || 0);
        setPhase('complete');
      }).catch(() => {});
    }
  }, [searchParams]);

  const runSearch = useCallback(async (searchQuery?: string) => {
    const q = searchQuery || query;
    if (!q.trim()) return;

    // Reset state
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setPhase('searching');
    setSynthesis('');
    setThinking('');
    setModelStatuses([]);
    setModelResults([]);
    setWebSources([]);
    setLocalSources([]);
    setEnrichedQuery('');
    setError(undefined);
    setFollowUpSuggestions([]);
    setFollowUpText('');
    setPreSearchReasoning('');
    setInputTokens(0);
    setOutputTokens(0);
    setCostUsd(0);
    setDurationMs(0);
    setSearchId(null);

    const documentIds = documents.map(d => d.id);

    try {
      // Build location string for location-aware modes
      const locationStr = userLocation.city && userLocation.country
        ? `${userLocation.city}, ${userLocation.country}`
        : undefined;

      for await (const event of streamPathfinderSearch({
        query: q.trim(),
        depth,
        searchMode,
        threadId: activeThreadId,
        documentIds,
        activeAreaId: areaId || undefined,
        userLocation: locationStr,
      }, abortRef.current.signal)) {
        handleEvent(event);
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setPhase('error');
        setError(String(err));
      }
    }
  }, [query, depth, searchMode, activeThreadId, documents, areaId, userLocation]);

  function handleEvent(event: PathfinderEvent) {
    switch (event.type) {
      case 'search_start':
        setSearchId(event.searchId);
        break;
      case 'pre_search_reasoning':
        setPreSearchReasoning(event.reasoning);
        break;
      case 'model_start':
        setModelStatuses(prev => [...prev, { modelId: event.modelId, role: event.role, status: 'running' }]);
        break;
      case 'model_complete':
        setModelStatuses(prev => prev.map(m =>
          m.role === event.role && m.modelId === event.modelId
            ? { ...m, status: event.status === 'complete' ? 'complete' : 'error', durationMs: event.durationMs }
            : m
        ));
        break;
      case 'synthesis_start':
        setPhase('synthesizing');
        break;
      case 'text_delta':
        setSynthesis(prev => prev + event.content);
        break;
      case 'thinking_delta':
        setThinking(prev => prev + event.content);
        break;
      case 'search_complete':
        setPhase('complete');
        setWebSources(event.webSources);
        setLocalSources(event.localSources || []);
        setEnrichedQuery(event.enrichedQuery || '');
        setModelResults(event.modelResults);
        setInputTokens(event.inputTokens);
        setOutputTokens(event.outputTokens);
        setCostUsd(event.costUsd);
        setDurationMs(event.durationMs);
        setFollowUpSuggestions(event.followUpSuggestions || []);
        break;
      case 'error':
        setPhase('error');
        setError(event.message);
        break;
    }
  }

  const handleFollowUp = useCallback(async (question: string) => {
    if (!searchId) return;
    setFollowUpLoading(true);
    setFollowUpText('');

    try {
      const abort = new AbortController();
      for await (const event of streamPathfinderFollowUp(searchId, question, abort.signal)) {
        if (event.type === 'text_delta') {
          setFollowUpText(prev => prev + event.content);
        }
      }
    } catch { /* ignore */ }
    setFollowUpLoading(false);
  }, [searchId]);

  // Thread handlers
  async function handleCreateThread() {
    const t = await createThread();
    setThreads(prev => [{ ...t, pinned: 0, search_count: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, ...prev]);
    setActiveThreadId(t.id);
  }

  async function handleRenameThread(id: string, title: string) {
    await updateThread(id, { title });
    setThreads(prev => prev.map(t => t.id === id ? { ...t, title } : t));
  }

  async function handlePinThread(id: string, pinned: boolean) {
    await updateThread(id, { pinned });
    setThreads(prev => prev.map(t => t.id === id ? { ...t, pinned: pinned ? 1 : 0 } : t));
  }

  async function handleDeleteThread(id: string) {
    await deleteThread(id);
    setThreads(prev => prev.filter(t => t.id !== id));
    if (activeThreadId === id) setActiveThreadId(null);
  }

  function handleSuggestionSearch(q: string) {
    setQuery(q);
    runSearch(q);
  }

  return (
    <div className="space-y-6 px-6 py-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Compass className="h-6 w-6 text-adv-teal" />
        <div>
          <h1 className="text-lg font-semibold text-adv-white">Pathfinder</h1>
          <p className="text-xs text-adv-gray">Search that thinks before it answers. You're never the product.</p>
        </div>
      </div>

      {/* Thread tabs */}
      <PathfinderThreadTabs
        threads={threads}
        activeThreadId={activeThreadId}
        onSelect={setActiveThreadId}
        onCreate={handleCreateThread}
        onRename={handleRenameThread}
        onPin={handlePinThread}
        onDelete={handleDeleteThread}
      />

      {/* Search bar + depth selector */}
      <div className="space-y-3">
        <form
          onSubmit={e => { e.preventDefault(); runSearch(); }}
          className="flex items-center gap-2"
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-adv-gray" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search that thinks before it answers..."
              className="w-full rounded-xl border border-border bg-adv-dark pl-10 pr-4 py-3 text-sm text-adv-off-white placeholder:text-adv-gray/50 focus:border-adv-teal focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowImprove(true)}
            disabled={!query.trim() || phase === 'searching' || phase === 'synthesizing' || showImprove}
            className="rounded-xl border border-adv-teal/50 px-3 py-3 text-adv-teal hover:bg-adv-teal/10 transition-colors disabled:opacity-40"
            title="Improve my search"
          >
            <Sparkles className="h-4 w-4" />
          </button>
          <button
            type="submit"
            disabled={!query.trim() || phase === 'searching' || phase === 'synthesizing'}
            className="rounded-xl bg-adv-teal px-5 py-3 text-sm font-medium text-adv-dark transition-colors hover:bg-adv-teal-dark disabled:opacity-40"
          >
            Search
          </button>
        </form>

        {/* Search mode toggles */}
        <SearchModeSelector
          value={searchMode}
          onChange={setSearchMode}
          disabled={phase === 'searching' || phase === 'synthesizing'}
        />

        <div className="flex items-center justify-between">
          <DepthSelector value={depth} onChange={setDepth} disabled={phase === 'searching' || phase === 'synthesizing'} />
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowDocPanel(!showDocPanel)}
              className={`text-xs px-2 py-1 rounded-lg border transition-colors ${
                showDocPanel || documents.length > 0
                  ? 'border-adv-teal/30 text-adv-teal'
                  : 'border-border text-adv-gray hover:text-adv-off-white'
              }`}
            >
              {documents.length > 0 ? `${documents.length} doc${documents.length > 1 ? 's' : ''}` : 'Add docs'}
            </button>
          </div>
        </div>
      </div>

      {/* Document upload panel */}
      {showDocPanel && (
        <DocumentUploadPanel
          documents={documents}
          threadId={activeThreadId || undefined}
          onDocumentsChange={() => fetchDocuments(activeThreadId || undefined).then(r => setDocuments(r.documents))}
        />
      )}

      {/* Improve my search wizard */}
      {showImprove && query.trim() && (
        <ImproveSearchPanel
          query={query}
          currentMode={searchMode}
          currentDepth={depth}
          onImproved={(improvedQuery, sugMode, sugDepth) => {
            setQuery(improvedQuery);
            if (sugMode) setSearchMode(sugMode);
            if (sugDepth) setDepth(sugDepth);
            setShowImprove(false);
          }}
          onCancel={() => setShowImprove(false)}
        />
      )}

      {/* Proactive suggestions (when idle) */}
      {phase === 'idle' && !showImprove && (
        <ProactiveSuggestions onSearch={handleSuggestionSearch} />
      )}

      {/* Results panel */}
      <PathfinderResultPanel
        phase={phase}
        depth={depth}
        synthesis={synthesis}
        thinking={thinking}
        preSearchReasoning={preSearchReasoning}
        modelStatuses={modelStatuses}
        modelResults={modelResults}
        webSources={webSources}
        localSources={localSources}
        enrichedQuery={enrichedQuery}
        inputTokens={inputTokens}
        outputTokens={outputTokens}
        costUsd={costUsd}
        durationMs={durationMs}
        error={error}
      />

      {/* Smart Action Bar (after complete) */}
      {phase === 'complete' && synthesis && (
        <div className="space-y-3">
          <SmartActionBar
            synthesis={synthesis}
            searchMode={searchMode}
            query={query}
            searchId={searchId}
          />
          <div className="flex items-center gap-2">
            <PipeToModuleButton text={synthesis} searchId={searchId} />
          </div>
        </div>
      )}

      {/* Follow-up */}
      {phase === 'complete' && searchId && (
        <div className="space-y-3">
          {followUpText && (
            <div className="rounded-xl border border-border bg-adv-card p-5">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-adv-gray">
                <Sparkles className="h-3 w-3 text-adv-teal" />
                Follow-up
              </div>
              <div className="prose prose-invert prose-xs max-w-none text-adv-off-white text-[13px] leading-relaxed">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{followUpText}</ReactMarkdown>
              </div>
            </div>
          )}
          <FollowUpInput
            onSubmit={handleFollowUp}
            isLoading={followUpLoading}
            suggestions={followUpSuggestions}
          />
        </div>
      )}

      {/* Cost breakdown (after complete with multiple models) */}
      {phase === 'complete' && modelResults.length > 1 && (
        <PathfinderCostDisplay
          modelResults={modelResults}
          totalInputTokens={inputTokens}
          totalOutputTokens={outputTokens}
          totalCostUsd={costUsd}
          totalDurationMs={durationMs}
        />
      )}
    </div>
  );
}
