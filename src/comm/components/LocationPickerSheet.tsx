/**
 * LocationPickerSheet — R13 entry point from the AttachmentSheet.
 *
 * Flow: open → request permission → call getCurrentPosition → show
 * preview tile + coords + accuracy → user picks "Share once" or one of
 * the live-share durations. Cancel button always available.
 */
import { useEffect, useState } from 'react';
import { Ico } from './Ico';
import { registerBackHandler } from '../services/back-stack';
import { getCurrentPosition, ensureGeoPermission, type GeoFix } from '../services/geo';
import { osmStaticTileUrl } from './LocationBubble';

interface Props {
  open: boolean;
  onClose: () => void;
  /** liveDurationMin = 0 → one-shot; otherwise live share for N minutes. */
  onShare: (fix: GeoFix, liveDurationMin: number) => void;
}

const LIVE_OPTIONS: Array<{ label: string; minutes: number }> = [
  { label: 'Share once',          minutes: 0 },
  { label: 'Live · 15 minutes',   minutes: 15 },
  { label: 'Live · 1 hour',       minutes: 60 },
  { label: 'Live · 8 hours',      minutes: 480 },
];

export default function LocationPickerSheet({ open, onClose, onShare }: Props) {
  const [fix, setFix] = useState<GeoFix | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFix(null);
    setError(null);
    setBusy(true);
    void (async () => {
      try {
        const granted = await ensureGeoPermission();
        if (!granted) { setError('Location permission denied.'); setBusy(false); return; }
        const f = await getCurrentPosition();
        setFix(f);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Couldn\'t get location');
      } finally {
        setBusy(false);
      }
    })();
    return registerBackHandler(onClose);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Share location"
      className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ background: 'rgba(28, 26, 20, 0.55)' }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--color-surface)] rounded-t-3xl pt-3 pb-6 safe-bottom max-h-[80vh] overflow-y-auto"
      >
        <div className="w-10 h-1 rounded-full bg-[var(--color-border)] mx-auto mb-3" />
        <div className="px-5 pb-2">
          <h2 className="text-base font-semibold text-[var(--color-text)] flex items-center gap-2">
            <Ico name="mapPin" size={18} color="var(--color-accent)" />
            Share location
          </h2>
        </div>

        {busy && (
          <p className="px-5 py-4 text-sm text-[var(--color-text-faint)]">Locating…</p>
        )}

        {error && (
          <p className="px-5 py-4 text-sm text-[var(--color-red)]">{error}</p>
        )}

        {fix && (
          <>
            <div className="mx-5 mt-2 rounded-2xl overflow-hidden border border-[var(--color-border-soft)] bg-[var(--color-surface-alt)]">
              <div className="relative" style={{ aspectRatio: '16 / 10', backgroundColor: '#e9e3d6' }}>
                <img
                  src={osmStaticTileUrl(fix.lat, fix.lng, 15)}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0'; }}
                />
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl drop-shadow">📍</span>
              </div>
              <div className="px-3 py-2 text-[12px] text-[var(--color-text-muted)] flex items-center justify-between">
                <span className="font-mono">{fix.lat.toFixed(5)}, {fix.lng.toFixed(5)}</span>
                <span>±{Math.round(fix.accuracyM)} m</span>
              </div>
            </div>

            <ul className="px-3 pt-3 space-y-1">
              {LIVE_OPTIONS.map((opt) => (
                <li key={opt.minutes}>
                  <button
                    onClick={() => { onClose(); onShare(fix, opt.minutes); }}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left text-[15px] text-[var(--color-text)] active:bg-[var(--color-surface-muted)]"
                  >
                    <Ico name={opt.minutes === 0 ? 'mapPin' : 'clock'} size={20} color="var(--color-text-muted)" />
                    <span>{opt.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="px-5 pt-3">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-2xl text-sm font-medium text-[var(--color-text-muted)]"
            style={{ backgroundColor: 'var(--color-surface-alt)' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
