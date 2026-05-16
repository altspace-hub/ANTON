/**
 * WelcomeScreen — onboarding step 1 (and only step).
 *
 * Introduces ANTON Pay and creates the wallet. A payments app needs a
 * wallet to do anything, so onboarding is a single decisive action:
 * "Create my wallet". On success it also writes a default profile,
 * which is what hasProfile() keys on for resume-vs-onboard.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Logo from '../../components/Logo';
import PrimaryButton from '../../components/PrimaryButton';
import { createAndStoreWallet, hasWallet, loadWallet } from '../../services/wallet';
import { createDefaultProfile, saveProfile } from '../../services/profile';

interface Props {
  onWalletReady: (address: string) => void;
}

export default function WelcomeScreen({ onWalletReady }: Props) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      // Reset can leave a wallet behind without a profile — reuse it
      // rather than throwing on the "already exists" guard.
      const wallet = (await hasWallet())
        ? await loadWallet()
        : await createAndStoreWallet();
      if (!wallet) throw new Error('wallet unavailable');
      await saveProfile(createDefaultProfile());
      onWalletReady(wallet.address);
    } catch {
      setError(t('scan.cameraError') /* generic failure copy reused */);
      setBusy(false);
    }
  }

  const features = [t('onboarding.feature1'), t('onboarding.feature2'), t('onboarding.feature3')];

  return (
    <div className="flex flex-col h-full overflow-y-auto safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="flex flex-col flex-1 px-6 pb-6">
        <div className="flex flex-col items-center text-center mt-8 mb-8">
          <Logo size={84} rounded="lg" />
          <h1 className="text-3xl font-bold mt-5" style={{ color: 'var(--color-text)' }}>
            {t('onboarding.welcomeTitle')}
          </h1>
          <div className="text-base font-semibold mt-1" style={{ color: 'var(--color-accent)' }}>
            {t('onboarding.welcomeTagline')}
          </div>
        </div>

        <p className="text-base leading-relaxed mb-6" style={{ color: 'var(--color-text-body)' }}>
          {t('onboarding.welcomeBody')}
        </p>

        <div className="flex flex-col gap-3 mb-6">
          {features.map((f) => (
            <div key={f} className="flex items-center gap-3">
              <span className="flex items-center justify-center w-7 h-7 rounded-full shrink-0"
                    style={{ backgroundColor: 'var(--color-accent-soft)' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                     style={{ color: 'var(--color-accent)' }}>
                  <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.6"
                        strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span className="text-sm" style={{ color: 'var(--color-text-body)' }}>{f}</span>
            </div>
          ))}
        </div>

        {error && (
          <div className="rounded-lg p-3 mb-4 text-sm"
               style={{ backgroundColor: 'var(--color-error-bg)', color: 'var(--color-error)' }}>
            {error}
          </div>
        )}

        <PrimaryButton onClick={create} disabled={busy}>
          {busy ? t('onboarding.creating') : t('onboarding.createWallet')}
        </PrimaryButton>
      </div>
    </div>
  );
}
