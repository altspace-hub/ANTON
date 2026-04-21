// ── LibraryPage.tsx ────────────────────────────────────────────────────────
// /marketplace/library — user's installed/purchased/uninstalled bundles.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Library, Package, RotateCcw, Trash2 } from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';

interface LibraryRow {
  user_id: string;
  bundle_id: string;
  state: 'purchased' | 'installed' | 'uninstalled' | 'updated';
  acquired_at: string;
  last_installed_version: string | null;
  title: string | null;
  bundle_type: string | null;
  author_name: string | null;
  version: string | null;
}

function StatePill({ state }: { state: string }) {
  const palette: Record<string, string> = {
    installed: 'bg-adv-green/20 text-adv-green',
    purchased: 'bg-adv-teal/20 text-adv-teal',
    uninstalled: 'bg-adv-gray/20 text-adv-gray',
    updated: 'bg-adv-blue/20 text-adv-blue',
  };
  return <span className={`px-2 py-0.5 rounded-full text-xs ${palette[state] ?? 'bg-adv-gray/20 text-adv-gray'}`}>{state}</span>;
}

export default function LibraryPage() {
  const [rows, setRows] = useState<LibraryRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetchWithAuth('/api/marketplace/library');
    if (res.ok) {
      const json = await res.json() as { library: LibraryRow[] };
      setRows(json.library ?? []);
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function uninstall(bundleId: string) {
    if (!window.confirm('Uninstall this bundle?')) return;
    await fetchWithAuth('/api/marketplace/uninstall', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bundle_id: bundleId }),
    });
    await load();
  }

  async function reinstall(bundleId: string) {
    await fetchWithAuth('/api/marketplace/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bundle_id: bundleId }),
    });
    await load();
  }

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <header className="flex items-center gap-3">
          <Library size={22} className="text-adv-teal" />
          <div>
            <h1 className="text-2xl font-semibold">My library</h1>
            <p className="text-xs text-adv-gray">Everything you've installed, purchased, or uninstalled.</p>
          </div>
        </header>

        <Link to="/marketplace" className="text-sm text-adv-teal">← Browse marketplace</Link>

        {loading && <div className="text-adv-gray">Loading…</div>}
        {!loading && rows.length === 0 && (
          <div className="rounded-lg border border-border bg-adv-card p-6 text-center text-sm text-adv-gray">
            Nothing in your library yet.
          </div>
        )}
        <ul className="space-y-2">
          {rows.map(r => (
            <li key={r.bundle_id} className="rounded-lg border border-border bg-adv-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Package size={14} className="text-adv-teal" />
                    <Link to={`/marketplace/${encodeURIComponent(r.bundle_id)}`} className="text-sm font-medium hover:text-adv-teal truncate">
                      {r.title ?? r.bundle_id}
                    </Link>
                    <StatePill state={r.state} />
                  </div>
                  <div className="text-xs text-adv-gray mt-1">
                    {r.bundle_type} · v{r.version ?? '?'} · by {r.author_name ?? '?'} · acquired {new Date(r.acquired_at).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {r.state === 'uninstalled' && (
                    <button onClick={() => void reinstall(r.bundle_id)} className="p-1.5 text-adv-teal hover:bg-adv-dark-2 rounded" title="Reinstall">
                      <RotateCcw size={14} />
                    </button>
                  )}
                  {(r.state === 'installed' || r.state === 'purchased') && (
                    <button onClick={() => void uninstall(r.bundle_id)} className="p-1.5 text-adv-red hover:bg-adv-dark-2 rounded" title="Uninstall">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
