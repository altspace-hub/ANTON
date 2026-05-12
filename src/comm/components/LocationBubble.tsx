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

  // Re-render every 30s so the "live · ends in 12 min" string stays current.
  useEffect(() => {
    if (!loc?.liveUntil) return;
    const t = setInterval(() => setTick((v) => v + 1), 30_000);
    return () => clearInterval(t);
  }, [loc?.liveUntil]);
  void tick;

  if (!loc) return null;

  const liveActive = !!loc.liveUntil && loc.liveUntil > new Date().toISOString();
  const liveEnded = !!loc.liveUntil && !liveActive;
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
        <img
          src={osmStaticTileUrl(loc.lat, loc.lng, 15)}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0'; }}
        />
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl drop-shadow">📍</span>
        {liveActive && (
          <span
            className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1 animate-pulse"
            style={{ backgroundColor: 'var(--color-red)', color: '#FFFFFF' }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-white" />
            LIVE
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

/** Pick an OSM tile and crop on the client to roughly centre the pin.
 *  We only fetch one tile to keep things cheap; the pin is overlaid at
 *  the visual centre so off-centring up to ½ tile is acceptable. */
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
