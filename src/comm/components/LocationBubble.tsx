/**
 * LocationBubble — R13. Renders a map-tile preview centred on the
 * stored lat/lng with a pin overlay, an accuracy hint, and (for live
 * shares) a "Live · ends in 12 min" countdown. Tap opens the system
 * map app via geo: URL.
 */
import { useEffect, useState } from 'react';
import { Ico } from './Ico';
import type { LocationPayload } from '../services/chat';
import type { ChatMessage } from '../services/messages';
import { isLiveSharing, subscribeLiveShareState, isAppBackgrounded } from '../services/geo';

interface Props {
  message: ChatMessage;
  isMine: boolean;
  time: string;
}

interface StoredLocation extends LocationPayload {
  lastUpdateAt?: string;
}

export default function LocationBubble({ message, isMine, time }: Props) {
  let loc: StoredLocation | null = null;
  try { loc = JSON.parse(message.plaintext) as StoredLocation; } catch { /* ignore */ }
  const [tick, setTick] = useState(0);
  const [paused, setPaused] = useState<boolean>(isAppBackgrounded());

  // Re-render every 30s so the "live · ends in 12 min" string stays current.
  useEffect(() => {
    if (!loc?.liveUntil) return;
    const t = setInterval(() => setTick((v) => v + 1), 30_000);
    return () => clearInterval(t);
  }, [loc?.liveUntil]);
  void tick;

  // P2-2: when the app backgrounds, the live-share ticker is paused by
  // Android Doze. Subscribe so this bubble shows a clear "paused" hint
  // instead of pretending the share is live.
  useEffect(() => {
    return subscribeLiveShareState((id, state) => {
      if (id !== message.id) return;
      setPaused(state === 'paused');
      if (state === 'resumed' || state === 'started') setPaused(false);
    });
  }, [message.id]);

  if (!loc) return null;

  const liveActive = !!loc.liveUntil && loc.liveUntil > new Date().toISOString();
  const liveEnded = !!loc.liveUntil && !liveActive;
  const liveIsMineAndPaused = isMine && liveActive && (paused || (!isLiveSharing(message.id) && isAppBackgrounded()));
  const geoUrl = `geo:${loc.lat},${loc.lng}?q=${loc.lat},${loc.lng}${loc.label ? `(${encodeURIComponent(loc.label)})` : ''}`;

  return (
    <a
      href={geoUrl}
      target="_blank"
      rel="noreferrer"
      className={`block max-w-[78%] rounded-2xl overflow-hidden ${isMine ? 'rounded-br-md' : 'rounded-bl-md'}`}
      style={{
        backgroundColor: isMine ? 'var(--color-accent)' : 'var(--color-surface)',
        color: isMine ? 'var(--color-accent-fg)' : 'var(--color-text)',
        border: isMine ? 'none' : '1px solid var(--color-border-soft)',
      }}
    >
      <div className="relative" style={{ aspectRatio: '16 / 10', backgroundColor: '#e9e3d6' }}>
        {/* P2-4 audit fix: previously fetched a tile from
            tile.openstreetmap.org per render, leaking IP+coords to OSM
            outside the encrypted channel. Replaced with a generated SVG
            "minimap" that conveys "this is a location" without any third-
            party network request. Tap-to-open in the system map app
            still uses the real lat/lng. */}
        <svg
          aria-hidden="true"
          viewBox="0 0 160 100"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full"
        >
          <defs>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#d8cfb9" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="160" height="100" fill="#ece5d2" />
          <rect width="160" height="100" fill="url(#grid)" />
          {/* Stylised "road" curves so it reads as a map without being one */}
          <path d="M -10 40 Q 80 20 170 60" fill="none" stroke="#cfc6ad" strokeWidth="6" strokeLinecap="round" />
          <path d="M -10 70 Q 60 50 80 60 T 170 35" fill="none" stroke="#cfc6ad" strokeWidth="4" strokeLinecap="round" />
        </svg>
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl drop-shadow">📍</span>
        {liveActive && !liveIsMineAndPaused && (
          <span
            className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1 animate-pulse"
            style={{ backgroundColor: 'var(--color-red)', color: '#FFFFFF' }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-white" />
            LIVE
          </span>
        )}
        {liveIsMineAndPaused && (
          <span
            className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1"
            style={{ backgroundColor: 'var(--color-gold)', color: '#0B1426' }}
          >
            PAUSED · OPEN ANTON
          </span>
        )}
      </div>
      <div className="px-3 py-2">
        <div className="text-[13px] font-medium flex items-center gap-1">
          <Ico name="mapPin" size={14} color={isMine ? 'var(--color-accent-fg)' : 'var(--color-text)'} />
          {loc.label || 'Shared location'}
        </div>
        <div className="text-[11px] opacity-80 mt-0.5 flex items-center justify-between">
          <span>±{Math.round(loc.accuracyM)} m{liveActive ? ` · ${endsIn(loc.liveUntil!)}` : liveEnded ? ' · live ended' : ''}</span>
          <time>{time}</time>
        </div>
      </div>
    </a>
  );
}

/**
 * @deprecated P2-4 audit fix removed all third-party tile fetches. Kept
 *  for any external consumer; the bubble + picker now use a generated
 *  SVG minimap. Will be removed in a future cleanup pass.
 */
export function osmStaticTileUrl(lat: number, lng: number, zoom: number): string {
  const n = 2 ** zoom;
  const xtile = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const ytile = Math.floor(((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n);
  // Public OSM tile server — fine for low-volume previews. Caller-of-last-resort
  // hides the image on error and falls back to the beige background.
  return `https://tile.openstreetmap.org/${zoom}/${xtile}/${ytile}.png`;
}

function endsIn(liveUntilIso: string): string {
  const remainingMs = new Date(liveUntilIso).getTime() - Date.now();
  if (remainingMs <= 0) return 'live ended';
  const min = Math.round(remainingMs / 60_000);
  if (min < 1) return 'ending now';
  if (min < 60) return `ends in ${min} min`;
  const hr = Math.round(min / 60);
  return `ends in ${hr} hr`;
}
