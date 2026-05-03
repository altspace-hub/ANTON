/**
 * CapturePage — camera + share-target capture surface, Evolution redesign.
 *
 * Way Forward §04 fixes the previous "two emoji tiles in a 92% empty canvas"
 * pattern. The new flow is camera-first:
 *
 *   • Live viewfinder fills ~60 % of the screen (getUserMedia, environment-facing)
 *   • Mode chips above the shutter set the default intent (Receipt / Whiteboard
 *     / Document / ID / Free) — chip selection just primes the note text
 *   • 64 px shutter disc bottom-centre · 44 px library thumb left · flash right
 *   • Footer always names the destination ("Goes to your ANTON · {org}")
 *
 * After a frame is captured (or a file is picked / a share-target arrives),
 * the viewfinder swaps to a still preview with the same chips + a free-text
 * note + Send → routes through /query-sync the same way the old version did.
 *
 * Spec §8.5 (capture), Way Forward §04 (Capture redesign).
 */

import { useEffect, useRef, useState } from 'react';
import { Ico } from '../components/ui';
import { captureFromLibrary, readSharedFromUrl, type Capture } from '../services/capture';
import { fetchWithAuth } from '../services/api';
import { tick, success, error as hapticError } from '../services/haptics';

interface Props {
  orgId: string;
  orgName?: string;
  onSent: (sessionId: string | null) => void;
  onBack: () => void;
}

// Each mode primes a default note describing what ANTON should do with the capture.
// User can still freely edit the note before sending.
type ModeId = 'receipt' | 'whiteboard' | 'document' | 'id' | 'free';
interface Mode { id: ModeId; label: string; prime: string; }
const MODES: Mode[] = [
  { id: 'receipt',    label: 'Receipt',    prime: 'Extract the totals, line items, and merchant from this receipt.' },
  { id: 'whiteboard', label: 'Whiteboard', prime: 'Transcribe and structure what is on this whiteboard.' },
  { id: 'document',   label: 'Document',   prime: 'Summarise this document and extract the key points.' },
  { id: 'id',         label: 'ID',         prime: 'Extract the structured fields from this ID.' },
  { id: 'free',       label: 'Free',       prime: '' },
];

