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
import ActiveSyncBanner from '../components/ActiveSyncBanner';
import { getActiveWalletMeta } from '../services/wallet';
import { startActiveSync, type ActiveSyncSnapshot } from '../services/active-sync';
import { notifyIncoming } from '../services/notifications';
import type { WalletMeta } from '../services/wallets';

interface Props {
  onBack: () => void;
}

/** Convert "12.5" FTC to "12500000" micro-FTC. Returns null on bad
 *  input. Strict: only digits + a single optional dot. */
function ftcToMicro(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (!/^\d+(\.\d{1,6})?$/.test(trimmed)) return null;
  const [whole, frac = ''] = trimmed.split('.');
  const padded = (frac + '000000').slice(0, 6);
  return `${BigInt(whole) * 1_000_000n + BigInt(padded || '0')}`;
}

export default function ReceiveScreen({ onBack }: Props) {
  const { t } = useTranslation();
  const [meta, setMeta] = useState<WalletMeta | null>(null);
  const [amount, setAmount] = useState('');
  const [copied, setCopied] = useState(false);
  const [activeSync, setActiveSync] = useState<ActiveSyncSnapshot | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    void (async () => setMeta(await getActiveWalletMeta()))();
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

  const micro = ftcToMicro(amount);
  const validAmount = amount.trim() === '' || micro !== null;
  const qrValue = meta
    ? micro
      ? `futurechain:pay?to=${meta.address}&amount=${micro}`
      : `futurechain:pay?to=${meta.address}`
    : '';

  async function copyAddress() {
    if (!meta) return;
    try {
      await navigator.clipboard.writeText(meta.address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard unavailable — long-press the address text */ }
  }

  async function share() {
    if (!meta) return;
    const text = micro
      ? `Pay me ${amount} FTC — ${meta.address}`
      : `My FutureChain address: ${meta.address}`;
    try {
      // navigator.share is the cleanest cross-platform path; Capacitor's
      // Share plugin shadows it on native.
      await (navigator as Navigator & { share?: (data: ShareData) => Promise<void> })
        .share?.({ title: 'FutureChain payment request', text, url: qrValue });
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

            {/* QR */}
            <div className="self-center p-4 rounded-2xl mb-3"
                 style={{ backgroundColor: '#FFFFFF',
                          border: '1px solid var(--color-border)' }}>
              <QrCode value={qrValue} size={240} />
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

            {/* Address */}
            <div className="rounded-xl p-4 mb-3"
                 style={{ backgroundColor: 'var(--color-surface)',
                          border: '1px solid var(--color-border)' }}>
              <div className="text-xs uppercase tracking-wider mb-1.5"
                   style={{ color: 'var(--color-text-faint)' }}>
                {t('wallet.addressLabel', 'Address')}
              </div>
              <div className="mono text-sm break-all select-all"
                   style={{ color: 'var(--color-text)' }}>
                {meta.address}
              </div>
            </div>

            {/* Optional amount */}
            <div className="rounded-xl p-4 mb-4"
                 style={{ backgroundColor: 'var(--color-surface)',
                          border: '1px solid var(--color-border)' }}>
              <label htmlFor="receive-amount"
                     className="text-xs uppercase tracking-wider mb-1.5 block"
                     style={{ color: 'var(--color-text-faint)' }}>
                {t('receive.requestAmount', 'Request amount (optional)')}
              </label>
              <div className="flex items-baseline gap-2">
                <input
                  id="receive-amount"
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="flex-1 bg-transparent text-2xl font-bold mono outline-none"
                  style={{ color: 'var(--color-text)' }}
                />
                <span className="text-xs uppercase tracking-wider"
                      style={{ color: 'var(--color-text-faint)' }}>FTC</span>
              </div>
              {!validAmount && (
                <p className="text-xs mt-2" style={{ color: 'var(--color-danger, #C0392B)' }}>
                  {t('receive.invalidAmount', 'Enter a number with up to 6 decimals')}
                </p>
              )}
              <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
                {micro
                  ? t('receive.qrIncludesAmount', 'QR includes this amount')
                  : t('receive.qrAddressOnly', 'QR carries only your address — sender chooses the amount')}
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button type="button" onClick={copyAddress}
                      className="flex-1 py-3.5 rounded-xl text-sm font-semibold"
                      style={{ backgroundColor: 'var(--color-surface)',
                               border: '1px solid var(--color-border)',
                               color: 'var(--color-text)' }}>
                {copied ? t('wallet.copied') : t('wallet.copy', 'Copy address')}
              </button>
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
