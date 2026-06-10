// ── PathfinderVisitorPage.tsx ──────────────────────────────────────────────
// The visitor-focused Pathfinder discovery surface at /pathfinder/discover
// (the search engine itself owns /pathfinder). Browses the local portal
// directory; every click is a bookmark target and every result carries
// feedback buttons that federate back to the engine.

import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Sparkles, Bookmark, ThumbsUp, ThumbsDown, AlertTriangle, Flag } from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';
import { useBookmarksStore } from '@/stores/useBookmarksStore';

type Mode = 'all' | 'anton-portal' | 'people' | 'bundles' | 'jobs' | 'marketplace' | 'content';

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'all',          label: 'All',         hint: 'All sources' },
  { id: 'anton-portal', label: 'Portals',     hint: 'ANTON portals only. Capability fit ranked.' },
  { id: 'people',       label: 'People',      hint: 'Contacts on ANTON. No emails unless public.' },
  { id: 'bundles',      label: 'Bundles',     hint: '.anton bundles. Signature + install count ranked.' },
  { id: 'jobs',         label: 'Jobs',        hint: 'Open jobs. Salary range always shown.' },
  { id: 'marketplace',  label: 'Marketplace', hint: 'For purchase or free install. FutureChain pricing.' },
  { id: 'content',      label: 'Content',     hint: 'Videos, articles, lessons. Creator-owned.' },
];

interface VisitorResult {
  id: string;
  ref: string;                  // portal address / bundle id / job id / etc.
  label: string;
  description: string;
  primary_action?: { label: string; route: string };
}

const RECENT_KEY = 'pathfinder_visitor_recents';

function getRecents(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
}

function pushRecent(q: string): void {
  try {
    const cur = getRecents().filter(x => x !== q);
    cur.unshift(q);
    localStorage.setItem(RECENT_KEY, JSON.stringify(cur.slice(0, 8)));
  } catch { /* quota */ }
}

