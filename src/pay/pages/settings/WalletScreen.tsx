/**
 * WalletScreen — shows the customer's wallet address with a copy
 * action. The private key never surfaces here; it stays in the
 * phone's secure storage.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { hasWallet, loadWallet } from '../../services/wallet';

interface Props {
  onBack: () => void;
}

export default function WalletScreen({ onBack }: Props) {
  const { t } = useTranslation();
  const [address, setAddress] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void (async () => {
      if (await hasWallet()) {
        const w = await loadWallet();
        setAddress(w?.address ?? null);
      }
      setLoaded(true);
    })();
  }, []);

  async function copy() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable — no-op */
    }
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="flex flex-col flex-1 px-6 pb-6">
        {/* Header */}
        <div className="flex items-center gap-3 -ml-2 mb-5">
          <button type="button" onClick={onBack} className="p-2 rounded-lg"
                  aria-label={t('common.back')} style={{ color: 'var(--color-text-muted)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h2 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>
            {t('wallet.title')}
          </h2>
        </div>

        {loaded && address && (
          <>
            <div className="rounded-xl p-4 mb-3"
                 style={{ backgroundColor: 'var(--color-surface)',
                          border: '1px solid var(--color-border)' }}>
              <div className="text-xs uppercase tracking-wider mb-1.5"
                   style={{ color: 'var(--color-text-faint)' }}>
                {t('wallet.addressLabel')}
              </div>
              <div className="mono text-sm break-all" style={{ color: 'var(--color-text)' }}>
                {address}
              </div>
              <p className="text-xs mt-3" style={{ color: 'var(--color-text-muted)' }}>
                {t('wallet.addressHelp')}
              </p>
            </div>

            <button type="button" onClick={copy}
                    className="w-full py-3.5 rounded-xl text-sm font-semibold mb-3"
                    style={{ backgroundColor: 'var(--color-accent)',
                             color: 'var(--color-accent-fg)' }}>
              {copied ? t('wallet.copied') : t('wallet.copy')}
            </button>

            <div className="rounded-xl p-4"
                 style={{ backgroundColor: 'var(--color-accent-soft)',
                          border: '1px solid var(--color-accent-dim)' }}>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-body)' }}>
                {t('wallet.keyNote')}
              </p>
            </div>
          </>
        )}

        {loaded && !address && (
          <div className="rounded-xl p-6 text-center mt-4"
               style={{ backgroundColor: 'var(--color-surface)',
                        border: '1px solid var(--color-border)' }}>
            <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
              {t('wallet.noWallet')}
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
              {t('wallet.noWalletBody')}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
