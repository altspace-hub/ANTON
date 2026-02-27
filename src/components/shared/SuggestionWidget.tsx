import React, { useEffect, useState } from 'react';
import { Lightbulb, ExternalLink, AlertCircle, RefreshCw } from 'lucide-react';
import { getAuthHeader } from '../../lib/api';

interface Suggestion {
  id: string;
  priority: 'high' | 'medium' | 'low';
  type: 'deadline' | 'quality' | 'radar' | 'workflow' | 'followup';
  title: string;
  description: string;
  actionUrl?: string;
  actionLabel?: string;
  createdAt: string;
}

const PRIORITY_DOT: Record<Suggestion['priority'], string> = {
  high:   'bg-adv-red',
  medium: 'bg-adv-gold',
  low:    'bg-yellow-500',
};

const PRIORITY_LABEL: Record<Suggestion['priority'], string> = {
  high:   'High',
  medium: 'Medium',
  low:    'Low',
};

export default function SuggestionWidget() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  async function fetchSuggestions() {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/suggestions', { headers: { ...getAuthHeader() } });
      if (!res.ok) {
        setSuggestions([]);
        return;
      }
      const data = await res.json() as Suggestion[];
      setSuggestions(Array.isArray(data) ? data.slice(0, 3) : []);
    } catch {
      setError(true);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void fetchSuggestions(); }, []);

  return (
    <div className="bg-adv-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-adv-teal-dim">
            <Lightbulb className="w-4 h-4 text-adv-teal" />
          </div>
          <h3 className="font-semibold text-adv-off-white">Suggestions</h3>
        </div>
        <button
          onClick={() => void fetchSuggestions()}
          disabled={loading}
          className="p-1.5 rounded-lg text-adv-gray hover:text-adv-teal hover:bg-adv-teal-dim transition-colors disabled:opacity-50"
          title="Refresh suggestions"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-lg bg-adv-dark-2 animate-pulse" />
          ))}
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-adv-dark-2 text-adv-gray-med text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>Could not load suggestions.</span>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && suggestions.length === 0 && (
        <div className="py-6 text-center">
          <Lightbulb className="w-8 h-8 text-adv-gray-med mx-auto mb-2 opacity-40" />
          <p className="text-sm text-adv-gray-med">No suggestions right now.</p>
          <p className="text-xs text-adv-gray-med mt-1">Check back after running some analyses.</p>
        </div>
      )}

      {/* Suggestion cards */}
      {!loading && !error && suggestions.length > 0 && (
        <div className="space-y-3">
          {suggestions.map((s) => (
            <div
              key={s.id}
              className="p-3.5 rounded-lg bg-adv-dark-2 border border-border hover:border-adv-teal/30 transition-colors"
            >
              <div className="flex items-start gap-3">
                {/* Priority dot */}
                <span
                  className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${PRIORITY_DOT[s.priority]}`}
                  title={`${PRIORITY_LABEL[s.priority]} priority`}
                />

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-adv-off-white leading-snug">{s.title}</p>
                  <p className="text-xs text-adv-gray mt-1 leading-relaxed">{s.description}</p>

                  {s.actionUrl && s.actionLabel && (
                    <a
                      href={s.actionUrl}
                      className="inline-flex items-center gap-1 mt-2 text-xs text-adv-teal hover:text-adv-teal-dark font-medium transition-colors"
                    >
                      {s.actionLabel}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
