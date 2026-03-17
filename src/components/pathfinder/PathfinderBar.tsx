/**
 * PathfinderBar — Homepage search widget
 * Quick mode only. "Open in Pathfinder" for deeper exploration.
 * Includes search history dropdown on focus.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ComponentPropsWithoutRef } from 'react';
import { Compass, Search, ArrowRight, Loader2, ExternalLink, Globe, Clock } from 'lucide-react';

function MdLink(props: ComponentPropsWithoutRef<'a'>) {
  return <a {...props} target="_blank" rel="noopener noreferrer" className="text-adv-teal hover:underline" />;
}
const mdComponents = { a: MdLink };
import {
  streamPathfinderSearch,
  fetchSearchHistory,
  type PathfinderEvent,
  type PathfinderWebSource,
  type SearchMode,
} from '@/lib/pathfinder-api';
import SearchModeSelector from './SearchModeSelector';
import ProactiveSuggestions from './ProactiveSuggestions';

interface RecentSearch {
  id: string;
  query: string;
  created_at: string;
}

export default function PathfinderBar() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [phase, setPhase] = useState<'idle' | 'searching' | 'complete'>('idle');
  const [synthesis, setSynthesis] = useState('');
  const [webSources, setWebSources] = useState<PathfinderWebSource[]>([]);
  const [searchId, setSearchId] = useState<string | null>(null);
  const [searchMode, setSearchMode] = useState<SearchMode>('knowledge');
  const [showHistory, setShowHistory] = useState(false);
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);

  // Load recent searches when input is focused
  function handleFocus() {
    setShowHistory(true);
    fetchSearchHistory(8, 0)
      .then(r => setRecentSearches(Array.isArray(r?.searches) ? r.searches as unknown as RecentSearch[] : []))
      .catch(() => {});
  }

  // Close history dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        historyRef.current && !historyRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setShowHistory(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const runSearch = useCallback(async (searchQuery?: string) => {
    const q = searchQuery || query;
    if (!q.trim()) return;

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setPhase('searching');
    setSynthesis('');
    setWebSources([]);
    setSearchId(null);
    setShowHistory(false);

    try {
      for await (const event of streamPathfinderSearch(
        { query: q.trim(), depth: 'quick', searchMode },
        abortRef.current.signal,
      )) {
        switch (event.type) {
          case 'search_start':
            setSearchId(event.searchId);
            break;
          case 'text_delta':
            setSynthesis(prev => prev + event.content);
            break;
          case 'search_complete':
            setPhase('complete');
            setWebSources(event.webSources || []);
            break;
          case 'error':
            setPhase('idle');
            break;
        }
      }
    } catch {
      setPhase('idle');
    }
  }, [query, searchMode]);

  function handleOpenInPathfinder() {
    if (searchId) {
      navigate(`/pathfinder?searchId=${searchId}`);
    } else {
      navigate(`/pathfinder`);
    }
  }

  function handleSuggestionSearch(q: string) {
    setQuery(q);
    runSearch(q);
  }

  function handleHistoryClick(search: RecentSearch) {
    setQuery(search.query);
    setShowHistory(false);
    navigate(`/pathfinder?searchId=${search.id}`);
  }

  return (
    <div className="mb-8">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Compass className="h-4 w-4 text-adv-teal" />
          <h2 className="text-sm font-semibold text-adv-teal uppercase tracking-wider">Pathfinder</h2>
        </div>
        <button
          onClick={() => navigate('/pathfinder')}
          className="flex items-center gap-1 text-xs text-adv-teal hover:underline"
        >
          Open full search <ArrowRight className="h-3 w-3" />
        </button>
      </div>

      {/* Search input */}
      <form
        onSubmit={e => { e.preventDefault(); runSearch(); }}
        className="relative"
      >
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-adv-gray" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={handleFocus}
          placeholder="Search that thinks before it answers..."
          className="w-full rounded-xl border border-border bg-adv-dark pl-10 pr-24 py-3 text-sm text-adv-off-white placeholder:text-adv-gray/50 focus:border-adv-teal focus:outline-none"
        />
        <button
          type="submit"
          disabled={!query.trim() || phase === 'searching'}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-40 transition-colors"
        >
          {phase === 'searching' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Search'}
        </button>

        {/* Search history dropdown */}
        {showHistory && recentSearches.length > 0 && phase === 'idle' && (
          <div
            ref={historyRef}
            className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border border-border bg-adv-dark-2 shadow-xl overflow-hidden"
          >
            <div className="px-3 py-1.5 text-[10px] text-adv-gray font-medium uppercase tracking-wider border-b border-border">
              Recent Searches
            </div>
            {recentSearches.map(s => (
              <button
                key={s.id}
                onClick={() => handleHistoryClick(s)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-adv-off-white hover:bg-adv-card transition-colors"
              >
                <Clock className="h-3 w-3 text-adv-gray shrink-0" />
                <span className="truncate flex-1">{s.query}</span>
                <span className="text-[10px] text-adv-gray shrink-0">
                  {new Date(s.created_at).toLocaleDateString()}
                </span>
              </button>
            ))}
          </div>
        )}
      </form>

      {/* Mode selector (compact — icons only) */}
      <div className="mt-2">
        <SearchModeSelector value={searchMode} onChange={setSearchMode} compact />
      </div>

      {/* Manifesto line */}
      <p className="mt-1.5 text-center text-[10px] text-adv-gray/50">
        Your search. Your data. No ads. No agenda.
      </p>

      {/* Suggestions when idle */}
      {phase === 'idle' && !showHistory && (
        <div className="mt-3">
          <ProactiveSuggestions onSearch={handleSuggestionSearch} compact />
        </div>
      )}

      {/* Compact results */}
      {(phase === 'searching' || phase === 'complete') && (
        <div className="mt-3 rounded-xl border border-border bg-adv-card p-4">
          {phase === 'searching' && !synthesis && (
            <div className="flex items-center gap-2 text-sm text-adv-teal">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching...
            </div>
          )}

          {synthesis && (
            <div className="prose prose-invert prose-sm max-w-none text-adv-off-white line-clamp-6">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{synthesis}</ReactMarkdown>
              {phase === 'searching' && <span className="inline-block w-1.5 h-4 bg-adv-teal animate-pulse ml-0.5" />}
            </div>
          )}

          {/* Source badges */}
          {webSources.length > 0 && (
            <div className="mt-2 flex items-center gap-2 text-[10px] text-adv-gray">
              <Globe className="h-3 w-3" />
              {webSources.length} source{webSources.length !== 1 ? 's' : ''}
              {webSources.slice(0, 3).map((s, i) => (
                <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-0.5 text-adv-teal/60 hover:text-adv-teal">
                  <ExternalLink className="h-2.5 w-2.5" />
                  {new URL(s.url).hostname.replace('www.', '')}
                </a>
              ))}
            </div>
          )}

          {/* Go deeper button */}
          {phase === 'complete' && (
            <button
              onClick={handleOpenInPathfinder}
              className="mt-3 flex items-center gap-1.5 text-xs text-adv-teal hover:underline"
            >
              <Compass className="h-3 w-3" />
              Open in Pathfinder — go deeper
              <ArrowRight className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
