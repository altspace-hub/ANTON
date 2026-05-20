/**
 * PaymentDoneScreen — post-submit confirmation.
 *
 * Polls the local payment record every 3s so the status transitions
 * the background confirmation poller writes (`queued → confirmed`) are
 * reflected live. The icon, headline, and tone follow `record.status`:
 *   - submitting/queued/accepted → spinner + "submitting / waiting"
 *   - confirmed                  → check + "confirmed on chain"
 *   - failed                     → x + the error reason
 *   - recorded                   → legacy local-only receipt (no chain)
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import PrimaryButton from '../components/PrimaryButton';
import { formatFtc, getPaymentRecord } from '../services/payment';
import type { PaymentRecord, PaymentStatus } from '../services/types';

interface Props {
  record: PaymentRecord;
  onHome: () => void;
  onHistory: () => void;
}

const POLL_MS = 3_000;

export default function PaymentDoneScreen({ record: initial, onHome, onHistory }: Props) {
  const { t } = useTranslation();
  const [record, setRecord] = useState<PaymentRecord>(initial);

  // Live-refresh the record from IndexedDB while the user is on this
  // screen — the background poller in payment.ts updates the row when
  // the chain confirms.
  useEffect(() => {
    if (isTerminal(record.status)) return;
    let cancelled = false;
    const tick = async () => {
      const fresh = await getPaymentRecord(record.id);
      if (!cancelled && fresh) setRecord(fresh);
    };
    const id = window.setInterval(tick, POLL_MS);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [record.id, record.status]);

  const view = statusView(record.status);

  return (
    <div className="flex flex-col h-full overflow-y-auto safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="flex flex-col flex-1 px-6 pb-6">
        <div className="flex flex-col items-center text-center mt-10 mb-7">
          <span className="flex items-center justify-center w-20 h-20 rounded-full"
                style={{ backgroundColor: view.bg }}>
            {view.icon}
          </span>
          <h1 className="text-2xl font-bold mt-5" style={{ color: 'var(--color-text)' }}>
            {t(view.titleKey, view.titleFallback)}
          </h1>
          <p className="text-base leading-relaxed mt-2" style={{ color: 'var(--color-text-body)' }}>
            {t(view.bodyKey, view.bodyFallback)}
          </p>
          {record.status === 'failed' && record.error && (
            <p className="text-sm mt-2 mono break-all"
               style={{ color: 'var(--color-danger, #c0382b)' }}>
              {record.error}
            </p>
          )}
        </div>

        <div className="rounded-xl overflow-hidden mb-4"
             style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <Row label={t('paymentDone.amountPaid')}>
            <span className="mono text-sm font-bold" style={{ color: 'var(--color-text)' }}>
              {formatFtc(record.amountMicroFtc)} FTC
            </span>
          </Row>
          <Row label={t('paymentDone.toMerchant')} top>
            <span className="mono text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
              {record.merchantId}
            </span>
          </Row>
          {record.txId && (
            <Row label={t('paymentDone.txId', 'Tx id')} top>
              <span className="mono text-[11px] break-all max-w-[60%] text-right"
                    style={{ color: 'var(--color-text-body)' }}>
                {record.txId}
              </span>
            </Row>
          )}
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

function Row({ label, top, children }: { label: string; top?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-3"
         style={top ? { borderTop: '1px solid var(--color-border-soft)' } : undefined}>
      <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{label}</span>
      {children}
    </div>
  );
}

function isTerminal(s: PaymentStatus): boolean {
  return s === 'confirmed' || s === 'failed' || s === 'recorded';
}

interface View {
  bg: string;
  icon: React.ReactNode;
  titleKey: string;
  titleFallback: string;
  bodyKey: string;
  bodyFallback: string;
}

function statusView(s: PaymentStatus): View {
  const spinner = (
    <svg width="38" height="38" viewBox="0 0 24 24" fill="none"
         style={{ color: 'var(--color-accent)' }} className="animate-spin">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.6" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
  const check = (
    <svg width="38" height="38" viewBox="0 0 24 24" fill="none"
         style={{ color: 'var(--color-success)' }}>
      <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.6"
            strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  const cross = (
    <svg width="38" height="38" viewBox="0 0 24 24" fill="none"
         style={{ color: 'var(--color-danger, #c0382b)' }}>
      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.6"
            strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  switch (s) {
    case 'submitting':
      return {
        bg: 'var(--color-accent-soft)',
        icon: spinner,
        titleKey: 'paymentDone.submittingTitle',
        titleFallback: 'Submitting…',
        bodyKey: 'paymentDone.submittingBody',
        bodyFallback: 'Signing and forwarding to the network.',
      };
    case 'queued':
    case 'accepted':
      return {
        bg: 'var(--color-accent-soft)',
        icon: spinner,
        titleKey: 'paymentDone.queuedTitle',
        titleFallback: 'Awaiting confirmation',
        bodyKey: 'paymentDone.queuedBody',
        bodyFallback: 'Sent to the chain. Waiting for a miner to include it in a block.',
      };
    case 'confirmed':
      return {
        bg: 'var(--color-success-bg)',
        icon: check,
        titleKey: 'paymentDone.title',
        titleFallback: 'Payment confirmed',
        bodyKey: 'paymentDone.body',
        bodyFallback: 'Mined into a block on FutureChain.',
      };
    case 'failed':
      return {
        bg: 'var(--color-danger-bg, #fde8e8)',
        icon: cross,
        titleKey: 'paymentDone.failedTitle',
        titleFallback: 'Payment failed',
        bodyKey: 'paymentDone.failedBody',
        bodyFallback: 'The transaction was rejected. See details below.',
      };
    case 'recorded':
    default:
      return {
        bg: 'var(--color-success-bg)',
        icon: check,
        titleKey: 'paymentDone.title',
        titleFallback: 'Payment recorded',
        bodyKey: 'paymentDone.body',
        bodyFallback: 'Saved as a local receipt.',
      };
  }
}
