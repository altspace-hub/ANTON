// ── MarketplaceHomePage.tsx ─────────────────────────────────────────────────
// /marketplace — bundle discovery. Uses the existing public marketplace
// search API (migration 104 listings).

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Store, Search, ShieldCheck } from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';

interface Listing {
  id: string;
  bundle_type: string;
  title: string;
  description: string;
  author_name: string;
  version: string;
  avg_rating: number | string;
  rating_count: number;
  download_count: number;
  created_at: string;
}

const TYPE_TABS = [
  { id: 'all',                   label: 'All' },
  { id: 'module',                label: 'Modules' },
  { id: 'skill',                 label: 'Skills' },
  { id: 'persona',               label: 'Personas' },
  { id: 'workflow',              label: 'Workflows' },
  { id: 'compliance-ruleset',    label: 'Compliance Rulesets' },
  { id: 'starter-pack',          label: 'Starter Packs' },
  { id: 'coding-blueprint',      label: 'Coding Blueprints' },
  { id: 'portal',                label: 'Portals' },
];

export default function MarketplaceHomePage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [tab, setTab] = useState<string>('all');
  const [q, setQ] = useState('');

  useEffect(() => {
    (async () => {
      const params = new URLSearchParams();
      if (tab !== 'all') params.set('bundle_type', tab);
      if (q.trim()) params.set('q', q.trim());
      const res = await fetchWithAuth(`/api/marketplace${params.toString() ? '?' + params.toString() : ''}`).catch(() => null);
      if (res && res.ok) {
        const json = await res.json() as { listings?: Listing[] };
        setListings(json.listings ?? []);
      } else {
        setListings([]);
      }
    })();
  }, [tab, q]);

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <header className="flex items-center gap-3">
          <Store size={22} className="text-adv-teal" />
          <div>
            <h1 className="text-2xl font-semibold">Marketplace</h1>
            <p className="text-xs text-adv-gray">Inspect before you install.</p>
          </div>
        </header>

        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-adv-gray" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search bundles…"
            className="w-full bg-adv-card border border-border rounded-lg pl-10 pr-4 py-3 text-sm outline-none focus:ring-1 focus:ring-adv-teal"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {TYPE_TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-full text-xs transition ${tab === t.id ? 'bg-adv-teal text-adv-dark' : 'bg-adv-card text-adv-off-white'}`}
            >{t.label}</button>
          ))}
        </div>

        <div className="flex items-center justify-between text-sm">
          <div className="text-adv-gray">{listings.length} bundles</div>
          <div className="flex items-center gap-2">
            <Link to="/marketplace/library" className="text-adv-teal hover:underline">My library →</Link>
            <Link to="/marketplace/publish" className="text-adv-teal hover:underline">Publish →</Link>
          </div>
        </div>

        {listings.length === 0 ? (
          <div className="rounded-lg border border-border bg-adv-card p-6 text-center text-sm text-adv-gray">
            No bundles match your filters.
          </div>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {listings.map(l => (
              <li key={l.id}>
                <Link
                  to={`/marketplace/${encodeURIComponent(l.id)}`}
                  className="block rounded-lg border border-border bg-adv-card p-4 hover:border-adv-teal transition h-full"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{l.title}</div>
                      <div className="text-xs text-adv-gray">{l.bundle_type} · v{l.version}</div>
                    </div>
                    <ShieldCheck size={14} className="text-adv-teal flex-shrink-0" />
                  </div>
                  <p className="text-xs text-adv-off-white/70 mt-2 line-clamp-3">{l.description}</p>
                  <div className="flex items-center gap-3 mt-3 text-xs text-adv-gray">
                    <span>by {l.author_name}</span>
                    <span>·</span>
                    <span>{Number(l.avg_rating).toFixed(1)}★ ({l.rating_count})</span>
                    <span>·</span>
                    <span>{l.download_count} installs</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
