/**
 * WalletConnectScreen — first-time wallet setup.
 *
 * Generates a secp256k1 keypair locally; the private key lives in the
 * device keychain via secure-store. Mirrors the Business app's
 * ConnectWalletScreen visually so the merchant ↔ customer ANTON-suite
 * feels coherent on the same phone.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Logo from '../../components/Logo';
import { createAndStoreWallet } from '../../services/wallet';

type State = 'idle' | 'creating' | 'error';

interface Props {
  onConnected: (address: string) => void;
}

export default function WalletConnectScreen({ onConnected }: Props) {
  const { t } = useTranslation();
  const [state, setState] = useState<State>('idle');
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setState('creating');
    setError(null);
    try {
      const w = await createAndStoreWallet();
      onConnected(w.address);
    } catch (err) {
      setError((err as Error).message);
      setState('error');
    }
  }

  return (
    <section className="flex flex-col h-full px-5 pt-6 pb-6 safe-bottom">
      <h1 className="text-2xl font-semibold text-[var(--color-text)]">{t('wallet.title')}</h1>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">
        {t('wallet.setupTitle')}
      </p>

      <div className="flex flex-col items-center mt-10 mb-2">
        <Logo size={72} rounded="lg" />
      </div>

      {state === 'idle' && (
        <>
          <p className="mt-6 text-[15px] leading-relaxed text-center text-[var(--color-text-body)]">
            {t('wallet.setupExplain')}
          </p>
          <p className="mt-3 text-[13px] leading-relaxed text-center text-[var(--color-text-muted)]">
            {t('wallet.setupAddressNote')}
          </p>
          <button
            type="button"
            onClick={generate}
            className="mt-auto w-full py-4 rounded-xl font-bold text-base text-[var(--color-accent-fg)] bg-[var(--color-accent)]"
          >
            {t('wallet.createWallet')}
          </button>
        </>
      )}

      {state === 'creating' && (
        <div className="flex flex-col items-center gap-3 py-12">
          <div
            className="w-10 h-10 rounded-full animate-spin"
            style={{
              border: '3px solid var(--color-border)',
              borderTopColor: 'var(--color-accent)',
            }}
          />
          <p className="text-sm text-[var(--color-text-muted)]">{t('wallet.generating')}</p>
        </div>
      )}

      {state === 'error' && (
        <>
          <p className="mt-6 text-[15px] text-center text-[var(--color-red)]">
            {error ?? t('common.errUnknown')}
          </p>
          <button
            type="button"
            onClick={() => setState('idle')}
            className="mt-auto w-full py-4 rounded-xl font-bold text-base text-[var(--color-accent-fg)] bg-[var(--color-accent)]"
          >
            {t('common.retry')}
          </button>
        </>
      )}
    </section>
  );
}
