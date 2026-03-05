/**
 * VideoPlayer.tsx
 * YouTube embed component using privacy-enhanced mode (youtube-nocookie.com).
 * Supports start_time, auto-detected aspect ratio, fullscreen toggle.
 */
import { useState, useRef } from 'react';
import { Play, Maximize2, ExternalLink, Loader2 } from 'lucide-react';

interface VideoPlayerProps {
  videoId: string;
  title?: string;
  channel?: string;
  startTime?: number;
  className?: string;
}

export default function VideoPlayer({ videoId, title, channel, startTime = 0, className = '' }: VideoPlayerProps) {
  const [loaded, setLoaded] = useState(false);
  const [activated, setActivated] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}?start=${startTime}&rel=0&modestbranding=1&origin=${window.location.origin}`;
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}${startTime ? `&t=${startTime}s` : ''}`;

  function handleActivate() {
    setActivated(true);
  }

  function handleFullscreen() {
    if (iframeRef.current) {
      iframeRef.current.requestFullscreen?.().catch(() => {});
    }
  }

  return (
    <div className={`rounded-xl overflow-hidden border border-border bg-adv-dark-2 ${className}`}>
      {/* Header */}
      {(title || channel) && (
        <div className="flex items-center justify-between px-4 py-2 bg-adv-dark-2 border-b border-border">
          <div>
            {title && <p className="text-sm font-medium text-adv-off-white truncate">{title}</p>}
            {channel && <p className="text-xs text-adv-gray">{channel}</p>}
          </div>
          <a
            href={watchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-adv-teal hover:text-adv-teal-dark transition-colors shrink-0 ml-2"
          >
            <ExternalLink className="h-3 w-3" />
            YouTube
          </a>
        </div>
      )}

      {/* Video embed area */}
      <div className="relative bg-black" style={{ aspectRatio: '16/9' }}>
        {!activated ? (
          /* Click-to-activate privacy screen */
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-adv-dark-2">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-adv-card border border-border hover:border-adv-teal/50 transition-colors">
              <Play className="h-7 w-7 text-adv-teal ml-1" />
            </div>
            <p className="text-xs text-adv-gray text-center px-4">
              Click to load video<br />
              <span className="text-adv-gray-med">Served via youtube-nocookie.com</span>
            </p>
            <button
              onClick={handleActivate}
              className="rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
            >
              Load Video
            </button>
          </div>
        ) : (
          <>
            {!loaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-adv-dark-2">
                <Loader2 className="h-6 w-6 animate-spin text-adv-gray" />
              </div>
            )}
            <iframe
              ref={iframeRef}
              src={embedUrl}
              title={title || 'Video'}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              onLoad={() => setLoaded(true)}
              className="absolute inset-0 h-full w-full"
            />
          </>
        )}
      </div>

      {/* Footer controls */}
      {activated && loaded && (
        <div className="flex items-center justify-end px-3 py-1.5 bg-adv-dark-2 border-t border-border">
          <button
            onClick={handleFullscreen}
            className="flex items-center gap-1 text-xs text-adv-gray hover:text-adv-off-white transition-colors"
          >
            <Maximize2 className="h-3 w-3" />
            Fullscreen
          </button>
        </div>
      )}
    </div>
  );
}
