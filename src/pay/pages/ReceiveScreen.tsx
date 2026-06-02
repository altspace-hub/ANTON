/**
 * ReceiveScreen — show the active wallet's address as a scannable QR
 * so another wallet (Pay, Business, Comm, or any FutureChain client)
 * can pay this user.
 *
 * The QR encodes a `futurechain:pay?to=…[&amount=…]` URI. When the
 * "Request amount" field is empty, the QR carries only the address —
 * the sender chooses the amount on Review. When filled in, the
 * amount is baked into the QR in micro-FTC so the sender sees the
 * exact figure pre-filled.
 *
 * Out of scope for v1: ADR-004 `ref` (a per-receive reference id
 * encoded into RmtInf so the receiver can match payment to invoice).
 * Pay-to-pay receives don't need it; if the merchant flow ever lands
 * here, lift the `reference.encodeV1` call from src/business/services/
 * qr.ts.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import QrCode from '../components/QrCode';
import CopyRow from '../components/CopyRow';
import AnimatedQrCode from '../components/AnimatedQrCode';
import ActiveSyncBanner from '../components/ActiveSyncBanner';
import FiatAmountInput from '../components/FiatAmountInput';
import { getActiveWalletMeta } from '../services/wallet';
import { startActiveSync, type ActiveSyncSnapshot } from '../services/active-sync';
import { notifyIncoming } from '../services/notifications';
import { loadPayerIdentity, type PayerIdentity } from '../services/payment-identity';
import {
  buildCompactReceiveUri, buildRichReceiveUri,
} from '../services/qr-transfer/receive-uri';
import type { WalletMeta } from '../services/wallets';

/** Static = single QR (default, fits the basic `futurechain:pay?to=…`
 *  shape). Animated = fountain-coded UR stream for richer payloads
 *  (e.g. when we start carrying full PACS.008 creditor party / order
 *  details that exceed single-QR density). Single user toggle. */
type QrMode = 'static' | 'animated';

interface Props {
  onBack: () => void;
}

