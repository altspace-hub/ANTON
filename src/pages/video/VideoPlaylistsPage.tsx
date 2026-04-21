// ── VideoPlaylistsPage.tsx ──────────────────────────────────────────────────
// /video/playlists — create + list the caller's playlists. Per Q10, a
// playlist can be exported as .anton bundle type #45 so it's portable and
// shareable on the marketplace.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ListVideo, Plus } from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';

interface Playlist {
  id: string;
  title: string;
  description: string | null;
  visibility: string;
  bundle_id: string | null;
  created_at: string;
  item_count: number;
}

export default function VideoPlaylistsPage() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);

  async function load() {
    const res = await fetchWithAuth('/api/video/playlists');
    if (res.ok) {
      const json = await res.json() as { playlists: Playlist[] };
      setPlaylists(json.playlists ?? []);
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function create() {
    if (!title.trim() || creating) return;
    setCreating(true);
    const res = await fetchWithAuth('/api/video/playlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim() }),
    });
    if (res.ok) { setTitle(''); await load(); }
    setCreating(false);
  }

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white">
      <div className="max-w-3xl mx-auto p-6 space-y-5">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <ListVideo className="text-adv-teal" size={22} /> Playlists
            </h1>
            <p className="text-xs text-adv-gray mt-1">
              Collections of videos. Exportable as .anton bundle (type #45).
            </p>
          </div>
          <Link to="/video" className="text-adv-teal text-sm">← Video</Link>
        </header>

        <section className="rounded-lg border border-border bg-adv-card p-4 space-y-3">
          <div className="text-sm font-medium">New playlist</div>
          <div className="flex items-center gap-2">
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Financial crime training — 2026"
              className="flex-1 bg-adv-dark border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-adv-teal"
            />
            <button
              onClick={() => void create()}
              disabled={!title.trim() || creating}
              className="px-4 py-2 bg-adv-teal text-adv-dark rounded text-sm font-medium disabled:opacity-50 inline-flex items-center gap-1"
            >
              <Plus size={14} /> Create
            </button>
          </div>
        </section>

        <section className="space-y-2">
          {loading ? (
            <div className="text-adv-gray text-sm">Loading…</div>
          ) : playlists.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-adv-card p-6 text-center text-sm text-adv-gray">
              No playlists yet.
            </div>
          ) : (
            playlists.map(p => (
              <div key={p.id} className="rounded-lg border border-border bg-adv-card p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">{p.title}</div>
                    <div className="text-xs text-adv-gray mt-1">
                      {p.item_count} video{p.item_count === 1 ? '' : 's'} ·
                      {' '}{p.visibility}
                      {p.bundle_id && <> · bundle <code className="text-adv-teal">{p.bundle_id.slice(0, 8)}</code></>}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
