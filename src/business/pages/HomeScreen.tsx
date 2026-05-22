/**
 * HomeScreen — main hub, light theme.
 *
 * Header carries the chevron logo + the merchant's legal name + a
 * settings cog. The two sale buttons promote the defaultMode the
 * merchant picked during onboarding by making it the larger card.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Logo from '../components/Logo';
import { loadConfig } from '../services/merchant';
import type { MerchantConfig } from '../services/types';

interface Props {
  onSimple: () => void;
  onExtended: () => void;
  onReceipts: () => void;
  onSettings: () => void;
}

export default function HomeScreen({ onSimple, onExtended, onReceipts, onSettings }: Props) {
  const { t } = useTranslation();
  const [config, setConfig] = useState<MerchantConfig | null>(null);

  useEffect(() => {
    loadConfig().then(setConfig);
  }, []);

  const defaultMode = config?.defaultMode ?? 'simple';
  const walletConnected = !!config?.safelloReceiveAddress;

  return (
    <div className="flex flex-col h-full p-6 safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-3">
          <Logo size={44} rounded="md" />
          <div>
            <h2 className="text-lg font-bold leading-tight"
                style={{ color: 'var(--color-text)' }}>
              {config?.legalName ?? 'ANTON Business'}
            </h2>
            {config && (
              <p className="mono text-[11px] mt-0.5"
                 style={{ color: 'var(--color-text-faint)' }}>
                {config.orgNr}
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onSettings}
          className="p-2 -mr-2 rounded-lg"
          aria-label={t('home.settings')}
          style={{ color: 'var(--color-text-muted)' }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" strokeWidth="1.8" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
                  stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {!walletConnected && (
        <div className="mt-3 p-3 rounded-lg"
             style={{
               backgroundColor: 'var(--color-warning-bg)',
               border: '1px solid var(--color-warning)',
             }}>
          <div className="text-xs font-semibold mb-0.5"
               style={{ color: 'var(--color-warning)' }}>
            {t('home.noWalletTitle')}
          </div>
          <div className="text-xs leading-snug"
               style={{ color: 'var(--color-text-body)' }}>
            {t('home.noWalletBody')}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 mt-6">
        <SaleCard
          title={t('home.simpleSale')}
          body={t('home.simpleSaleBody')}
          onClick={onSimple}
          large={defaultMode === 'simple'}
        />
        <SaleCard
          title={t('home.extendedSale')}
          body={t('home.extendedSaleBody')}
          onClick={onExtended}
          large={defaultMode === 'extended'}
        />
      </div>

      {/* Receipts history — browse + reopen any past kvitto. */}
      <button
        type="button"
        onClick={onReceipts}
        className="text-left rounded-xl mt-3 flex items-center justify-between transition-transform active:scale-[0.98]"
        style={{
          padding: '16px 18px',
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
        }}
      >
        <div>
          <div className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>
            {t('home.receipts', 'Receipts')}
          </div>
          <div className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            {t('home.receiptsBody', 'Browse and reopen past kvittos.')}
          </div>
        </div>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
             style={{ color: 'var(--color-text-dim)' }}>
          <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div className="mt-auto text-center text-[11px]"
           style={{ color: 'var(--color-text-faint)' }}>
        {t('home.version')}
      </div>
    </div>
  );
}

function SaleCard({
  title, body, onClick, large,
}: { title: string; body: string; onClick: () => void; large: boolean }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-xl transition-transform active:scale-[0.98]"
      style={{
        padding: large ? '24px' : '18px',
        backgroundColor: large ? 'var(--color-accent)' : 'var(--color-surface)',
        color: large ? 'var(--color-accent-fg)' : 'var(--color-text)',
        border: large ? 'none' : '1px solid var(--color-border)',
      }}
    >
      <div className="flex justify-between items-start">
        <div className={large ? 'text-xl font-bold' : 'text-base font-semibold'}>
          {title}
        </div>
        {large && (
          <div className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded"
               style={{
                 backgroundColor: 'rgba(255,255,255,0.18)',
                 color: 'var(--color-accent-fg)',
               }}>
            {t('home.default')}
          </div>
        )}
      </div>
      <div className="text-sm mt-1"
           style={{
             color: large ? 'rgba(255,255,255,0.85)' : 'var(--color-text-muted)',
           }}>
        {body}
      </div>
    </button>
  );
}
