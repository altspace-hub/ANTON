/**
 * ConnectWalletScreen — generates the merchant's secp256k1 wallet
 * post-onboarding. Same flow as the Expo project's GenerateScreen,
 * relocated to Settings so the merchant can configure + try the app
 * before committing to crypto.
 *
 * On success it sets the merchant config's safelloReceiveAddress to
 * the freshly-generated wallet address (the default; the merchant
 * can override it later if Safello gives them a sweep address).
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Logo from '../../components/Logo';
import PrimaryButton from '../../components/PrimaryButton';
import { loadConfig, saveConfig } from '../../services/merchant';
import { createAndStoreWallet, hasWallet, loadWallet } from '../../services/wallet';

type State = 'idle' | 'creating' | 'done' | 'existing' | 'error';

export default function ConnectWalletScreen({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const [state, setState] = useState<State>('idle');
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (await hasWallet()) {
        const w = await loadWallet();
        if (w) {
          setAddress(w.address);
          setState('existing');
        }
      }
    })();
  }, []);

  async function generate() {
    setState('creating');
    setError(null);
    try {
      const w = await createAndStoreWallet();
      // Wire the wallet address into the merchant config so sale
      // screens unlock the QR phase immediately.
      const cfg = await loadConfig();
      if (cfg) {
        await saveConfig({ ...cfg, safelloReceiveAddress: w.address });
      }
      setAddress(w.address);
      setState('done');
    } catch (err) {
      setError((err as Error).message);
      setState('error');
    }
  }

  return (
    <div className="flex flex-col h-full p-6 safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <Header title={t('wallet.title')} onBack={onBack} />

      <div className="flex flex-col items-center mt-6 mb-4">
        <Logo size={72} rounded="lg" />
      </div>

      {state === 'idle' && (
        <>
          <p className="text-[15px] leading-snug mb-3 text-center"
             style={{ color: 'var(--color-text-body)' }}>
            {t('wallet.generateDesc1')}
          </p>
          <p className="text-[13px] leading-snug mb-6 text-center"
             style={{ color: 'var(--color-text-muted)' }}>
            {t('wallet.generateDesc2')}
          </p>
          <PrimaryButton onClick={generate}>{t('wallet.generateWallet')}</PrimaryButton>
        </>
      )}

      {state === 'creating' && (
        <div className="flex flex-col items-center gap-3 py-12">
          <Spinner />
          <p className="text-[15px]" style={{ color: 'var(--color-text-muted)' }}>
            {t('wallet.generating')}
          </p>
        </div>
      )}

      {(state === 'done' || state === 'existing') && address && (
        <>
          {state === 'done' && (
            <p className="text-center mb-3 text-base font-semibold"
               style={{ color: 'var(--color-accent)' }}>
              {t('wallet.walletConnected')}
            </p>
          )}
          {state === 'existing' && (
            <p className="text-center text-sm mb-3"
               style={{ color: 'var(--color-warning)' }}>
              {t('wallet.walletExists')}
            </p>
          )}
          <div className="uppercase tracking-wider text-xs mb-1.5"
               style={{ color: 'var(--color-text-faint)' }}>
            {t('wallet.yourAddress')}
          </div>
          <div className="p-4 rounded-lg mono text-[13px] leading-snug break-all"
               style={{
                 backgroundColor: 'var(--color-surface)',
                 color: 'var(--color-accent)',
                 border: '1px solid var(--color-border)',
               }}>
            {address}
          </div>
          <p className="text-[13px] leading-snug mt-4"
             style={{ color: 'var(--color-text-muted)' }}>
            {t('wallet.addressPublic')}
          </p>
          <PrimaryButton onClick={onBack}>{t('wallet.done')}</PrimaryButton>
        </>
      )}

      {state === 'error' && (
        <>
          <p className="text-[15px] mb-4 text-center" style={{ color: 'var(--color-error)' }}>
            {error ?? t('wallet.unknownError')}
          </p>
          <PrimaryButton onClick={() => setState('idle')}>{t('common.tryAgain')}</PrimaryButton>
        </>
      )}
    </div>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3 -ml-2">
      <button type="button" onClick={onBack} className="p-2 rounded-lg" aria-label={t('common.back')}
              style={{ color: 'var(--color-text-muted)' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <h2 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>{title}</h2>
    </div>
  );
}

function Spinner() {
  return (
    <div
      className="w-10 h-10 rounded-full animate-spin"
      style={{
        border: '3px solid var(--color-border)',
        borderTopColor: 'var(--color-accent)',
      }}
    />
  );
}
