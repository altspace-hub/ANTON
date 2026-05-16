/**
 * ScanScreen — camera QR scan, with a manual-entry fallback.
 *
 * Uses the `qr-scanner` library (pure web, getUserMedia + a worker) so
 * no native scanner plugin is needed — it runs the same in a desktop
 * browser and the Capacitor WebView. If the camera can't be opened
 * (permission denied, no camera, dev browser) the screen falls back to
 * pasting the `futurechain:pay` link by hand.
 *
 * A decoded QR is validated by services/payment.ts before we leave the
 * screen — an invalid or expired code shows an inline notice and keeps
 * scanning.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import QrScanner from 'qr-scanner';
import PrimaryButton from '../components/PrimaryButton';
import { decodePaymentUri } from '../services/payment';
import type { DecodedPayment } from '../services/types';

interface Props {
  onBack: () => void;
  onDecoded: (payment: DecodedPayment) => void;
}

type Mode = 'camera' | 'manual';

export default function ScanScreen({ onBack, onDecoded }: Props) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const handledRef = useRef(false);

  const [mode, setMode] = useState<Mode>('camera');
  const [cameraFailed, setCameraFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [manualText, setManualText] = useState('');

  /** Validate a scanned/typed URI. Returns true if it routed onward. */
  function tryDecode(raw: string): boolean {
    const result = decodePaymentUri(raw);
    if (result.ok) {
      handledRef.current = true;
      scannerRef.current?.stop();
      onDecoded(result.payment);
      return true;
    }
    setNotice(result.reason === 'expired'
      ? t('scan.invalidUriExpired')
      : t('scan.invalidUri'));
    return false;
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
        tryDecode(result.data);
      },
      {
        returnDetailedScanResult: true,
        highlightScanRegion: true,
        highlightCodeOutline: true,
        maxScansPerSecond: 5,
      },
    );
    scannerRef.current = scanner;

    scanner.start().catch(() => {
      if (!cancelled) setCameraFailed(true);
    });

    return () => {
      cancelled = true;
      scanner.stop();
      scanner.destroy();
      scannerRef.current = null;
    };
  }, [mode]);

  return (
    <div className="flex flex-col h-full overflow-hidden safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      {/* Header */}
      <div className="px-6 safe-top pb-3 flex items-center gap-3 -ml-2 shrink-0">
        <button type="button" onClick={onBack} className="p-2 rounded-lg"
                aria-label={t('common.back')} style={{ color: 'var(--color-text-muted)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h2 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>
          {t('scan.title')}
        </h2>
      </div>

      {mode === 'camera' && !cameraFailed && (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="relative flex-1 mx-6 rounded-2xl overflow-hidden"
               style={{ backgroundColor: '#000' }}>
            <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
          </div>
          <p className="text-center text-sm px-6 py-4" style={{ color: 'var(--color-text-muted)' }}>
            {t('scan.hint')}
          </p>
          {notice && (
            <div className="mx-6 mb-3 rounded-lg p-3 text-sm text-center"
                 style={{ backgroundColor: 'var(--color-warning-bg)', color: 'var(--color-warning)' }}>
              {notice}
            </div>
          )}
          <div className="px-6 pb-2">
            <button type="button" onClick={() => setMode('manual')}
                    className="w-full py-3 rounded-xl text-sm font-semibold"
                    style={{ backgroundColor: 'var(--color-surface)',
                             border: '1px solid var(--color-border)',
                             color: 'var(--color-text-body)' }}>
              {t('scan.enterManually')}
            </button>
          </div>
        </div>
      )}

      {mode === 'camera' && cameraFailed && (
        <div className="flex flex-col flex-1 px-6 pb-6">
          <div className="rounded-xl p-4 mt-2"
               style={{ backgroundColor: 'var(--color-error-bg)', border: '1px solid var(--color-error)' }}>
            <div className="font-bold text-sm" style={{ color: 'var(--color-error)' }}>
              {t('scan.cameraError')}
            </div>
            <div className="text-sm mt-1" style={{ color: 'var(--color-text-body)' }}>
              {t('scan.cameraErrorBody')}
            </div>
          </div>
          <PrimaryButton onClick={() => setMode('manual')}>
            {t('scan.enterManually')}
          </PrimaryButton>
        </div>
      )}

      {mode === 'manual' && (
        <div className="flex flex-col flex-1 px-6 pb-6 overflow-y-auto">
          <h3 className="text-base font-bold mt-2 mb-1" style={{ color: 'var(--color-text)' }}>
            {t('scan.manualTitle')}
          </h3>
          <p className="text-sm mb-3" style={{ color: 'var(--color-text-muted)' }}>
            {t('scan.manualHint')}
          </p>
          <textarea
            value={manualText}
            onChange={(e) => { setManualText(e.target.value); setNotice(null); }}
            placeholder={t('scan.manualPlaceholder')}
            rows={4}
            className="mono text-sm"
            style={{ resize: 'none' }}
          />
          {notice && (
            <div className="mt-3 rounded-lg p-3 text-sm"
                 style={{ backgroundColor: 'var(--color-warning-bg)', color: 'var(--color-warning)' }}>
              {notice}
            </div>
          )}
          <PrimaryButton
            onClick={() => tryDecode(manualText)}
            disabled={manualText.trim().length === 0}
          >
            {t('scan.decode')}
          </PrimaryButton>
        </div>
      )}
    </div>
  );
}
