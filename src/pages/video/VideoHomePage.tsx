// ── VideoHomePage.tsx ───────────────────────────────────────────────────────
// /video — public/semi-public feed + entry points to channel + playlists.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Video as VideoIcon, Upload, ListVideo, User } from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';

interface Video {
  id: string;
  title: string;
  description: string | null;
  duration_seconds: number | null;
  uploader_user_id: string;
  uploader_name: string | null;
  created_at: string;
}

export default function VideoHomePage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await fetchWithAuth('/api/video/feed');
      if (res.ok) {
        const json = await res.json() as { videos: Video[] };
        setVideos(json.videos ?? []);
      }
      setLoading(false);
    })();
  }, []);

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <VideoIcon className="text-adv-teal" size={22} /> Video
            </h1>
            <p className="text-xs text-adv-gray mt-1">Long-form. Ad-free. Creator-owned.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/video/upload" className="inline-flex items-center gap-1 px-4 py-2 bg-adv-teal text-adv-dark rounded text-sm font-medium">
              <Upload size={14} /> Upload
            </Link>
            <Link to="/video/playlists" className="inline-flex items-center gap-1 px-4 py-2 border border-border rounded text-sm">
              <ListVideo size={14} /> Playlists
            </Link>
            <Link to="/video/channel" className="inline-flex items-center gap-1 px-4 py-2 border border-border rounded text-sm">
              <User size={14} /> My channel
            </Link>
          </div>
        </header>

        {loading ? (
          <div className="text-adv-gray text-sm">Loading…</div>
        ) : videos.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-adv-card p-8 text-center text-adv-gray text-sm">
            No public videos yet. Be the first — <Link to="/video/upload" className="text-adv-teal">upload</Link>.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {videos.map(v => (
              <Link
                key={v.id}
                to={`/video/${v.id}`}
                className="rounded-lg border border-border bg-adv-card overflow-hidden hover:border-adv-teal/50"
              >
                <div className="aspect-video bg-adv-dark-2 flex items-center justify-center">
                  <VideoIcon className="text-adv-gray" size={40} />
                </div>
                <div className="p-3 space-y-1">
                  <div className="text-sm font-medium line-clamp-2">{v.title}</div>
                  <div className="text-xs text-adv-gray">
                    {v.uploader_name ?? 'Someone'} ·
                    {v.duration_seconds ? ` ${Math.floor(v.duration_seconds / 60)}m ${v.duration_seconds % 60}s` : ''}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
