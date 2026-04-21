// ── VideoPlayerPage.tsx ─────────────────────────────────────────────────────
// /video/:id — HTML5 video player with range-request streaming. hls.js
// wire-up lands when the MinIO adapter + transcoder ship HLS variants.
// Comments surface arrives in v0.8.2 per Q9.

import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Video as VideoIcon } from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';

interface VideoMeta {
  id: string;
  title: string;
  description: string | null;
  duration_seconds: number | null;
  uploader_user_id: string;
  uploader_name: string | null;
  created_at: string;
  playback_url: string;
}

export default function VideoPlayerPage() {
  const { id } = useParams<{ id: string }>();
  const [video, setVideo] = useState<VideoMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const viewedRef = useRef(false);

  useEffect(() => {
    (async () => {
      if (!id) return;
      const res = await fetchWithAuth(`/api/video/${id}`);
      if (res.ok) {
        const json = await res.json() as { video: VideoMeta };
        setVideo(json.video);
      } else {
        setError(`Could not load video (${res.status})`);
      }
      setLoading(false);
    })();
  }, [id]);

  function onPlay() {
    if (viewedRef.current || !id) return;
    viewedRef.current = true;
    void fetchWithAuth(`/api/video/${id}/view`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  }

  if (loading) return <div className="p-6 text-adv-gray">Loading…</div>;
  if (error || !video) return (
    <div className="p-6">
      <Link to="/video" className="text-adv-teal">← Video</Link>
      <div className="mt-4 text-adv-red">{error ?? 'Video not found.'}</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white">
      <div className="max-w-4xl mx-auto p-6 space-y-4">
        <Link to="/video" className="text-adv-teal text-sm inline-flex items-center gap-1">
          <ArrowLeft size={14} /> Back
        </Link>

        <div className="aspect-video bg-black rounded-lg overflow-hidden border border-border">
          <video
            src={video.playback_url}
            controls
            onPlay={onPlay}
            className="w-full h-full"
          >
            Your browser cannot play this video.
          </video>
        </div>

        <header>
          <h1 className="text-xl font-semibold">{video.title}</h1>
          <div className="text-xs text-adv-gray mt-1 flex items-center gap-2">
            <VideoIcon size={12} />
            {video.uploader_name ?? 'Someone'} ·
            {new Date(video.created_at).toLocaleDateString()}
          </div>
        </header>

        {video.description && (
          <div className="rounded-lg border border-border bg-adv-card p-4 text-sm whitespace-pre-wrap">
            {video.description}
          </div>
        )}

        <div className="rounded-lg border border-dashed border-border bg-adv-card p-3 text-xs text-adv-gray text-center">
          Comments arrive in v0.8.2.
        </div>
      </div>
    </div>
  );
}
