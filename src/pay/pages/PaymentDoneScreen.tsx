/**
 * PaymentDoneScreen — confirmation after a payment is recorded.
 */
import { useTranslation } from 'react-i18next';
import PrimaryButton from '../components/PrimaryButton';
import { formatFtc } from '../services/payment';
import type { PaymentRecord } from '../services/types';

interface Props {
  record: PaymentRecord;
  onHome: () => void;
  onHistory: () => void;
}

export default function PaymentDoneScreen({ record, onHome, onHistory }: Props) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col h-full overflow-y-auto safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="flex flex-col flex-1 px-6 pb-6">
        <div className="flex flex-col items-center text-center mt-10 mb-7">
          <span className="flex items-center justify-center w-20 h-20 rounded-full"
                style={{ backgroundColor: 'var(--color-success-bg)' }}>
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none"
                 style={{ color: 'var(--color-success)' }}>
              <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.6"
                    strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <h1 className="text-2xl font-bold mt-5" style={{ color: 'var(--color-text)' }}>
            {t('paymentDone.title')}
          </h1>
          <p className="text-base leading-relaxed mt-2" style={{ color: 'var(--color-text-body)' }}>
            {t('paymentDone.body')}
          </p>
        </div>

        <div className="rounded-xl overflow-hidden mb-4"
             style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              {t('paymentDone.amountPaid')}
            </span>
            <span className="mono text-sm font-bold" style={{ color: 'var(--color-text)' }}>
              {formatFtc(record.amountMicroFtc)} FTC
            </span>
          </div>
          <div className="flex items-center justify-between px-4 py-3"
               style={{ borderTop: '1px solid var(--color-border-soft)' }}>
            <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              {t('paymentDone.toMerchant')}
            </span>
            <span className="mono text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
              {record.merchantId}
            </span>
          </div>
        </div>

        <div className="mt-auto flex flex-col gap-2.5">
          <PrimaryButton onClick={onHome} marginTopAuto={false}>
            {t('paymentDone.backHome')}
          </PrimaryButton>
          <button type="button" onClick={onHistory}
                  className="w-full py-3.5 rounded-xl text-sm font-semibold"
                  style={{ backgroundColor: 'var(--color-surface)',
                           border: '1px solid var(--color-border)',
                           color: 'var(--color-text-body)' }}>
            {t('paymentDone.viewHistory')}
          </button>
        </div>
      </div>
    </div>
  );
}
