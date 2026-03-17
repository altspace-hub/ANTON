import { useState, useEffect } from 'react';
import { Lightbulb, X, RefreshCw, Search } from 'lucide-react';
import { fetchSuggestions, dismissSuggestion, refreshSuggestions, type PathfinderSuggestion } from '@/lib/pathfinder-api';

interface ProactiveSuggestionsProps {
  onSearch: (query: string) => void;
  compact?: boolean;
}

export default function ProactiveSuggestions({ onSearch, compact = false }: ProactiveSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<PathfinderSuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchSuggestions().then(r => setSuggestions(Array.isArray(r?.suggestions) ? r.suggestions : [])).catch(() => {});
  }, []);

  async function handleDismiss(id: string) {
    setSuggestions(prev => prev.filter(s => s.id !== id));
    await dismissSuggestion(id);
  }

  async function handleRefresh() {
    setLoading(true);
    try {
      const r = await refreshSuggestions();
      setSuggestions(Array.isArray(r?.suggestions) ? r.suggestions : []);
    } catch { /* ignore */ }
    setLoading(false);
  }

  if (suggestions.length === 0) return null;

  if (compact) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {suggestions.slice(0, 2).map(s => (
          <button
            key={s.id}
            onClick={() => onSearch(s.query)}
            className="flex items-center gap-1.5 rounded-full border border-adv-teal/15 bg-adv-teal/5 px-3 py-1 text-xs text-adv-teal hover:bg-adv-teal/10 transition-colors"
          >
            <Lightbulb className="h-3 w-3" />
            {s.query}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-adv-gold/15 bg-adv-gold/5 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-adv-gold">
          <Lightbulb className="h-3.5 w-3.5" />
          You might want to know
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="text-adv-gray hover:text-adv-off-white transition-colors"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <div className="space-y-1.5">
        {suggestions.map(s => (
          <div key={s.id} className="flex items-center gap-2 group">
            <button
              onClick={() => onSearch(s.query)}
              className="flex-1 flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-adv-off-white hover:bg-adv-card/50 transition-colors text-left"
            >
              <Search className="h-3 w-3 text-adv-teal shrink-0" />
              <div>
                <div className="font-medium">{s.query}</div>
                {s.context && <div className="text-[10px] text-adv-gray mt-0.5">{s.context}</div>}
              </div>
            </button>
            <button
              onClick={() => handleDismiss(s.id)}
              className="opacity-0 group-hover:opacity-100 text-adv-gray hover:text-adv-red transition-all shrink-0"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
