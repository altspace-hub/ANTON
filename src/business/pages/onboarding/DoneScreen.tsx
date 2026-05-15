/**
 * DoneScreen — onboarding wrap-up.
 *
 * Light theme. Shows the configured identity + a "Connect a wallet
 * later" reminder so the merchant knows where to go to enable FTC
 * payments when ready.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Logo from '../../components/Logo';
import PrimaryButton from '../../components/PrimaryButton';
import { loadConfig } from '../../services/merchant';
import type { MerchantConfig } from '../../services/types';

export default function DoneScreen({ onContinue }: { onContinue: () => void }) {
  const { t } = useTranslation();
  const [config, setConfig] = useState<MerchantConfig | null>(null);

  useEffect(() => {
    loadConfig().then(setConfig);
  }, []);

  return (
    <div className="flex flex-col h-full p-6 items-center safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="mt-8 mb-3">
        <Logo size={80} rounded="lg" />
      </div>
      <h2 className="text-2xl font-bold mb-1" style={{ color: 'var(--color-text)' }}>
        {t('done.title')}
      </h2>
      <p className="text-sm mb-5" style={{ color: 'var(--color-text-muted)' }}>
        {t('done.subtitle')}
      </p>

      {config && (
        <div className="w-full p-4 rounded-xl mb-4"
             style={{
               backgroundColor: 'var(--color-surface)',
               border: '1px solid var(--color-border)',
             }}>
          <div className="uppercase tracking-wider text-xs mb-1"
               style={{ color: 'var(--color-text-faint)' }}>
            {t('done.business')}
          </div>
          <div className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>
            {config.legalName}
          </div>
          <div className="mono text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
            {config.orgNr}
          </div>
          <div className="text-sm mt-3 pt-3"
               style={{
                 color: 'var(--color-text-muted)',
                 borderTop: '1px solid var(--color-border-soft)',
               }}>
            {t('done.defaultMode')} <span className="font-semibold"
                                style={{ color: 'var(--color-accent)' }}>
              {t(config.defaultMode === 'simple' ? 'mode.simpleTitle' : 'mode.extendedTitle')}
            </span>
          </div>
        </div>
      )}

      <div className="w-full p-4 rounded-xl"
           style={{
             backgroundColor: 'var(--color-accent-soft)',
             border: '1px solid var(--color-accent-dim)',
           }}>
        <div className="font-semibold mb-1" style={{ color: 'var(--color-accent)' }}>
          {t('done.nextTitle')}
        </div>
        <div className="text-xs leading-snug" style={{ color: 'var(--color-text-muted)' }}>
          {t('done.nextBody')}
        </div>
      </div>

      <div className="w-full mt-auto">
        <PrimaryButton onClick={onContinue}>{t('done.goToHome')}</PrimaryButton>
      </div>
    </div>
  );
}
