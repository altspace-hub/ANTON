// ── PortalVisitorHomePage.tsx ──────────────────────────────────────────────
// The new /portals landing: visitor home with the bookmark bar, inline
// Pathfinder input, 15-category tile grid, recently visited, and featured
// today. Replaces the old operator-centric PortalsLandingPage at /portals;
// the operator hub has moved to /portals/mine.

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';
import { useSettingsStore } from '@/stores/useSettingsStore';
import BookmarkBar from '@/components/portals/BookmarkBar';
import CategoryTile from '@/components/portals/CategoryTile';
import RecentlyVisited from '@/components/portals/RecentlyVisited';
import FeaturedToday from '@/components/portals/FeaturedToday';
import { DEFAULT_15_CATEGORIES, type CategoryConfig } from '@/lib/visitor-categories';

/** Map a category id to its route. Tier-A categories have their own pages;
 *  Tier-B share the /life/<id> placeholder path. School-mode has a custom
 *  list so 'class', 'study', 'read', etc. route through the school pillar. */
function routeForCategory(id: string, appMode: string): string {
  if (id === 'pathfinder') return '/pathfinder';
  if (id === 'jobs') return '/jobs';
  if (id === 'marketplace') return '/marketplace';
  if (id === 'friends') return '/friends';
  if (id === 'video') return '/video';
  if (appMode === 'school') {
    if (id === 'class') return '/school';
    if (id === 'study') return '/life/learn';
  }
  return `/life/${id}`;
}

export default function PortalVisitorHomePage() {
  const navigate = useNavigate();
  const appMode = useSettingsStore(s => s.appMode);
  const [categories, setCategories] = useState<CategoryConfig[]>(DEFAULT_15_CATEGORIES);
  const [activePackId, setActivePackId] = useState<string>('global-default');
  const [query, setQuery] = useState('');

  // Load the user's active starter pack + ensure school pack when in
  // school mode. Both are idempotent; safe to fire every mount.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        if (appMode === 'school') {
          await fetchWithAuth('/api/starter-packs/ensure-school', { method: 'POST' });
        }
        const res = await fetchWithAuth('/api/starter-packs/active');
        if (!res.ok) return;
        const json = await res.json() as { pack_id: string; categories: CategoryConfig[] };
        if (!cancelled) {
          setActivePackId(json.pack_id);
          if (Array.isArray(json.categories) && json.categories.length > 0) {
            setCategories(json.categories.slice().sort((a, b) => a.sort_order - b.sort_order));
          }
        }
      } catch { /* fall back to defaults */ }
    }
    void load();
    return () => { cancelled = true; };
  }, [appMode]);

  const grid = useMemo(() => categories.slice().sort((a, b) => a.sort_order - b.sort_order), [categories]);

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white">
      <BookmarkBar />

      {/* Pathfinder inline search */}
      <div className="max-w-4xl mx-auto px-4 pt-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!query.trim()) return;
            navigate(`/pathfinder?q=${encodeURIComponent(query.trim())}`);
          }}
          className="flex gap-2"
        >
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
          <button
            type="submit"
            className="px-5 py-3 bg-adv-teal text-adv-dark rounded-lg font-medium hover:bg-adv-teal-dark transition"
          >
            Search
          </button>
        </form>
        <div className="text-xs text-adv-gray mt-2">
          Starter pack: <code className="text-adv-teal">{activePackId}</code>
          {' · '}
          <Link to="/portals/mine" className="hover:underline">Manage my portals →</Link>
        </div>
      </div>

      {/* 15-category grid */}
      <section className="max-w-6xl mx-auto p-4 mt-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {grid.map(c => (
            <CategoryTile key={c.id} category={c} href={routeForCategory(c.id, appMode)} />
          ))}
        </div>
      </section>

      {/* Recently visited + featured */}
      <div className="max-w-6xl mx-auto px-4 pb-8 space-y-4">
        <RecentlyVisited />
        <FeaturedToday />
      </div>
    </div>
  );
}
