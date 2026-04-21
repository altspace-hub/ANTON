// ── RecentlyVisited.tsx ─────────────────────────────────────────────────────
// Up to 6 recently-visited portals, lazy-loaded + collapsible. Tracks recency
// via localStorage (user-local); syncing across devices is a Phase 2+ concern.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, Clock } from 'lucide-react';

interface Entry {
  portal_address: string;
  title: string;
  visited_at: string;
}

const STORAGE_KEY = 'portals_recently_visited';
const MAX_ENTRIES = 6;

export function recordPortalVisit(address: string, title: string): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list: Entry[] = raw ? JSON.parse(raw) : [];
    const filtered = list.filter(e => e.portal_address !== address);
    filtered.unshift({ portal_address: address, title, visited_at: new Date().toISOString() });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered.slice(0, MAX_ENTRIES)));
  } catch { /* ignore quota errors */ }
}

export default function RecentlyVisited() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      setEntries(raw ? JSON.parse(raw) : []);
    } catch { setEntries([]); }
  }, []);

  if (entries.length === 0) return null;

  return (
    <section className="rounded-lg border border-border bg-adv-card/50">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-adv-off-white"
      >
        <span className="flex items-center gap-2">
          <Clock size={16} className="text-adv-gray" />
          Recently visited
          <span className="text-xs text-adv-gray">({entries.length})</span>
        </span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && (
        <ul className="px-2 pb-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {entries.map(e => (
            <li key={e.portal_address}>
              <Link
                to={`/portals/p/${encodeURIComponent(e.portal_address)}`}
                className="block px-3 py-2 rounded text-sm text-adv-off-white hover:bg-adv-dark-2 transition"
              >
                <div className="truncate">{e.title || e.portal_address}</div>
                <div className="text-xs text-adv-gray truncate">{e.portal_address}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
