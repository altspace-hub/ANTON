/**
 * WelcomeScreen — onboarding step 1.
 *
 * Light theme. Blue-chevron logo top-centre, three value props,
 * primary CTA. Wallet generation is no longer part of onboarding —
 * the merchant can configure the app and start issuing kvittos
 * without committing to a crypto wallet; the FTC payment path is
 * unlocked later in Settings → Connect wallet.
 */
import { useTranslation } from 'react-i18next';
import Logo from '../../components/Logo';
import PrimaryButton from '../../components/PrimaryButton';

export default function WelcomeScreen({ onContinue }: { onContinue: () => void }) {
  const { t } = useTranslation();
  const bullets = [
    t('welcome.bullet1'),
    t('welcome.bullet2'),
    t('welcome.bullet3'),
    t('welcome.bullet4'),
  ];

  return (
    <div className="flex flex-col h-full p-6 safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="flex flex-col items-center mt-6 mb-4">
        <Logo size={88} rounded="lg" />
      </div>
      <h1 className="text-3xl font-bold text-center"
          style={{ color: 'var(--color-accent)' }}>
        {t('welcome.title')}
      </h1>
      <p className="mt-2 mb-8 text-center text-base"
         style={{ color: 'var(--color-text-muted)' }}>
        {t('welcome.subtitle')}
      </p>

      <ul className="flex flex-col gap-3.5 mb-auto"
          style={{ color: 'var(--color-text-body)' }}>
        {bullets.map((b) => (
          <li key={b} className="flex gap-3 items-start">
            <span className="text-lg leading-snug"
                  style={{ color: 'var(--color-accent)' }}>•</span>
            <span className="text-base leading-snug flex-1">{b}</span>
          </li>
        ))}
      </ul>

      <PrimaryButton onClick={onContinue}>{t('welcome.getStarted')}</PrimaryButton>

      <p className="text-center text-xs mt-4"
         style={{ color: 'var(--color-text-faint)' }}>
        {t('welcome.footer')}
      </p>
    </div>
  );
}
