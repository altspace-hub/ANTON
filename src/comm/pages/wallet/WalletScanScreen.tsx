/**
 * WalletScanScreen — camera QR scan with a manual-entry fallback (#79 Phase 6).
 *
 * Uses the pure-web `qr-scanner` lib (getUserMedia + worker) so no native plugin
 * is needed — runs the same in a desktop browser + the Capacitor WebView. On a
 * camera failure it falls back to pasting the link. Accepts a single-QR
 * `futurechain:pay?…` URI or a `ur:fc-pay-uri/…` animated fountain stream; the
 * decoded URI is run through Comm's parsePayUri and routed to compose/review.
 *
 * Ported from Pay's ScanScreen, adapted to Comm's ParsedPayUri.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import QrScanner from 'qr-scanner';
import PrimaryButton from '../../components/PrimaryButton';
import { parsePayUri, type ParsedPayUri } from './WalletSendScreen';
import { looksLikeUrFrame } from '../../services/qr-transfer/encoder';
import { createUriDecoder, type UriDecoder } from '../../services/qr-transfer/decoder';

interface Props {
  onBack: () => void;
  onScanned: (parsed: ParsedPayUri) => void;
}

type Mode = 'camera' | 'manual';

export default function WalletScanScreen({ onBack, onScanned }: Props) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const handledRef = useRef(false);
  const urDecoderRef = useRef<UriDecoder | null>(null);

  const [mode, setMode] = useState<Mode>('camera');
  const [cameraFailed, setCameraFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [manualText, setManualText] = useState('');
  const [urProgress, setUrProgress] = useState<{ received: number; expected: number; pct: number } | null>(null);

  /** Parse a scanned/typed URI; route onward if valid. */
  function tryDecode(raw: string): boolean {
    const result = parsePayUri(raw.trim());
    if (result.ok) {
      handledRef.current = true;
      scannerRef.current?.stop();
      onScanned(result);
      return true;
    }
    setNotice(t(`wallet.sendErr.${result.errorKey}`, t('scan.invalidUri', 'That QR is not a valid payment code.')));
    return false;
  }

  function tryDecodeUr(frame: string): void {
    if (!urDecoderRef.current) urDecoderRef.current = createUriDecoder();
    const r = urDecoderRef.current.receive(frame);
    if (r.error) { setNotice(r.error); return; }
    if (r.complete && r.uri) {
      urDecoderRef.current.reset();
      setUrProgress(null);
      tryDecode(r.uri);
      return;
    }
    setUrProgress({ received: r.partsReceived, expected: r.partsExpected, pct: r.progress });
  }

  useEffect(() => {
    if (mode !== 'camera') return;
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;
    const scanner = new QrScanner(
      video,
      (result) => {
        if (handledRef.current) return;
        const raw = result.data;
        if (looksLikeUrFrame(raw)) tryDecodeUr(raw); else tryDecode(raw);
      },
      { returnDetailedScanResult: true, highlightScanRegion: true, highlightCodeOutline: true, maxScansPerSecond: 10 },
    );
    scannerRef.current = scanner;
    scanner.start().catch(() => { if (!cancelled) setCameraFailed(true); });
    return () => { cancelled = true; scanner.stop(); scanner.destroy(); scannerRef.current = null; };
  }, [mode]);

  return (
    <div className="flex flex-col h-full overflow-hidden safe-bottom" style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="px-5 safe-top pb-3 flex items-center gap-2 shrink-0">
        <button type="button" onClick={onBack} className="p-2 rounded-lg" aria-label={t('common.back')}
                style={{ color: 'var(--color-text-muted)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h2 className="text-lg font-bold text-[var(--color-text)]">{t('scan.title', 'Scan to pay')}</h2>
      </div>

      {mode === 'camera' && !cameraFailed && (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="relative flex-1 mx-5 rounded-2xl overflow-hidden" style={{ backgroundColor: '#000' }}>
            <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
          </div>
          <p className="text-center text-sm px-5 py-4 text-[var(--color-text-muted)]">{t('scan.hint', 'Point at a merchant or wallet QR.')}</p>
          {urProgress && urProgress.expected > 0 && (
            <div className="mx-5 mb-3 rounded-lg p-3 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-body)]">
              <div className="flex justify-between mb-2">
                <span>{t('scan.urScanning', 'Receiving animated QR…')}</span>
                <span className="mono">{urProgress.received} / {urProgress.expected}</span>
              </div>
              <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-border)' }}>
                <div className="h-full transition-all" style={{ width: `${Math.round(urProgress.pct * 100)}%`, backgroundColor: 'var(--color-accent)' }} />
              </div>
            </div>
          )}
          {notice && (
            <div className="mx-5 mb-3 rounded-lg p-3 text-sm text-center bg-[var(--color-gold-dim)] text-[var(--color-gold)]">{notice}</div>
          )}
          <div className="px-5 pb-2">
            <button type="button" onClick={() => setMode('manual')}
                    className="w-full py-3 rounded-xl text-sm font-semibold bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-body)]">
              {t('scan.enterManually', 'Enter code manually')}
            </button>
          </div>
        </div>
      )}

      {mode === 'camera' && cameraFailed && (
        <div className="flex flex-col flex-1 px-5 pb-6">
          <div className="rounded-xl p-4 mt-2 bg-[var(--color-red-dim)] border border-[var(--color-red)]">
            <div className="font-bold text-sm text-[var(--color-red)]">{t('scan.cameraError', 'Camera unavailable')}</div>
            <div className="text-sm mt-1 text-[var(--color-text-body)]">{t('scan.cameraErrorBody', 'Paste the payment link instead.')}</div>
          </div>
          <PrimaryButton onClick={() => setMode('manual')}>{t('scan.enterManually', 'Enter code manually')}</PrimaryButton>
        </div>
      )}

      {mode === 'manual' && (
        <div className="flex flex-col flex-1 px-5 pb-6 overflow-y-auto">
          <h3 className="text-base font-bold mt-2 mb-1 text-[var(--color-text)]">{t('scan.manualTitle', 'Paste a payment link')}</h3>
          <p className="text-sm mb-3 text-[var(--color-text-muted)]">{t('scan.manualHint', 'Paste a futurechain:pay link from the merchant or wallet.')}</p>
          <textarea
            value={manualText}
            onChange={(e) => { setManualText(e.target.value); setNotice(null); }}
            placeholder="futurechain:pay?to=fc_...&amount=..."
            rows={4}
            className="w-full p-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] font-mono text-[12px] text-[var(--color-text)]"
            style={{ resize: 'none' }}
          />
          {notice && <div className="mt-3 rounded-lg p-3 text-sm bg-[var(--color-gold-dim)] text-[var(--color-gold)]">{notice}</div>}
          <PrimaryButton onClick={() => tryDecode(manualText)} disabled={manualText.trim().length === 0}>
            {t('scan.decode', 'Continue')}
          </PrimaryButton>
        </div>
      )}
    </div>
  );
}
