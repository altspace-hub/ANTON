// ── VideoChannelPage.tsx ────────────────────────────────────────────────────
// /video/channel — the logged-in user's own uploads + view counts. v1 keeps
// it tight: list + state + viewer counter per row.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { User, Upload, Eye } from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';

interface ChannelVideo {
  id: string;
  title: string;
  visibility: string;
  state: string;
  duration_seconds: number | null;
  created_at: string;
  view_count: number;
}

const STATE_COLORS: Record<string, string> = {
  ready: 'text-adv-green',
  transcoding: 'text-adv-gold',
  uploaded: 'text-adv-gold',
  pending: 'text-adv-gray',
  failed: 'text-adv-red',
  deleted: 'text-adv-gray',
};

export default function VideoChannelPage() {
  const [videos, setVideos] = useState<ChannelVideo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await fetchWithAuth('/api/video/channel/mine');
      if (res.ok) {
        const json = await res.json() as { videos: ChannelVideo[] };
        setVideos(json.videos ?? []);
      }
      setLoading(false);
    })();
  }, []);

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white">
      <div className="max-w-4xl mx-auto p-6 space-y-5">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <User className="text-adv-teal" size={22} /> My channel
            </h1>
            <p className="text-xs text-adv-gray mt-1">Your uploads and their reach.</p>
          </div>
          <Link to="/video/upload" className="inline-flex items-center gap-1 px-4 py-2 bg-adv-teal text-adv-dark rounded text-sm font-medium">
            <Upload size={14} /> Upload
          </Link>
        </header>

        {loading ? (
          <div className="text-adv-gray text-sm">Loading…</div>
        ) : videos.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-adv-card p-8 text-center text-adv-gray text-sm">
            No uploads yet. Upload one — max 2 GB.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-adv-gray">
              <tr className="border-b border-border">
                <th className="text-left py-2 px-2">Title</th>
                <th className="text-left py-2 px-2">State</th>
                <th className="text-left py-2 px-2">Visibility</th>
                <th className="text-left py-2 px-2">Views</th>
                <th className="text-left py-2 px-2">Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {videos.map(v => (
                <tr key={v.id} className="border-b border-border/60 hover:bg-adv-card/60">
                  <td className="py-2 px-2">
                    <Link to={`/video/${v.id}`} className="text-adv-teal hover:underline">{v.title}</Link>
                  </td>
                  <td className={`py-2 px-2 text-xs ${STATE_COLORS[v.state] ?? ''}`}>{v.state}</td>
                  <td className="py-2 px-2 text-xs text-adv-gray">{v.visibility}</td>
                  <td className="py-2 px-2 text-xs inline-flex items-center gap-1">
                    <Eye size={12} /> {v.view_count}
                  </td>
                  <td className="py-2 px-2 text-xs text-adv-gray">
                    {new Date(v.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
