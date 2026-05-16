/**
 * DoneScreen — onboarding confirmation. Shows the freshly-created
 * wallet address and hands off to Home.
 */
import { useTranslation } from 'react-i18next';
import PrimaryButton from '../../components/PrimaryButton';

interface Props {
  address: string;
  onContinue: () => void;
}

export default function DoneScreen({ address, onContinue }: Props) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col h-full overflow-y-auto safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="flex flex-col flex-1 px-6 pb-6">
        <div className="flex flex-col items-center text-center mt-10 mb-8">
          <span className="flex items-center justify-center w-20 h-20 rounded-full"
                style={{ backgroundColor: 'var(--color-success-bg)' }}>
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none"
                 style={{ color: 'var(--color-success)' }}>
              <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.6"
                    strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <h1 className="text-2xl font-bold mt-5" style={{ color: 'var(--color-text)' }}>
            {t('onboarding.doneTitle')}
          </h1>
          <p className="text-base leading-relaxed mt-2" style={{ color: 'var(--color-text-body)' }}>
            {t('onboarding.doneBody')}
          </p>
        </div>

        <div className="rounded-xl p-4"
             style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <div className="text-xs uppercase tracking-wider mb-1.5"
               style={{ color: 'var(--color-text-faint)' }}>
            {t('onboarding.yourAddress')}
          </div>
          <div className="mono text-sm break-all" style={{ color: 'var(--color-text)' }}>
            {address}
          </div>
        </div>

        <PrimaryButton onClick={onContinue}>{t('onboarding.startUsing')}</PrimaryButton>
      </div>
    </div>
  );
}
