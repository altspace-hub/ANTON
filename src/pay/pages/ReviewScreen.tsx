/**
 * ReviewScreen — the customer reviews a decoded payment before
 * confirming it.
 *
 * Shows the FTC amount (primary) plus an estimated SEK figure, the
 * merchant, and a live expiry countdown. If the QR's expiry passes
 * while the screen is open the confirm button locks out.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import PrimaryButton from '../components/PrimaryButton';
import {
  estimateSek, formatFtc, formatSek, isExpired,
  loadBehaviorProfile, recordPayment, secondsUntilExpiry,
} from '../services/payment';
import { loadProfile } from '../services/profile';
import { loadPayerIdentity } from '../services/payment-identity';
import { loadMoneyProfile } from '../services/money-profile';
import { loadWallet } from '../services/wallet';
import { assembleDraft } from '../services/pacs008-draft';
import { assessPayment, type FraudAssessment } from '../services/fraud-engine';
import type { pacs008 } from '@futurechain/sdk';
import type { DecodedPayment, PaymentRecord } from '../services/types';

interface Props {
  payment: DecodedPayment;
  onCancel: () => void;
  onConfirmed: (record: PaymentRecord) => void;
}

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function ReviewScreen({ payment, onCancel, onConfirmed }: Props) {
  const { t } = useTranslation();
  const [ftcPerSek, setFtcPerSek] = useState(0.1);
  const [secsLeft, setSecsLeft] = useState<number | null>(() => secondsUntilExpiry(payment));
  const [expired, setExpired] = useState(() => isExpired(payment));
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<pacs008.Pacs008Draft | null>(null);
  const [isoOpen, setIsoOpen] = useState(false);
  const [assessment, setAssessment] = useState<FraudAssessment | null>(null);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    void (async () => {
      const [profile, identity, wallet, money, behavior] = await Promise.all([
        loadProfile(), loadPayerIdentity(), loadWallet(),
        loadMoneyProfile(), loadBehaviorProfile(),
      ]);
      if (profile) setFtcPerSek(profile.ftcPerSek);
      if (wallet) setDraft(assembleDraft(identity, wallet.address, payment));
      setAssessment(assessPayment(
        {
          amountMicroFtc: payment.amountMicroFtc,
          counterparty: payment.merchantId,
          purpose: payment.purpose,
          expUnixSeconds: payment.expUnixSeconds,
          now: Date.now(),
        },
        money,
        behavior,
      ));
    })();
  }, [payment]);

  // Live expiry countdown.
  useEffect(() => {
    if (payment.expUnixSeconds <= 0) return;
    const tick = () => {
      setSecsLeft(secondsUntilExpiry(payment));
      setExpired(isExpired(payment));
    };
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [payment]);

  async function confirm() {
    if (expired || busy) return;
    // A 'warning'-level assessment takes a deliberate second tap — the
    // engine is advisory, never a hard block.
    if (assessment?.level === 'warning' && !armed) {
      setArmed(true);
      return;
    }
    setBusy(true);
    try {
      const record = await recordPayment(payment, assessment ?? undefined);
      onConfirmed(record);
    } catch {
      setBusy(false);
    }
  }

  const sek = estimateSek(payment.amountMicroFtc, ftcPerSek);

  const rows: Array<{ label: string; value: string }> = [
    { label: t('review.merchant'), value: payment.merchantId },
    { label: t('review.orderId'), value: payment.orderId },
    { label: t('review.purpose'), value: t(`review.purpose${payment.purpose}`) },
  ];
  if (payment.itemCount !== null) {
    rows.push({ label: t('review.items'), value: String(payment.itemCount) });
  }
  if (payment.vatMicroFtc !== null && payment.vatMicroFtc > 0n) {
    rows.push({ label: t('review.vat'), value: `${formatFtc(payment.vatMicroFtc)} FTC` });
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="flex flex-col flex-1 px-6 pb-6">
        {/* Header */}
        <div className="flex items-center gap-3 -ml-2 mb-5">
          <button type="button" onClick={onCancel} className="p-2 rounded-lg"
                  aria-label={t('common.cancel')} style={{ color: 'var(--color-text-muted)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h2 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>
            {t('review.title')}
          </h2>
        </div>

        {/* Amount card */}
        <div className="rounded-2xl p-6 text-center mb-4"
             style={{ backgroundColor: 'var(--color-accent-soft)',
                      border: '1px solid var(--color-accent-dim)' }}>
          <div className="text-xs uppercase tracking-wider mb-1"
               style={{ color: 'var(--color-text-faint)' }}>
            {t('review.youPay')}
          </div>
          <div className="text-4xl font-bold mono" style={{ color: 'var(--color-text)' }}>
            {formatFtc(payment.amountMicroFtc)} <span className="text-2xl">FTC</span>
          </div>
          <div className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
            {t('review.estimated', { amount: formatSek(sek) })}
          </div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-dim)' }}>
            {t('review.estimatedNote', { rate: (1 / ftcPerSek).toLocaleString('sv-SE') })}
          </div>
        </div>

        {/* Detail rows */}
        <div className="rounded-xl overflow-hidden mb-4"
             style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          {rows.map((r, i) => (
            <div key={r.label}
                 className="flex items-center justify-between px-4 py-3"
                 style={{ borderTop: i === 0 ? undefined : '1px solid var(--color-border-soft)' }}>
              <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{r.label}</span>
              <span className="mono text-sm font-semibold text-right" style={{ color: 'var(--color-text)' }}>
                {r.value}
              </span>
            </div>
          ))}
        </div>

        {/* ISO 20022 / PACS.008 details */}
        {draft && (
          <div className="rounded-xl overflow-hidden mb-4"
               style={{ backgroundColor: 'var(--color-surface)',
                        border: '1px solid var(--color-border)' }}>
            <button
              type="button"
              onClick={() => setIsoOpen((o) => !o)}
              className="w-full flex items-center justify-between px-4 py-3 text-left"
            >
              <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                {t('review.iso.title')}
              </span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                   style={{ color: 'var(--color-text-dim)',
                            transform: isoOpen ? 'rotate(90deg)' : 'none' }}>
                <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2"
                      strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {isoOpen && (
              <div className="px-4 pb-3 pt-1"
                   style={{ borderTop: '1px solid var(--color-border-soft)' }}>
                <IsoRow label={t('review.iso.debtor')}
                        value={`${draft.debtor.name} · ${draft.debtor.country}`} />
                <IsoRow label={t('review.iso.creditor')}
                        value={`${draft.creditor.name} · ${draft.creditor.country}`} />
                <IsoRow label={t('review.iso.purpose')} value={draft.purpose} />
                <IsoRow label={t('review.iso.reference')} value={draft.reference} wrap />
                <p className="text-xs mt-2" style={{ color: 'var(--color-text-faint)' }}>
                  {t('review.iso.note')}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Light fraud-engine assessment */}
        {assessment && assessment.signals.length > 0 && (() => {
          const top = assessment.signals.some((s) => s.severity === 'warning') ? 'warning'
            : assessment.signals.some((s) => s.severity === 'caution') ? 'caution'
            : 'info';
          const tone = {
            warning: { bg: 'var(--color-error-bg)', line: 'var(--color-error)', fg: 'var(--color-error)' },
            caution: { bg: 'var(--color-warning-bg)', line: 'var(--color-warning)', fg: 'var(--color-warning)' },
            info:    { bg: 'var(--color-accent-soft)', line: 'var(--color-accent-dim)', fg: 'var(--color-text)' },
          }[top];
          return (
            <div className="rounded-xl p-4 mb-3"
                 style={{ backgroundColor: tone.bg, border: `1px solid ${tone.line}` }}>
              <div className="font-bold text-sm mb-2" style={{ color: tone.fg }}>
                {t(`fraud.title.${top}`)}
              </div>
              <div className="flex flex-col gap-1.5">
                {assessment.signals.map((s) => (
                  <div key={s.id} className="flex gap-2 items-start">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor:
                            s.severity === 'warning' ? 'var(--color-error)'
                            : s.severity === 'caution' ? 'var(--color-warning)'
                            : 'var(--color-text-dim)' }} />
                    <span className="text-sm" style={{ color: 'var(--color-text-body)' }}>
                      {t(s.messageKey, s.params)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Expiry / status */}
        {expired ? (
          <div className="rounded-xl p-4 mb-2"
               style={{ backgroundColor: 'var(--color-error-bg)', border: '1px solid var(--color-error)' }}>
            <div className="font-bold text-sm" style={{ color: 'var(--color-error)' }}>
              {t('review.expired')}
            </div>
            <div className="text-sm mt-1" style={{ color: 'var(--color-text-body)' }}>
              {t('review.expiredBody')}
            </div>
          </div>
        ) : secsLeft !== null ? (
          <div className="text-center text-sm mb-2"
               style={{ color: secsLeft < 60 ? 'var(--color-warning)' : 'var(--color-text-muted)' }}>
            {t('review.expires', { time: formatDuration(secsLeft) })}
          </div>
        ) : null}

        <PrimaryButton onClick={confirm} disabled={expired || busy}
                       style={armed ? { backgroundColor: 'var(--color-error)' } : undefined}>
          {busy ? t('review.confirming')
            : armed ? t('fraud.payAnyway')
            : t('review.confirm')}
        </PrimaryButton>
        {armed && (
          <p className="text-center text-xs mt-2" style={{ color: 'var(--color-error)' }}>
            {t('fraud.payAnywayHint')}
          </p>
        )}
      </div>
    </div>
  );
}

function IsoRow({ label, value, wrap }: { label: string; value: string; wrap?: boolean }) {
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
