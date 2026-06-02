/**
 * AnimatedQrCode — fountain-coded animated QR for large payloads.
 *
 * Spec: docs/PAY_QR_TRANSFER_SPEC.md
 *
 * Renders a continuously-changing QR code at ~5 fps. The receiving
 * phone scans frames into a `UriDecoder` until the fountain is complete
 * (typically 1-5 seconds for a typical PACS.008 payload). The encoder
 * loops indefinitely — frames are not addressed, they're combined
 * chunks, so any sufficient subset reconstructs the original.
 *
 * For a static-fits-in-one-QR payload (a basic `futurechain:pay?to=X`
 * URI), use the existing <QrCode> component instead — this one is for
 * when the payload exceeds single-QR-friendly density.
 *
 * Drop-in identical surface to <QrCode> (same `value` / `size` props).
 */
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { createUriEncoder } from '../services/qr-transfer/encoder';
import QrCode from './QrCode';

interface Props {
  value: string;
  /** Pixel size of the canvas. Default 260 (matches QrCode component). */
  size?: number;
  /** Frame rate. Default 5 (spec recommendation). Range clamped to 2–10
   *  in case the caller passes something nonsensical. */
  fps?: number;
  /** Override per-fragment byte budget for the underlying fountain
   *  encoder. Smaller chunks = smaller-density QRs (easier to scan) but
   *  more frames; larger = denser QRs, fewer frames. Spec default 100. */
  chunkBytes?: number;
  /** Background colour for the QR canvas (default white). */
  background?: string;
  /** Foreground module colour (default near-black to match QrCode). */
  color?: string;
}

export default function AnimatedQrCode({
  value,
  size = 260,
  fps = 5,
  chunkBytes = 100,
  background = '#FFFFFF',
  color = '#1A1B2E',
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Stash the encoder + render loop refs across renders so React's
  // strict-mode double-mount doesn't fire two timers.
  const encoderRef = useRef<ReturnType<typeof createUriEncoder> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Set when `createUriEncoder` throws — typically because the bc-ur
   *  fountain encoder couldn't construct (e.g. a missing `Buffer` /
   *  `assert` polyfill in the WebView; see vite.config.pay.ts). When
   *  this is non-null we fall back to a plain static QR of the same
   *  payload so the screen never shows a blank canvas, AND surface a
   *  visible chip so a future polyfill regression can't fail silently. */
  const [encoderError, setEncoderError] = useState<string | null>(null);

  useEffect(() => {
    if (!value || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const clampedFps = Math.max(2, Math.min(10, fps));
    const intervalMs = Math.round(1000 / clampedFps);

    // Build a fresh encoder per (value, chunkBytes) change. Closing
    // over `encoder` keeps the fountain state stable across timer
    // ticks; only a prop change throws it away.
    //
    // Wrapped in try/catch: the bc-ur encoder reaches for Node globals
    // (`Buffer`) and builtins (`assert`, `cbor-sync`). If the bundle
    // ever ships without those polyfills the construction throws
    // synchronously here — historically that left the canvas blank with
    // no signal. Catch it, flip to the static-QR fallback below, and
    // record the message so it's visible instead of silent.
    let encoder: ReturnType<typeof createUriEncoder>;
    try {
      encoder = createUriEncoder(value, { chunkBytes });
      setEncoderError(null);
    } catch (e) {
      setEncoderError(e instanceof Error ? e.message : String(e));
      encoderRef.current = null;
      return;
    }
    encoderRef.current = encoder;

    let cancelled = false;
    function renderFrame() {
      if (cancelled || !canvas) return;
      const frame = encoder.next();
      // qrcode lib auto-picks the version + error-correction level
      // based on the input length. ECC level M = good middle ground:
      // tolerates ~15% damage (handles camera shake / glare) without
      // tripling the QR area like ECC H would.
      void QRCode.toCanvas(canvas, frame, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: size,
        color: { dark: color, light: background },
      }).catch(() => { /* swallow — the next tick gets another try */ });
    }
    renderFrame();
    timerRef.current = setInterval(renderFrame, intervalMs);

    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      encoderRef.current = null;
    };
  }, [value, size, fps, chunkBytes, background, color]);

  // Fallback path — the fountain encoder couldn't construct. Render a
  // plain static QR of the same payload (still scannable, just not
  // animated) plus a small chip so the degraded mode is obvious.
  if (encoderError) {
    return (
      <div style={{ width: size }}>
        <QrCode value={value} size={size} background={background} color={color} />
        <div
          role="status"
          style={{
            marginTop: 8,
            fontSize: 11,
            lineHeight: 1.3,
            textAlign: 'center',
            color: 'var(--color-warning, #B45309)',
          }}
        >
          Animated QR unavailable — showing static code
        </div>
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ width: size, height: size, display: 'block' }}
      aria-label="Animated QR code payment request"
    />
  );
}