export default function ReceiveScreen({ onBack }: Props) {
  const { t } = useTranslation();
  const [meta, setMeta] = useState<WalletMeta | null>(null);
  /** Amount in micro-FTC — the canonical thing baked into the QR.
   *  FiatAmountInput drives this whether the user typed in fiat or
   *  FTC; zero means "no amount, sender chooses." */
  const [microFtc, setMicroFtc] = useState<bigint>(0n);
  const [activeSync, setActiveSync] = useState<ActiveSyncSnapshot | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const [qrMode, setQrMode] = useState<QrMode>('static');
  /** The receiver's saved ISO 20022 party — becomes the *creditor* on
   *  the rich animated URI. Null until loaded / when the user hasn't
   *  filled in a payment identity yet. */
  const [identity, setIdentity] = useState<PayerIdentity | null>(null);

  useEffect(() => {
    void (async () => {
      const [m, id] = await Promise.all([getActiveWalletMeta(), loadPayerIdentity()]);
      setMeta(m);
      setIdentity(id);
    })();
  }, []);

  /**
   * Auto-arm a 5-min active-sync when the Receive screen mounts —
   * showing your own QR is a strong "I'm expecting one" signal
   * (Galoy's POS pattern, generalised). Cancels automatically on
   * unmount; user can also tap Cancel on the banner.
   */
  useEffect(() => {
    if (!meta) return;
    const cancel = startActiveSync({
      budgetMs: 5 * 60 * 1000,
      onTick: (snap) => setActiveSync(snap),
      onFresh: (fresh) => {
        for (const r of fresh) void notifyIncoming(r);
      },
      onEnd: () => {
        cancelRef.current = null;
        setActiveSync(null);
      },
    });
    cancelRef.current = cancel;
    setActiveSync({ elapsedMs: 0, budgetMs: 5 * 60 * 1000, nextPollInMs: 5_000, pollCount: 0 });
    return () => { cancel(); };
  }, [meta]);

  // Static QR carries the compact address-(maybe-amount) URI — small,
  // dense-free, one frame. The animated QR carries the *rich* URI:
  // the receiver's creditor party + a small order envelope, which is
  // the whole reason to switch to the fountain-coded mode. The rich URI
  // is null when there's nothing extra to carry (no amount, or no saved
  // payment identity) — in that case the Animated toggle is disabled so
  // the user is never offered a heavier mode with zero benefit (A4).
  const compactUri = meta ? buildCompactReceiveUri(meta.address, microFtc) : '';
  const richUri = meta
    ? buildRichReceiveUri({
        address: meta.address,
        amountMicroFtc: microFtc,
        identity,
        label: meta.label,
      })
    : null;
  const animatedAvailable = richUri !== null;

  // If the rich payload disappears (e.g. the user clears the amount)
  // while Animated is selected, fall back to static so we never render
  // the animated component with a null/compact payload.
  useEffect(() => {
    if (qrMode === 'animated' && !animatedAvailable) setQrMode('static');
  }, [qrMode, animatedAvailable]);

  async function share() {
    if (!meta) return;
    const ftc = microFtc > 0n
      ? (Number(microFtc) / 1_000_000).toString()
      : null;
    const text = ftc
      ? `Pay me ${ftc} FTC — ${meta.address}`
      : `My FutureChain address: ${meta.address}`;
    try {
      // navigator.share is the cleanest cross-platform path; Capacitor's
      // Share plugin shadows it on native.
      await (navigator as Navigator & { share?: (data: ShareData) => Promise<void> })
        .share?.({ title: 'FutureChain payment request', text, url: compactUri });
    } catch { /* user cancelled or share unavailable — no-op */ }
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="flex flex-col flex-1 px-6 pb-6">
        {/* Header */}
        <div className="flex items-center gap-3 -ml-2 mb-5">
          <button type="button" onClick={onBack} className="p-2 rounded-lg"
                  aria-label={t('common.back')}
                  style={{ color: 'var(--color-text-muted)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h2 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>
            {t('receive.title', 'Receive')}
          </h2>
        </div>

        {!meta && (
          <div className="rounded-xl p-6 text-center mt-4"
               style={{ backgroundColor: 'var(--color-surface)',
                        border: '1px solid var(--color-border)' }}>
            <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
              {t('wallet.noWallet')}
            </div>
          </div>
        )}

        {meta && (
          <>
            {/* Wallet label chip */}
            <div className="text-xs uppercase tracking-wider mb-1.5"
                 style={{ color: 'var(--color-text-faint)' }}>
              {t('receive.payTo', 'Pay to')}
            </div>
            <div className="font-semibold mb-4" style={{ color: 'var(--color-text)' }}>
              {meta.label}
            </div>

            {/* QR — static (single frame) or animated (fountain-coded UR
                stream). Static fits the basic `futurechain:pay?to=…`
                URI in one QR; animated mode is for the same URI today
                but ready for the bigger payloads (full PACS.008 creditor
                + order details) we'll layer in once the rich-payment-
                request flow lands. See PAY_QR_TRANSFER_SPEC.md. */}
            <div className="self-center p-4 rounded-2xl mb-2"
                 style={{ backgroundColor: '#FFFFFF',
                          border: '1px solid var(--color-border)' }}>
              {qrMode === 'static' || !richUri
                ? <QrCode value={compactUri} size={240} />
                : <AnimatedQrCode value={richUri} size={240} />}
            </div>

            {/* QR-mode toggle. Defaults to static (works at all sizes);
                the user picks animated when they need to ship richer
                data (Phase 2 follow-up) or just want bigger / less
                dense per-frame QRs that scan from further away. */}
            <div className="self-center mb-3 inline-flex rounded-lg overflow-hidden"
                 style={{ border: '1px solid var(--color-border)' }}>
              <button type="button"
                      onClick={() => setQrMode('static')}
                      className="px-3 py-1.5 text-xs font-semibold"
                      style={{
                        backgroundColor: qrMode === 'static'
                          ? 'var(--color-accent)' : 'transparent',
                        color: qrMode === 'static'
                          ? 'var(--color-accent-fg)' : 'var(--color-text-muted)',
                      }}>
                {t('receive.qrStatic', 'Static')}
              </button>
              <button type="button"
                      onClick={() => animatedAvailable && setQrMode('animated')}
                      disabled={!animatedAvailable}
                      title={animatedAvailable
                        ? undefined
                        : t('receive.qrAnimatedHint',
                            'Set an amount and your payment identity to enable')}
                      className="px-3 py-1.5 text-xs font-semibold"
                      style={{
                        backgroundColor: qrMode === 'animated' && animatedAvailable
                          ? 'var(--color-accent)' : 'transparent',
                        color: !animatedAvailable
                          ? 'var(--color-text-faint)'
                          : qrMode === 'animated'
                            ? 'var(--color-accent-fg)' : 'var(--color-text-muted)',
                        cursor: animatedAvailable ? 'pointer' : 'not-allowed',
                      }}>
                {t('receive.qrAnimated', 'Animated')}
              </button>
            </div>

            {/* Active-sync banner — shown while the Receive screen is
                visible. Cancel stops the polling early; closing the
                screen also cancels via the useEffect cleanup. */}
            {activeSync && (
              <div className="mb-4">
                <ActiveSyncBanner
                  snapshot={activeSync}
                  onCancel={() => cancelRef.current?.()}
                />
              </div>
            )}

            {/* Address — CopyRow carries the label + monospaced value +
                a one-tap copy with the same "Copied" flash this screen
                used to render inline. */}
            <div className="rounded-xl p-4 mb-3"
                 style={{ backgroundColor: 'var(--color-surface)',
                          border: '1px solid var(--color-border)' }}>
              <CopyRow label={t('wallet.addressLabel', 'Address')} value={meta.address} />
            </div>

            {/* Optional amount — fiat-first when a rate is available
                (EBA/MiCA Art. 66 "fair, clear, not misleading"), falls
                back to FTC-only with explicit "Rate unavailable" notice
                when the FutureChain oracle is offline. */}
            <div className="mb-4">
              <FiatAmountInput
                initialMicroFtc={microFtc}
                onChangeMicroFtc={setMicroFtc}
                label={t('receive.requestAmount', 'Request amount (optional)')}
                helper={microFtc > 0n
                  ? t('receive.qrIncludesAmount', 'QR includes this amount')
                  : t('receive.qrAddressOnly', 'QR carries only your address — sender chooses the amount')}
              />
            </div>

            {/* Actions — copy now lives on the address card above, so the
                primary action here is Share. */}
            <div className="flex gap-2">
              <button type="button" onClick={share}
                      className="flex-1 py-3.5 rounded-xl text-sm font-semibold"
                      style={{ backgroundColor: 'var(--color-accent)',
                               color: 'var(--color-accent-fg)' }}>
                {t('common.share', 'Share')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
