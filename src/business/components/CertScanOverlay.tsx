/**
 * CertScanOverlay — a full-screen QR scan surface for the terminal
 * authorization hand-off, with a paste fallback.
 *
 * Uses the pure-web `qr-scanner` lib (getUserMedia + worker), the same as
 * the Pay app's ScanScreen — no native plugin. If the camera can't open
 * (permission denied / no camera / dev browser) it shows a paste box so
 * the short `anton-terminal:…` code can be entered by hand.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import QrScanner from 'qr-scanner';

interface Props {
  title: string;
  hint?: string;
  /** Called with the raw decoded/typed string. The parent validates it and
   *  returns true if ACCEPTED (the overlay then stops/closes); false keeps
   *  the camera live so a bad/foreign code can be re-scanned. */
  onDecoded: (raw: string) => boolean;
  onClose: () => void;
}

export default function CertScanOverlay({ title, hint, onDecoded, onClose }: Props) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const handledRef = useRef(false);
  // Keep the latest onDecoded in a ref so the scanner effect depends on
  // [mode] ONLY — otherwise a parent re-render (e.g. a setNotice on a bad
  // scan) would tear down + restart the camera and the new scanner would be
  // born dead. Mirrors the Pay ScanScreen pattern.
  const onDecodedRef = useRef(onDecoded);
  useEffect(() => { onDecodedRef.current = onDecoded; }, [onDecoded]);
  const [mode, setMode] = useState<'camera' | 'paste'>('camera');
  const [cameraFailed, setCameraFailed] = useState(false);
  const [pasteText, setPasteText] = useState('');

  useEffect(() => {
    if (mode !== 'camera') return;
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;
    const scanner = new QrScanner(
      video,
      (result) => {
        if (handledRef.current) return;
        // Only stop on ACCEPTANCE — a rejected scan (bad/foreign code) keeps
        // the camera live so the next QR is read.
        if (onDecodedRef.current(result.data)) {
          handledRef.current = true;
          scanner.stop();
        }
      },
      { returnDetailedScanResult: true, highlightScanRegion: true, maxScansPerSecond: 8 },
    );
    scannerRef.current = scanner;
    scanner.start().catch(() => { if (!cancelled) { setCameraFailed(true); setMode('paste'); } });
    return () => { cancelled = true; scanner.stop(); scanner.destroy(); scannerRef.current = null; };
  }, [mode]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="px-6 pt-3 pb-3 flex items-center gap-3 -ml-2 shrink-0">
        <button type="button" onClick={onClose} className="p-2 rounded-lg"
                aria-label={t('common.close', 'Close')} style={{ color: 'var(--color-text-muted)' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <h2 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>{title}</h2>
      </div>

      {mode === 'camera' && !cameraFailed ? (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="relative flex-1 mx-6 rounded-2xl overflow-hidden" style={{ backgroundColor: '#000' }}>
            <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
          </div>
          {hint && <p className="text-center text-sm px-6 py-3" style={{ color: 'var(--color-text-muted)' }}>{hint}</p>}
          <button type="button" onClick={() => setMode('paste')}
                  className="mx-6 mb-4 py-2.5 rounded-xl text-sm font-semibold"
                  style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
            {t('terminals.enterInstead', 'Enter code instead')}
          </button>
        </div>
      ) : (
        <div className="flex flex-col flex-1 px-6 gap-3">
          {hint && <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{hint}</p>}
          <textarea
            value={pasteText} onChange={(e) => setPasteText(e.target.value)}
            placeholder="anton-terminal:…"
            autoCapitalize="none" autoCorrect="off" spellCheck={false}
            rows={5}
            className="mono text-xs rounded-xl px-3 py-2.5"
            style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
          />
          <button type="button" disabled={!pasteText.trim()}
                  onClick={() => { if (handledRef.current) return; if (onDecodedRef.current(pasteText.trim())) handledRef.current = true; }}
                  className="py-3 rounded-xl text-sm font-semibold disabled:opacity-50"
                  style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-fg)' }}>
            {t('terminals.useCode', 'Use this code')}
          </button>
          {!cameraFailed && (
            <button type="button" onClick={() => { handledRef.current = false; setMode('camera'); }}
                    className="py-2.5 rounded-xl text-sm font-semibold"
                    style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
              {t('terminals.useCamera', 'Use camera')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
