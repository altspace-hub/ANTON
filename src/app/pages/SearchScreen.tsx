/**
 * SearchScreen — Pathfinder-powered research assistant.
 * Simplified version of the full Pathfinder for mobile.
 */

import { useState } from 'react';
import { fetchWithAuth } from '../services/api';
import ChatBubble from '../components/ChatBubble';

interface Props { orgId: string; }

const MODES = [
  { id: 'knowledge', label: '🎓 Knowledge', desc: 'Deep research' },
  { id: 'local', label: '📍 Local', desc: 'Nearby places' },
  { id: 'news', label: '📰 News', desc: 'Current events' },
  { id: 'shopping', label: '🛒 Shopping', desc: 'Products & prices' },
];

export default function SearchScreen({ orgId }: Props) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState('knowledge');
  const [result, setResult] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  async function handleSearch() {
    if (!query.trim() || searching) return;
    setSearching(true);
    setResult(null);
    try {
      // Use the org's AI endpoint for search-like queries
      const serverBase = localStorage.getItem('anton-companion-server') || '';
      const res = await fetch(`${serverBase}/api/app/org/${orgId}/query-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-app-session': localStorage.getItem('anton-companion-session') || '',
        },
        body: JSON.stringify({
          message: `[${mode} search] ${query.trim()}`,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setResult(data.text || 'No results found');
      }
    } catch {
      setResult('Search failed. Please try again.');
    }
    setSearching(false);
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-2xl px-4 py-5 space-y-4">
        <h1 className="text-lg font-bold text-adv-off-white">Research</h1>

        {/* Mode selector */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {MODES.map(m => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`shrink-0 rounded-lg border px-3 py-2 text-xs transition ${
                mode === m.id ? 'border-adv-teal bg-adv-teal/10 text-adv-teal' : 'border-border bg-adv-card text-adv-gray'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Search input */}
        <div className="flex gap-2">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="What do you want to research?"
            className="flex-1 rounded-lg border border-border bg-adv-card px-4 py-3 text-sm text-adv-off-white placeholder-adv-gray/50 focus:border-adv-teal focus:outline-none"
          />
          <button onClick={handleSearch} disabled={searching || !query.trim()} className="rounded-lg bg-adv-teal px-4 py-3 text-sm font-medium text-adv-dark disabled:opacity-40">
            {searching ? '...' : '🔍'}
          </button>
        </div>

        {/* Results */}
        {searching && (
          <div className="flex items-center gap-2 py-8 justify-center">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-adv-teal border-t-transparent" />
            <span className="text-sm text-adv-gray">Researching...</span>
          </div>
        )}

        {result && !searching && (
          <ChatBubble role="assistant" content={result} timestamp={Date.now()} />
        )}
      </div>
    </div>
  );
}