export default function CapturePage({ orgId, orgName, onSent, onBack }: Props) {
  const [capture, setCapture]   = useState<Capture | null>(null);
  const [mode, setMode]         = useState<ModeId>('free');
  const [note, setNote]         = useState('');
  const [busy, setBusy]         = useState(false);
  const [err, setErr]           = useState<string | null>(null);
  const [streamErr, setStreamErr] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Pick up OS share-intent payload on mount (text / url / image shared from
  // another app via the system share sheet).
  useEffect(() => {
    const s = readSharedFromUrl();
    if (s) setCapture(s);
  }, []);

  // Live camera stream — only when no capture is held yet, and getUserMedia
  // is available (Capacitor WebView + CAMERA permission satisfies this).
  useEffect(() => {
    if (capture) return;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setStreamErr('Camera not available in this WebView.');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) {
          s.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          void videoRef.current.play().catch(() => { /* autoplay blocked? */ });
        }
        setStreamErr(null);
      } catch (e) {
        setStreamErr(e instanceof Error ? e.message : 'Camera permission denied.');
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    };
  }, [capture]);

  // ── Actions ────────────────────────────────────────────────────────

  function shoot(): void {
    void tick();
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c || !v.videoWidth) {
      setErr('Camera not ready yet.');
      return;
    }
    // Spec §8.5: client-side resize to ≤2048px on the longest edge at
    // 70% quality. Modern phone sensors can produce 4032×3024 frames
    // which exceed the 1MB soft cap on the server-side capture endpoint
    // and waste battery / bandwidth on cellular.
    const MAX_EDGE = 2048;
    const srcW = v.videoWidth;
    const srcH = v.videoHeight;
    const scale = Math.min(1, MAX_EDGE / Math.max(srcW, srcH));
    c.width = Math.round(srcW * scale);
    c.height = Math.round(srcH * scale);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, c.width, c.height);
    const dataUrl = c.toDataURL('image/jpeg', 0.7);
    const base64 = dataUrl.split(',')[1] ?? '';
    setCapture({
      kind: 'camera',
      mimeType: 'image/jpeg',
      filename: `capture-${Date.now()}.jpg`,
      data: base64,
      size: Math.floor(base64.length * 0.75),
      isText: false,
    });
    if (mode !== 'free' && !note) {
      const m = MODES.find(x => x.id === mode);
      if (m?.prime) setNote(m.prime);
    }
  }

  async function pickFromLibrary(): Promise<void> {
    void tick();
    setErr(null);
    try {
      const c = await captureFromLibrary();
      if (c) setCapture(c);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      void hapticError();
    }
  }

  function changeMode(id: ModeId): void {
    void tick();
    setMode(id);
    // If the note is empty or matches another mode's prime, swap it.
    const newPrime = MODES.find(m => m.id === id)?.prime ?? '';
    const otherPrimes = new Set(MODES.map(m => m.prime).filter(Boolean));
    if (!note || otherPrimes.has(note)) setNote(newPrime);
  }

  function discardCapture(): void {
    setCapture(null);
    setNote('');
    setErr(null);
  }

  async function send(): Promise<void> {
    if (!capture) return;
    setBusy(true); setErr(null);
    try {
      const message = note.trim()
        || MODES.find(m => m.id === mode)?.prime
        || 'Please review this.';
      const body: Record<string, unknown> = {
        message,
        intent: mode,
        capture: capture.isText
          ? { kind: capture.kind, mimeType: capture.mimeType, text: capture.data, share_url: capture.shareUrl }
          : { kind: capture.kind, mimeType: capture.mimeType, filename: capture.filename, base64: capture.data },
      };
      const res = await fetchWithAuth(`/org/${orgId}/query-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string })?.error || `Send failed (${res.status})`);
      void success();
      onSent(typeof (data as { sessionId?: string }).sessionId === 'string'
        ? (data as { sessionId: string }).sessionId
        : null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      void hapticError();
    } finally {
      setBusy(false);
    }
  }

  const destinationLine = `Goes to your ANTON · ${orgName ?? 'Workspace'}`;

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="flex flex-1 flex-col overflow-hidden" style={{ background: 'var(--color-bg)', minHeight: 0 }}>
      {/* ── Top bar ────────────────────────────────────────────
          NO safe-top here — the App.tsx outer wrapper already pads the
          status-bar inset. Doubling it pushed the shutter + tab bar past
          the viewport on devices with a tall status bar. */}
      <header className="flex items-center gap-3 px-4 py-3" style={{ background: 'var(--color-bg)' }}>
        <button
          onClick={onBack}
          aria-label="Back"
          className="-ml-2 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full transition active:scale-95"
          style={{ color: 'var(--color-text-muted)' }}
        >
          <Ico name="chevronLeft" size={22} />
        </button>
        <div className="flex-1">
          <h1
            className="text-[var(--color-text)]"
            style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.3px', lineHeight: 1.1 }}
          >
            Capture
          </h1>
          <div className="mt-0.5 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            {destinationLine}
          </div>
        </div>
      </header>

      {/* ── Viewfinder OR Preview ───────────────────────────
          min-h-0 lets the flex-1 child actually shrink below the video's
          intrinsic content size; without it the viewfinder pushes the
          mode chips + shutter button + tab bar off-screen on tall phones. */}
      <div className="relative flex-1 overflow-hidden" style={{ background: '#0A0A0A', minHeight: 0 }}>
        {!capture ? (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover"
            />
            <canvas ref={canvasRef} className="hidden" />
            {/* 4-corner reticle */}
            <Reticle />
            {/* Soft vignette */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.5) 100%)',
              }}
            />
            {streamErr && (
              <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
                <div className="rounded-[var(--radius-r3)] border border-white/20 bg-black/60 p-4 text-white">
                  <div className="mb-1 text-sm font-semibold">Camera unavailable</div>
                  <div className="text-[12px] opacity-80">{streamErr}</div>
                  <button
                    onClick={() => void pickFromLibrary()}
                    className="mt-3 rounded-[var(--radius-r1)] bg-white/15 px-4 py-2 text-[13px] font-semibold"
                  >
                    Pick from library instead
                  </button>
                </div>
              </div>
            )}
          </>
        ) : capture.isText ? (
          <div className="absolute inset-0 overflow-y-auto bg-[var(--color-surface)] p-5">
            <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
              Shared text
            </div>
            <div className="mt-2 whitespace-pre-wrap text-sm" style={{ color: 'var(--color-text)' }}>
              {capture.data}
            </div>
            {capture.shareUrl && (
              <a
                href={capture.shareUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block break-all text-[12px]"
                style={{ color: 'var(--color-accent)' }}
              >
                {capture.shareUrl}
              </a>
            )}
          </div>
        ) : (
          <img
            src={`data:${capture.mimeType};base64,${capture.data}`}
            alt="Capture preview"
            className="absolute inset-0 h-full w-full object-contain"
          />
        )}
      </div>

      {/* ── Mode chips (only when no capture yet) ───────────
          pr-4 so the rightmost "Free" chip clears the screen edge. */}
      {!capture && (
        <div
          className="flex gap-2 overflow-x-auto py-3"
          style={{ background: 'var(--color-bg)', scrollbarWidth: 'none', paddingLeft: 16, paddingRight: 16 }}
        >
          {MODES.map(m => {
            const active = mode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => changeMode(m.id)}
                className="flex-shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition active:scale-95"
                style={{
                  background: active ? 'var(--color-accent)' : 'var(--color-surface)',
                  color: active ? 'var(--color-accent-fg)' : 'var(--color-text-body)',
                  border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
                }}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Capture preview controls (after shot / pick / share) ── */}
      {capture && (
        <div className="px-4 pb-3 pt-3" style={{ background: 'var(--color-bg)' }}>
          {/* Note input */}
          <label htmlFor="capture-note" className="sr-only">Note about this capture</label>
          <textarea
            id="capture-note"
            value={note}
            onChange={e => setNote(e.target.value)}
            maxLength={2000}
            rows={2}
            placeholder="Add a note (optional)…"
            className="w-full resize-none rounded-[var(--radius-r2)] border px-3 py-2.5 text-[13px] focus:outline-none"
            style={{
              background: 'var(--color-surface)',
              color: 'var(--color-text)',
              borderColor: 'var(--color-border)',
            }}
          />
          {err && (
            <div
              className="mt-2 rounded-[var(--radius-r1)] px-3 py-2 text-[11px]"
              style={{
                background: 'var(--color-red-dim)',
                color: 'var(--color-red)',
                border: '1px solid var(--color-red-dim)',
              }}
            >
              {err}
            </div>
          )}
        </div>
      )}

      {/* ── Bottom action row ───────────────────────────────
          No safe-bottom here — the TabBar below already pads the
          gesture handle, otherwise we get a double-inset gap. */}
      <div className="flex items-center gap-4 px-5 py-4" style={{ background: 'var(--color-bg)' }}>
        {!capture ? (
          <>
            {/* Library thumbnail */}
            <button
              onClick={() => void pickFromLibrary()}
              aria-label="Pick from library"
              className="flex-shrink-0 rounded-[var(--radius-r2)] transition active:scale-95"
              style={{
                width: 44, height: 44,
                background: 'var(--color-surface-alt)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-body)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Ico name="grid" size={20} />
            </button>
            {/* Shutter — 64px disc */}
            <button
              onClick={shoot}
              aria-label="Take photo"
              disabled={!!streamErr}
              className="flex-1 flex justify-center transition active:scale-95 disabled:opacity-30"
            >
              <span
                className="rounded-full"
                style={{
                  width: 64, height: 64,
                  background: 'var(--color-accent)',
                  border: '4px solid var(--color-surface)',
                  boxShadow: '0 0 0 2px var(--color-accent)',
                }}
              />
            </button>
            {/* Flash placeholder (no actual torch control via getUserMedia v1) */}
            <div className="flex-shrink-0" style={{ width: 44, height: 44 }} />
          </>
        ) : (
          <>
            {/* Discard */}
            <button
              onClick={discardCapture}
              disabled={busy}
              aria-label="Discard and retake"
              className="flex-shrink-0 rounded-[var(--radius-r2)] px-4 py-3 text-[13px] font-semibold transition active:scale-95 disabled:opacity-40"
              style={{
                background: 'transparent',
                color: 'var(--color-text-body)',
                border: '1px solid var(--color-border)',
                minHeight: 44,
              }}
            >
              Retake
            </button>
            {/* Send */}
            <button
              onClick={() => void send()}
              disabled={busy}
              className="flex-1 rounded-[var(--radius-r2)] py-3 text-[14px] font-semibold transition active:scale-95 disabled:opacity-40"
              style={{
                background: 'var(--color-accent)',
                color: 'var(--color-accent-fg)',
                border: '1px solid var(--color-accent)',
                minHeight: 44,
              }}
            >
              {busy ? 'Sending…' : 'Send to ANTON'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Decorative 4-corner viewfinder reticle ────────────────────────────
function Reticle(): JSX.Element {
  const sz = 28;
  const sw = 2.5;
  const col = 'rgba(255,255,255,0.85)';
  const corner = (rotation: number, position: React.CSSProperties) => (
    <span
      aria-hidden
      style={{
        position: 'absolute',
        width: sz,
        height: sz,
        borderTop: `${sw}px solid ${col}`,
        borderLeft: `${sw}px solid ${col}`,
        transform: `rotate(${rotation}deg)`,
        ...position,
      }}
    />
  );
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {corner(0,    { top: 24,    left: 24 })}
      {corner(90,   { top: 24,    right: 24 })}
      {corner(270,  { bottom: 24, left: 24 })}
      {corner(180,  { bottom: 24, right: 24 })}
    </div>
  );
}
