// ── CategoryPage.tsx ────────────────────────────────────────────────────────
// Shared template for Tier-B (placeholder) category pages. Renders the six
// sections the brief §4.3 specifies: header / native tool (if any) /
// featured portals / saved in this category / pathfinder box / partner CTA.
//
// Called from the 10 Tier-B category routes (Music, Food, Shop, Sport,
// News, Money, Travel, Health, Places, Learn) with the category id as the
// only prop. All content is data-driven from the active starter pack.

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Bookmark, ArrowRight, Info } from 'lucide-react';
import CategoryIcon from './CategoryIcon';
import { useBookmarksStore } from '../../stores/useBookmarksStore';
import { DEFAULT_15_CATEGORIES, type CategoryConfig } from '../../lib/visitor-categories';

interface Props {
  categoryId: string;
  /** Override the default category config (e.g. from the active starter pack). */
  configOverride?: CategoryConfig;
}

export default function CategoryPage({ categoryId, configOverride }: Props) {
  const cfg = configOverride ?? DEFAULT_15_CATEGORIES.find(c => c.id === categoryId);
  const { categoryBookmarks, load } = useBookmarksStore();
  const [query, setQuery] = useState('');

  useEffect(() => { void load(); }, [load]);

  const saved = useMemo(() => categoryBookmarks(categoryId), [categoryBookmarks, categoryId]);

  if (!cfg) {
    return (
      <div className="max-w-3xl mx-auto p-8 text-adv-off-white">
        <h1 className="text-2xl font-semibold">Unknown category</h1>
        <p className="text-adv-gray mt-2">Category '{categoryId}' is not in the current starter pack.</p>
        <Link to="/portals" className="text-adv-teal hover:underline mt-4 inline-block">← Back to Visitor Home</Link>
      </div>
    );
  }

  const pathfinderScope = cfg.pathfinder_scope ?? 'all';

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6 text-adv-off-white">
      {/* 1. Header */}
      <header className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-xl bg-adv-card flex items-center justify-center">
          <CategoryIcon name={cfg.icon_ref} size={28} className="text-adv-teal" />
        </div>
        <div>
          <h1 className="text-3xl font-semibold">{cfg.label}</h1>
          {cfg.design_principle && (
            <p className="text-sm text-adv-gray mt-1">{cfg.design_principle}</p>
          )}
        </div>
      </header>

      {/* 2. Native tool (if configured) */}
      {cfg.native_tool_ref && (
        <section className="rounded-lg border border-adv-teal/40 bg-adv-teal/5 p-4">
          <div className="text-sm font-medium text-adv-teal">Built-in tool</div>
          <div className="text-adv-off-white mt-1">{cfg.native_tool_ref.ref}</div>
        </section>
      )}

      {/* 3. Featured portals placeholder (Tier-B has nothing to show yet) */}
      <section className="rounded-lg border border-border bg-adv-card/50 p-6">
        <div className="flex items-center gap-2 text-sm font-medium mb-3">
          <Bookmark size={16} className="text-adv-gray" />
          Featured portals
        </div>
        <p className="text-sm text-adv-gray">
          No featured portals in this category yet. As ANTON portals are published in the{' '}
          <strong className="text-adv-off-white">{cfg.label}</strong> category, they appear here.
        </p>
      </section>

      {/* 4. Saved in this category */}
      {saved.length > 0 && (
        <section className="rounded-lg border border-border bg-adv-card/50 p-4">
          <div className="text-sm font-medium mb-3">Saved in {cfg.label}</div>
          <ul className="space-y-2">
            {saved.map(b => (
              <li key={b.id}>
                <Link
                  to={b.target_portal_id ? `/portals/p/${b.target_portal_id}` : (b.target_route ?? '#')}
                  className="text-sm text-adv-off-white hover:text-adv-teal"
                >
                  {b.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 5. Pathfinder box pre-scoped to category */}
      <section className="rounded-lg border border-border bg-adv-card p-4">
        <div className="flex items-center gap-2 text-sm font-medium mb-3">
          <Search size={16} className="text-adv-teal" />
          Search {cfg.label}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!query.trim()) return;
            const params = new URLSearchParams({ q: query.trim(), mode: pathfinderScope });
            window.location.href = `/pathfinder?${params.toString()}`;
          }}
          className="flex gap-2"
        >
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={`Search in ${cfg.label.toLowerCase()}…`}
            className="flex-1 bg-adv-dark-2 border border-border rounded px-3 py-2 text-sm text-adv-off-white outline-none focus:ring-1 focus:ring-adv-teal"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-adv-teal text-adv-dark rounded text-sm font-medium hover:bg-adv-teal-dark transition"
          >
            Search
          </button>
        </form>
        <p className="text-xs text-adv-gray mt-2">
          Pathfinder scope: <code className="text-adv-teal">{pathfinderScope}</code>
        </p>
      </section>

      {/* 6. Partner portals coming */}
      <section className="rounded-lg border border-adv-gold/40 bg-adv-gold/5 p-6">
        <div className="flex items-start gap-3">
          <Info size={20} className="text-adv-gold flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="text-sm font-medium text-adv-off-white">Partner portals coming</div>
            <p className="text-sm text-adv-gray mt-1">
              Honest placeholder. ANTON's <strong>{cfg.label}</strong> category opens up when real partners publish portals here.
              Operating in this space? Claim the category.
            </p>
            <Link
              to={`/portals/build?category=${encodeURIComponent(categoryId)}`}
              className="inline-flex items-center gap-1 mt-3 text-sm text-adv-teal hover:underline"
            >
              Publish a {cfg.label} portal
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
