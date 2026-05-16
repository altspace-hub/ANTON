/**
 * HomeScreen — the customer's landing surface.
 *
 * A wallet chip, the primary "Scan to pay" action, and a peek at the
 * most recent payments. Everything else is one tap away in Settings.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Logo from '../components/Logo';
import { loadWallet } from '../services/wallet';
import { listPayments, formatFtc } from '../services/payment';
import type { PaymentRecord } from '../services/types';

interface Props {
  onScan: () => void;
  onHistory: () => void;
  onSettings: () => void;
}

/** Abbreviate a wallet address for chips: head…tail. */
export function shortAddress(addr: string): string {
  if (addr.length <= 18) return addr;
  return `${addr.slice(0, 10)}…${addr.slice(-6)}`;
}

export default function HomeScreen({ onScan, onHistory, onSettings }: Props) {
  const { t } = useTranslation();
  const [address, setAddress] = useState<string>('');
  const [payments, setPayments] = useState<PaymentRecord[]>([]);

  useEffect(() => {
    void (async () => {
      const wallet = await loadWallet();
      setAddress(wallet?.address ?? '');
      setPayments(await listPayments());
    })();
  }, []);

  const recent = payments.slice(0, 3);

  return (
    <div className="flex flex-col h-full overflow-y-auto safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="flex flex-col flex-1 px-6 pb-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2.5">
            <Logo size={34} rounded="md" />
            <span className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>
              {t('home.greeting')}
            </span>
          </div>
          <button type="button" onClick={onSettings} aria-label={t('home.settings')}
                  className="p-2 rounded-lg" style={{ color: 'var(--color-text-muted)' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" strokeWidth="1.8" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 008 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H2a2 2 0 010-4h.09A1.65 1.65 0 003.6 8a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H8a1.65 1.65 0 001-1.51V2a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V8a1.65 1.65 0 001.51 1H22a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
                    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {/* Wallet chip */}
        <div className="rounded-xl p-4 mb-5"
             style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <div className="text-xs uppercase tracking-wider mb-1"
               style={{ color: 'var(--color-text-faint)' }}>
            {t('home.walletLabel')}
          </div>
          <div className="mono text-sm" style={{ color: 'var(--color-text)' }}>
            {address ? shortAddress(address) : '—'}
          </div>
          <div className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
            {t('home.paymentsCount', { count: payments.length })}
          </div>
        </div>

        {/* Scan CTA */}
        <button
          type="button"
          onClick={onScan}
          className="rounded-2xl p-6 flex flex-col items-center text-center active:opacity-90 transition-opacity"
          style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-fg)' }}
        >
          <span className="flex items-center justify-center w-16 h-16 rounded-full mb-3"
                style={{ backgroundColor: 'rgba(255,255,255,0.16)' }}>
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
              <path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2M3 12h18"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="text-xl font-bold">{t('home.scanToPay')}</span>
          <span className="text-sm mt-1" style={{ opacity: 0.85 }}>{t('home.scanHint')}</span>
        </button>

        {/* Recent payments */}
        <div className="flex items-center justify-between mt-7 mb-2">
          <h2 className="text-sm font-bold uppercase tracking-wider"
              style={{ color: 'var(--color-text-faint)' }}>
            {t('home.recentPayments')}
          </h2>
          {payments.length > 3 && (
            <button type="button" onClick={onHistory}
                    className="text-sm font-semibold" style={{ color: 'var(--color-accent)' }}>
              {t('home.seeAll')}
            </button>
          )}
        </div>

        {recent.length === 0 ? (
          <div className="rounded-xl p-5 text-center"
               style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
              {t('home.noPayments')}
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
              {t('home.noPaymentsBody')}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {recent.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={onHistory}
                className="flex items-center justify-between rounded-xl p-3.5 text-left"
                style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
              >
                <div>
                  <div className="font-semibold text-sm" style={{ color: 'var(--color-text)' }}>
                    {t(`review.purpose${p.purpose}`)}
                  </div>
                  <div className="mono text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                    {p.merchantId}
                  </div>
                </div>
                <div className="mono text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                  {formatFtc(p.amountMicroFtc)} FTC
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
