/**
 * HistoryScreen — every recorded payment, newest first. Each row is a
 * local receipt; tapping one expands its full detail inline.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatFtc, listPayments } from '../services/payment';
import type { PaymentRecord } from '../services/types';

interface Props {
  onBack: () => void;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function HistoryScreen({ onBack }: Props) {
  const { t } = useTranslation();
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    void (async () => setPayments(await listPayments()))();
  }, []);

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
          <h2 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>
            {t('history.title')}
          </h2>
        </div>

        {payments.length === 0 ? (
          <div className="rounded-xl p-6 text-center mt-4"
               style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
              {t('history.empty')}
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
              {t('history.emptyBody')}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {payments.map((p) => {
              const open = expanded === p.id;
              return (
                <div key={p.id} className="rounded-xl overflow-hidden"
                     style={{ backgroundColor: 'var(--color-surface)',
                              border: '1px solid var(--color-border)' }}>
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : p.id)}
                    className="w-full flex items-center justify-between p-3.5 text-left"
                  >
                    <div>
                      <div className="font-semibold text-sm" style={{ color: 'var(--color-text)' }}>
                        {t(`review.purpose${p.purpose}`)}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                        {t('history.paidOn', { date: formatDate(p.paidAt) })}
                      </div>
                    </div>
                    <div className="mono text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                      {formatFtc(p.amountMicroFtc)} FTC
                    </div>
                  </button>
                  {open && (
                    <div className="px-3.5 pb-3.5 pt-1"
                         style={{ borderTop: '1px solid var(--color-border-soft)' }}>
                      <DetailRow label={t('history.merchant')} value={p.merchantId} />
                      <DetailRow label={t('history.orderId')} value={p.orderId} />
                      <DetailRow label={t('history.amount')}
                                 value={`${formatFtc(p.amountMicroFtc)} FTC`} />
                      <DetailRow label={t('history.reference')} value={p.ref} wrap />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value, wrap }: { label: string; value: string; wrap?: boolean }) {
  return (
    <div className="flex justify-between gap-4 py-1.5">
      <span className="text-xs shrink-0" style={{ color: 'var(--color-text-faint)' }}>{label}</span>
      <span className={`mono text-xs text-right ${wrap ? 'break-all' : ''}`}
            style={{ color: 'var(--color-text-body)' }}>
        {value}
      </span>
    </div>
  );
}
