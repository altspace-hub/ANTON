// ── FeaturedToday.tsx ───────────────────────────────────────────────────────
// Up to 3 portals surfaced by Pathfinder's trending/quality signal. v1 uses
// the /api/portals/public-directory endpoint (deterministic ordering by
// last_synced_at); Phase 2 can swap to a trending query once the pathfinder
// search log is populated (migration 161).

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { fetchWithAuth } from '../../lib/api';

interface FeaturedPortal {
  portal_address: string;
  display_title: string | null;
  category: string;
}

export default function FeaturedToday() {
  const [portals, setPortals] = useState<FeaturedPortal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetchWithAuth('/api/portals/public-directory?limit=3');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json() as { entries: FeaturedPortal[] };
        if (!cancelled) setPortals((json.entries ?? []).slice(0, 3));
      } catch { /* silent — section hides itself when empty */ }
      finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  if (loading || portals.length === 0) return null;

  return (
    <section className="rounded-lg border border-border bg-adv-card/50">
      <div className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-adv-off-white">
        <Sparkles size={16} className="text-adv-teal" />
        Featured today
      </div>
      <ul className="px-2 pb-2 grid grid-cols-1 md:grid-cols-3 gap-2">
        {portals.map(p => (
          <li key={p.portal_address}>
            <Link
              to={`/portals/p/${encodeURIComponent(p.portal_address)}`}
              className="block px-3 py-2 rounded text-sm text-adv-off-white hover:bg-adv-dark-2 transition"
            >
              <div className="font-medium truncate">{p.display_title || p.portal_address}</div>
              <div className="text-xs text-adv-gray truncate">{p.portal_address} · {p.category}</div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
