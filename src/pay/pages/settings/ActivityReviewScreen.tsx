/**
 * ActivityReviewScreen — the customer's spending pattern at a glance
 * plus a log of payments the light fraud engine flagged.
 *
 * Read-only and reflective: it helps the customer notice anything that
 * looked unusual after the fact, alongside the baseline the engine
 * compares against.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatFtc, listPayments, loadBehaviorProfile } from '../../services/payment';
import type { BehaviorProfile } from '../../services/behavior-profile';
import type { PaymentRecord } from '../../services/types';

interface Props {
  onBack: () => void;
}

function formatDate(ms: number): string {
  if (ms <= 0) return '—';
  return new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

export default function ActivityReviewScreen({ onBack }: Props) {
  const { t } = useTranslation();
  const [behavior, setBehavior] = useState<BehaviorProfile | null>(null);
  const [flagged, setFlagged] = useState<PaymentRecord[]>([]);

  useEffect(() => {
    void (async () => {
      const [b, payments] = await Promise.all([loadBehaviorProfile(), listPayments()]);
      setBehavior(b);
      setFlagged(payments.filter((p) => p.risk && p.risk.signals.length > 0));
    })();
  }, []);

  return (
    <div className="flex flex-col h-full overflow-y-auto safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="flex flex-col flex-1 px-6 pb-6">
        {/* Header */}
        <div className="flex items-center gap-3 -ml-2 mb-4">
          <button type="button" onClick={onBack} className="p-2 rounded-lg"
                  aria-label={t('common.back')} style={{ color: 'var(--color-text-muted)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h2 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>
            {t('activityReview.title')}
          </h2>
        </div>

        <p className="text-sm leading-relaxed mb-5" style={{ color: 'var(--color-text-muted)' }}>
          {t('activityReview.subtitle')}
        </p>

        {/* Usual pattern */}
        <h3 className="uppercase tracking-wider text-xs font-bold mb-2"
            style={{ color: 'var(--color-text-faint)' }}>
          {t('activityReview.patternHeading')}
        </h3>
        <div className="rounded-xl overflow-hidden mb-5"
             style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <PatternRow label={t('activityReview.payments')}
                      value={String(behavior?.count ?? 0)} first />
          <PatternRow label={t('activityReview.median')}
                      value={`${formatFtc(behavior?.medianMicroFtc ?? 0n)} FTC`} />
          <PatternRow label={t('activityReview.largest')}
                      value={`${formatFtc(behavior?.maxMicroFtc ?? 0n)} FTC`} />
          <PatternRow label={t('activityReview.merchants')}
                      value={String(behavior?.knownCounterparties.length ?? 0)} />
          <PatternRow label={t('activityReview.lastPayment')}
                      value={formatDate(behavior?.lastPaymentAt ?? 0)} />
        </div>

        {/* Flagged payments */}
        <h3 className="uppercase tracking-wider text-xs font-bold mb-2"
            style={{ color: 'var(--color-text-faint)' }}>
          {t('activityReview.flaggedHeading')}
        </h3>
        {flagged.length === 0 ? (
          <div className="rounded-xl p-5 text-center"
               style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
              {t('activityReview.empty')}
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
              {t('activityReview.emptyBody')}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {flagged.map((p) => {
              const level = p.risk?.level ?? 'clear';
              const accent = level === 'warning' ? 'var(--color-error)'
                : level === 'caution' ? 'var(--color-warning)'
                : 'var(--color-text-dim)';
              return (
                <div key={p.id} className="rounded-xl p-3.5"
                     style={{ backgroundColor: 'var(--color-surface)',
                              border: '1px solid var(--color-border)',
                              borderLeft: `3px solid ${accent}` }}>
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-sm" style={{ color: 'var(--color-text)' }}>
                      {t(`review.purpose${p.purpose}`)}
                    </div>
                    <div className="mono text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                      {formatFtc(p.amountMicroFtc)} FTC
                    </div>
                  </div>
                  <div className="text-xs mt-0.5 mb-2" style={{ color: 'var(--color-text-muted)' }}>
                    {p.merchantId} · {formatDate(p.paidAt)}
                  </div>
                  <div className="flex flex-col gap-1">
                    {(p.risk?.signals ?? []).map((s) => (
                      <div key={s.id} className="text-xs" style={{ color: 'var(--color-text-body)' }}>
                        • {t(s.messageKey, s.params)}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function PatternRow({ label, value, first }: { label: string; value: string; first?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-3"
         style={{ borderTop: first ? undefined : '1px solid var(--color-border-soft)' }}>
      <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{label}</span>
      <span className="mono text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{value}</span>
    </div>
  );
}