export default function PathfinderVisitorPage() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [mode, setMode] = useState<Mode>((params.get('mode') as Mode) ?? 'all');
  const [recents, setRecents] = useState<string[]>(getRecents());
  const [trending, setTrending] = useState<Array<{ query_hash: string; count: number }>>([]);
  const [results, setResults] = useState<VisitorResult[]>([]);
  const [searchId, setSearchId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState<Record<string, string>>({});

  const { isPortalBookmarked, add } = useBookmarksStore();

  useEffect(() => {
    let cancelled = false;
    async function loadTrending() {
      try {
        const res = await fetchWithAuth('/api/pathfinder/trending?since=24h&limit=8');
        if (!res.ok) return;
        const json = await res.json() as { trending: Array<{ query_hash: string; count: number }> };
        if (!cancelled) setTrending(json.trending ?? []);
      } catch { /* silent */ }
    }
    void loadTrending();
    return () => { cancelled = true; };
  }, []);

  // Initial search from URL query params.
  useEffect(() => {
    const q = params.get('q');
    if (q && q.trim().length > 0) {
      void runSearch(q.trim(), (params.get('mode') as Mode) ?? 'all');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runSearch(q: string, m: Mode) {
    setLoading(true);
    setResults([]);
    setSearchId(null);
    setFeedbackSent({});
    try {
      // Record the search (feeds the trending aggregate + feedback wiring).
      const res = await fetchWithAuth('/api/pathfinder/visitor-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, mode: m === 'all' ? 'anton-portal' : m, result_count: 0 }),
      });
      if (res.ok) {
        const json = await res.json() as { search_id?: string };
        if (json.search_id) setSearchId(json.search_id);
      }

      // Pull portals matching the text query from the local public directory.
      const portalsRes = await fetchWithAuth(`/api/portals/public-directory?limit=20`);
      const portalsJson = portalsRes.ok
        ? await portalsRes.json() as { entries: Array<{ portal_address: string; display_title: string | null; category: string }> }
        : { entries: [] };
      const hits = (portalsJson.entries ?? [])
        .filter(p => q.trim().length === 0 ||
          (p.display_title ?? '').toLowerCase().includes(q.toLowerCase()) ||
          p.portal_address.toLowerCase().includes(q.toLowerCase()))
        .slice(0, 10);
      const mapped: VisitorResult[] = hits.map(p => ({
        id: p.portal_address,
        ref: p.portal_address,
        label: p.display_title ?? p.portal_address,
        description: `${p.portal_address} · ${p.category}`,
        primary_action: { label: 'Visit', route: `/portals/p/${encodeURIComponent(p.portal_address)}` },
      }));
      setResults(mapped);
      pushRecent(q);
      setRecents(getRecents());
    } catch (err) {
      console.error('[pathfinder-visitor] search error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function sendFeedback(result: VisitorResult, signal: 'helpful' | 'wrong-match' | 'low-quality' | 'spam') {
    try {
      await fetchWithAuth('/api/pathfinder/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ search_id: searchId, result_ref: result.ref, signal }),
      });
      setFeedbackSent(prev => ({ ...prev, [result.id]: signal }));
    } catch { /* silent */ }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setParams({ q: query.trim(), mode });
    void runSearch(query.trim(), mode);
  }

  function bookmarkResult(r: VisitorResult) {
    add({
      bookmark_type: 'route',
      target_route: r.primary_action?.route ?? `/portals/p/${encodeURIComponent(r.ref)}`,
      label: r.label,
      icon_ref: 'Compass',
    }).catch(() => { /* swallow — user already has a bookmark with this target */ });
  }

  const displayMode = useMemo(() => MODES.find(m => m.id === mode) ?? MODES[0], [mode]);

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <header className="flex items-center gap-3">
          <Sparkles size={22} className="text-adv-teal" />
          <div>
            <h1 className="text-2xl font-semibold">Discover</h1>
            <p className="text-xs text-adv-gray">
              Browse the ANTON network directory.{' '}
              <Link to="/pathfinder" className="text-adv-teal hover:underline">Open Pathfinder search</Link>
            </p>
          </div>
        </header>

        <form onSubmit={submit} className="space-y-3">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-adv-gray" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search portals, people, things…"
                className="w-full bg-adv-card border border-border rounded-lg pl-10 pr-4 py-3 text-adv-off-white outline-none focus:ring-1 focus:ring-adv-teal"
                aria-label="Pathfinder search"
              />
            </div>
            <button type="submit" className="px-5 py-3 bg-adv-teal text-adv-dark rounded-lg font-medium">
              Search
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {MODES.map(m => (
              <button
                type="button"
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`px-3 py-1.5 rounded-full text-xs transition ${
                  mode === m.id
                    ? 'bg-adv-teal text-adv-dark'
                    : 'bg-adv-card text-adv-off-white hover:bg-adv-card/80'
                }`}
                title={m.hint}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-adv-gray">{displayMode.hint}</p>
        </form>

        {!loading && results.length === 0 && (
          <div className="grid md:grid-cols-2 gap-4">
            {recents.length > 0 && (
              <section className="rounded-lg border border-border bg-adv-card p-4">
                <div className="text-sm font-medium mb-2">Recent searches</div>
                <ul className="space-y-1">
                  {recents.map(r => (
                    <li key={r}>
                      <button
                        onClick={() => { setQuery(r); setParams({ q: r, mode }); void runSearch(r, mode); }}
                        className="text-sm text-adv-teal hover:underline"
                      >
                        {r}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {trending.length > 0 && (
              <section className="rounded-lg border border-border bg-adv-card p-4">
                <div className="text-sm font-medium mb-2">Trending today</div>
                <ul className="space-y-1 text-xs text-adv-gray">
                  {trending.map((t, i) => (
                    <li key={t.query_hash}>#{i + 1} · {t.count} searches · <code className="text-[10px]">{t.query_hash.slice(0, 8)}…</code></li>
                  ))}
                </ul>
                <p className="text-[10px] text-adv-gray mt-2">
                  Raw queries are hashed per user; only aggregates surface here.
                </p>
              </section>
            )}
          </div>
        )}

        {loading && <div className="text-adv-gray">Searching…</div>}

        {!loading && results.length > 0 && (
          <div className="space-y-3">
            <div className="text-sm text-adv-gray">{results.length} result{results.length === 1 ? '' : 's'}</div>
            {results.map((r, i) => {
              const bookmarkedFlag = r.primary_action?.route.startsWith('/portals/p/')
                ? isPortalBookmarked(r.ref)
                : false;
              const sent = feedbackSent[r.id];
              return (
                <article key={r.id} className="rounded-lg border border-border bg-adv-card p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="text-xs text-adv-gray">#{i + 1}</div>
                      <div className="text-base font-medium text-adv-off-white">{r.label}</div>
                      <div className="text-sm text-adv-gray">{r.description}</div>
                    </div>
                    <button
                      onClick={() => bookmarkResult(r)}
                      className={`p-2 rounded transition ${bookmarkedFlag ? 'text-adv-teal' : 'text-adv-gray hover:text-adv-teal'}`}
                      title={bookmarkedFlag ? 'Bookmarked' : 'Add bookmark'}
                    >
                      <Bookmark size={16} fill={bookmarkedFlag ? 'currentColor' : 'none'} />
                    </button>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    {r.primary_action && (
                      <Link
                        to={r.primary_action.route}
                        className="px-3 py-1.5 bg-adv-teal text-adv-dark rounded text-xs font-medium"
                      >
                        {r.primary_action.label}
                      </Link>
                    )}
                    <div className="ml-auto flex items-center gap-1">
                      <button
                        onClick={() => sendFeedback(r, 'helpful')}
                        className={`p-1.5 rounded text-xs ${sent === 'helpful' ? 'text-adv-green' : 'text-adv-gray hover:text-adv-green'}`}
                        title="Helpful"
                      ><ThumbsUp size={14} /></button>
                      <button
                        onClick={() => sendFeedback(r, 'wrong-match')}
                        className={`p-1.5 rounded text-xs ${sent === 'wrong-match' ? 'text-adv-gold' : 'text-adv-gray hover:text-adv-gold'}`}
                        title="Wrong match"
                      ><ThumbsDown size={14} /></button>
                      <button
                        onClick={() => sendFeedback(r, 'low-quality')}
                        className={`p-1.5 rounded text-xs ${sent === 'low-quality' ? 'text-adv-red' : 'text-adv-gray hover:text-adv-red'}`}
                        title="Low quality"
                      ><AlertTriangle size={14} /></button>
                      <button
                        onClick={() => sendFeedback(r, 'spam')}
                        className={`p-1.5 rounded text-xs ${sent === 'spam' ? 'text-adv-red' : 'text-adv-gray hover:text-adv-red'}`}
                        title="Spam"
                      ><Flag size={14} /></button>
                    </div>
                  </div>
                </article>
              );
            })}
            <div className="mt-6 text-sm text-adv-gray text-center">
              Not finding it?{' '}
              <Link to="/portals/build" className="text-adv-teal hover:underline">Publish a portal</Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
