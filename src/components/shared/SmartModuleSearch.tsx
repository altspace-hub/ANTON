/**
 * SmartModuleSearch.tsx
 *
 * AI-powered natural-language module finder for the Dashboard.
 * User describes their need in plain English; Claude Haiku picks
 * the 3 most relevant modules and explains why.
 */

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Sparkles, Send, ArrowRight, Loader2, RotateCcw } from 'lucide-react';
import { MODULES, AREAS } from '@/lib/constants';
import { getAuthHeader } from '@/lib/api';

interface ModuleMatch {
  moduleId: string;
  label: string;
  reason: string;
}

// Compact module colour palette (mirrors Dashboard)
const colorMap: Record<string, string> = {
  'adv-teal':  'bg-adv-teal/10 text-adv-teal',
  'adv-blue':  'bg-adv-blue/10 text-adv-blue',
  'adv-gold':  'bg-adv-gold/10 text-adv-gold',
  'adv-green': 'bg-adv-green/10 text-adv-green',
  'adv-red':   'bg-adv-red/10 text-adv-red',
};

const iconComponents: Record<string, React.ComponentType<{ className?: string }>> = {};

// Lazy-populate icon components from the global Lucide set already bundled by Sidebar
// (avoids a second import of every icon)
function getIcon(name: string): React.ComponentType<{ className?: string }> | null {
  if (iconComponents[name]) return iconComponents[name];
  return null;
}

export default function SmartModuleSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<ModuleMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState('');

  async function handleSearch() {
    const q = query.trim();
    if (!q || loading) return;
    setLoading(true);
    setHasSearched(true);
    setError('');
    setMatches([]);

    try {
      // The server ranks against its own full module catalog — no client list needed.
      const res = await fetch('/api/modules/smart-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ query: q }),
      });
      if (!res.ok) {
        setError('Could not reach the AI. Check that your API key is configured.');
        return;
      }
      const data = await res.json() as ModuleMatch[];
      setMatches(Array.isArray(data) ? data.slice(0, 3) : []);
    } catch {
      setError('Network error — please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSearch();
    }
  }

  function reset() {
    setQuery('');
    setMatches([]);
    setHasSearched(false);
    setError('');
  }

  const EXAMPLE_PROMPTS = [
    'Review a contract for hidden risks',
    'Identify gaps in our AML policy',
    'Create a training deck for new staff',
    'Analyse ESG risks in our supply chain',
    'Build a cash flow forecast for my market stall',
  ];

  return (
    <div className="mb-8 rounded-xl border border-adv-teal/20 bg-adv-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-adv-teal" />
          <span className="text-xs font-semibold uppercase tracking-wider text-adv-teal">
            Find the right module
          </span>
        </div>
        {hasSearched && (
          <button
            onClick={reset}
            className="flex items-center gap-1 text-xs text-adv-gray hover:text-adv-teal transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
            New search
          </button>
        )}
      </div>

      <div className="px-5 py-4">
        {/* Input */}
        {!hasSearched && (
          <>
            <p className="mb-3 text-sm text-adv-gray">
              Describe what you need help with in plain language — Claude will find the right modules for you.
            </p>
            {/* Example prompts */}
            <div className="mb-3 flex flex-wrap gap-2">
              {EXAMPLE_PROMPTS.map((ex) => (
                <button
                  key={ex}
                  onClick={() => setQuery(ex)}
                  className="rounded-full border border-border bg-adv-dark px-3 py-1 text-[11px] text-adv-gray hover:border-adv-teal/40 hover:text-adv-teal transition-colors"
                >
                  {ex}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="flex gap-2">
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g. I need to do a gap analysis against the new AML regulation…"
            rows={2}
            className="flex-1 resize-none rounded-xl border border-border bg-adv-dark px-4 py-3 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:ring-1 focus:ring-adv-teal"
          />
          <button
            onClick={handleSearch}
            disabled={!query.trim() || loading}
            className="flex h-full items-center gap-2 rounded-xl bg-adv-teal px-4 py-3 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-40 transition-colors"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {loading ? 'Searching…' : 'Find'}
          </button>
        </div>

        {/* Error */}
        {error && (
          <p className="mt-3 text-xs text-adv-red">{error}</p>
        )}

        {/* Results */}
        {matches.length > 0 && (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {matches.map((match, i) => {
              const mod = MODULES.find(m => m.id === match.moduleId);
              const area = mod
                ? AREAS.find(a => (a.moduleIds as readonly string[]).includes(mod.id))
                : undefined;
              const colorClass = mod ? (colorMap[mod.color] ?? colorMap['adv-teal']) : colorMap['adv-teal'];

              return (
                <button
                  key={match.moduleId}
                  onClick={() => navigate(`/module/${match.moduleId}`)}
                  className="group flex flex-col gap-2 rounded-xl border border-border bg-adv-dark-2 p-4 text-left hover:border-adv-teal/40 hover:shadow-md transition-all"
                >
                  <div className="flex items-center gap-2">
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold ${colorClass}`}>
                      {i + 1}
                    </span>
                    <span className="text-sm font-semibold text-adv-white leading-tight">
                      {match.label || mod?.label || match.moduleId}
                    </span>
                  </div>
                  {area && (
                    <span className="inline-block rounded-full bg-adv-dark px-2 py-0.5 text-xs text-adv-gray">
                      {area.shortLabel}
                    </span>
                  )}
                  <p className="text-xs leading-relaxed text-adv-gray">{match.reason}</p>
                  <div className="mt-auto flex items-center gap-1 text-xs font-medium text-adv-teal group-hover:underline">
                    Open module <ArrowRight className="h-3 w-3" />
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* No results */}
        {hasSearched && !loading && matches.length === 0 && !error && (
          <div className="mt-4 rounded-xl border border-border bg-adv-dark-2 px-4 py-6 text-center">
            <p className="text-sm text-adv-gray">No modules matched — try rephrasing your need.</p>
            <button
              onClick={() => navigate('/discover')}
              className="mt-2 flex items-center gap-1 mx-auto text-xs text-adv-teal hover:underline"
            >
              Try the full Discovery wizard <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Footer link to full discovery */}
        <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
          <p className="text-[11px] text-adv-gray">
            Powered by Claude Haiku · results in ~2 seconds
          </p>
          <Link
            to="/discover"
            className="flex items-center gap-1 text-xs text-adv-teal hover:underline"
          >
            Full AI Discovery session <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}
