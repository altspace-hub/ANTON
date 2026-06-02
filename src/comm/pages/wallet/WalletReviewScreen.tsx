/**
 * WalletReviewScreen — review a parsed pay URI before signing (#79 wallet parity).
 *
 * The second step of the send flow (compose → review → sign), mirroring the Pay
 * app's ReviewScreen: an amount card with the network fee + total + (when the
 * rate oracle is live) a SEK estimate, the ISO 20022 draft, a light fraud
 * assessment, the payment-type selector, and an expiry lock. Confirm runs
 * sendOnChain (biometric gate inside) + records the WalletTx with the signed fee.
 *
 * Phase 1 of #79. The Travel-Rule + address-poisoning gates (Phase 2) and the
 * PIN/passphrase modal chain (Phase 3) layer on top of this screen.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import PrimaryButton from '../../components/PrimaryButton';
import { recordTx, loadBehaviorProfile } from '../../services/transactions';
import { loadWallet } from '../../services/wallet';
import { loadPayerIdentity } from '../../services/payment-identity';
import { loadMoneyProfile } from '../../services/money-profile';
import { assembleDraft, type Pacs008Draft } from '../../services/pacs008-draft';
import { assessPayment, type FraudAssessment } from '../../services/fraud-engine';
import { sendOnChain, formatFtc, feeMicroFtcFor } from '../../services/payment';
import { getDisplayQuote, microFtcToFiatLabel, type Quote } from '../../services/fx';
import {
  PAYMENT_TYPES, DEFAULT_PAYMENT_TYPE, paymentTypeMeta, type PaymentType,
} from '../../services/payment-type';
import type { ParsedPayUri } from './WalletSendScreen';

interface Props {
  parsed: ParsedPayUri;
  onBack: () => void;
  onConfirmed: () => void;
}

export default function WalletReviewScreen({ parsed, onBack, onConfirmed }: Props) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Pacs008Draft | null>(null);
  const [isoOpen, setIsoOpen] = useState(false);
  const [assessment, setAssessment] = useState<FraudAssessment | null>(null);
  const [armed, setArmed] = useState(false);
  const [paymentType, setPaymentType] = useState<PaymentType>(DEFAULT_PAYMENT_TYPE);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secsLeft, setSecsLeft] = useState<number | null>(
    parsed.expUnix ? parsed.expUnix - Math.floor(Date.now() / 1000) : null,
  );

  const expired = secsLeft !== null && secsLeft <= 0;
  const feeMF = feeMicroFtcFor(parsed.amountMicroFtc);

  // ISO 20022 draft from the saved payer identity (debtor) + wallet address.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [identity, wallet] = await Promise.all([loadPayerIdentity(), loadWallet()]);
        if (cancelled) return;
        if (!wallet) { setDraft(null); return; }
        setDraft(assembleDraft(identity, wallet.address, {
          to: parsed.to, amountMicroFtc: parsed.amountMicroFtc, ref: parsed.ref, creditor: parsed.creditor,
        }));
      } catch { if (!cancelled) setDraft(null); }
    })();
    return () => { cancelled = true; };
  }, [parsed]);

  // Light fraud assessment vs the money + behaviour profiles. Advisory only.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [money, behavior] = await Promise.all([loadMoneyProfile(), loadBehaviorProfile()]);
        if (cancelled) return;
        setAssessment(assessPayment(
          { amountMicroFtc: parsed.amountMicroFtc, counterparty: parsed.to, purpose: '',
            expUnixSeconds: parsed.expUnix ?? 0, now: Date.now() },
          money, behavior,
        ));
      } catch { if (!cancelled) setAssessment(null); }
    })();
    return () => { cancelled = true; };
  }, [parsed]);

  // SEK estimate — only shown when the rate oracle is live (null otherwise).
  useEffect(() => {
    let cancelled = false;
    void getDisplayQuote('SEK').then((q) => { if (!cancelled) setQuote(q); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Expiry countdown — flips `expired` and locks confirm when the QR lapses.
  useEffect(() => {
    if (parsed.expUnix == null) return;
    const id = window.setInterval(() => {
      setSecsLeft((parsed.expUnix ?? 0) - Math.floor(Date.now() / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [parsed]);

  async function confirm() {
    if (expired || submitting) return;
    // A 'warning'-level assessment takes a deliberate second tap (advisory).
    if (assessment?.level === 'warning' && !armed) { setArmed(true); return; }
    setSubmitting(true);
    setError(null);
    try {
      const ftc = Number(parsed.amountMicroFtc) / 1_000_000;
      const sent = await sendOnChain({
        to: parsed.to,
        amountMicroFtc: parsed.amountMicroFtc,
        remittanceText: parsed.ref ?? null,
        creditor: parsed.creditor
          ? { name: parsed.creditor.name, countryOfResidence: parsed.creditor.country }
          : null,
      });
      await recordTx({
        kind: 'send',
        counterparty: parsed.to,
        amountMicroFtc: parsed.amountMicroFtc.toString(),
        fiatValueAtTx: 0,
        fiatCurrency: 'SEK',
        ref: parsed.ref,
        txHash: sent.txId,
        jurisdictionAtTx: null,
        note: parsed.inv ? `Order ${parsed.inv} · ${ftc.toFixed(4)} FTC` : undefined,
        pacs008: draft ?? undefined,
        risk: assessment ?? undefined,
        paymentType,
        taxable: paymentTypeMeta(paymentType).taxable,
        feeSatoshi: sent.feeSatoshi,
      });
      onConfirmed();
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <section className="flex flex-col h-full safe-bottom">
      <Header title={t('wallet.reviewTitle', 'Review payment')} onBack={onBack} />

      <div className="flex-1 overflow-y-auto px-5 pt-2 pb-5">
        {/* Amount card — FTC, optional SEK, network fee + total */}
        <div className="p-5 rounded-2xl text-center bg-[var(--color-accent-soft)] border border-[var(--color-accent-dim)]">
          <div className="text-xs uppercase tracking-wider text-[var(--color-text-faint)]">
            {t('review.youPay', 'You pay')}
          </div>
          <div className="text-3xl font-bold tabular-nums mt-1 text-[var(--color-text)]">
            {formatFtc(parsed.amountMicroFtc)} <span className="text-xl">FTC</span>
          </div>
          {quote && (
            <div className="text-sm mt-1 text-[var(--color-text-muted)]">
              ≈ {microFtcToFiatLabel(parsed.amountMicroFtc, quote)}
            </div>
          )}
          {feeMF > 0n && (
            <div className="text-xs mt-2 pt-2 border-t border-[var(--color-accent-dim)] flex items-center justify-center gap-2 text-[var(--color-text-muted)]">
              <span>{t('review.networkFee', 'Network fee')} {formatFtc(feeMF)} FTC</span>
              <span className="text-[var(--color-text-faint)]">·</span>
              <span>{t('review.total', 'Total')} {formatFtc(parsed.amountMicroFtc + feeMF)} FTC</span>
            </div>
          )}
        </div>

        {/* Recipient */}
        <div className="mt-3 p-4 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)]">
          <div className="text-xs uppercase tracking-wider text-[var(--color-text-faint)]">{t('wallet.to')}</div>
          <div className="mt-1 font-mono text-[12px] text-[var(--color-text)] break-all">{parsed.to}</div>
          {parsed.inv && (
            <div className="mt-2 text-[11px] text-[var(--color-text-muted)] font-mono">
              {t('wallet.order', { id: parsed.inv })}
            </div>
          )}
        </div>

        {/* Payment type */}
        <div className="mt-4">
          <div className="text-xs uppercase tracking-wider mb-2 text-[var(--color-text-faint)]">
            {t('wallet.paymentTypeLabel', 'Type')}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {PAYMENT_TYPES.map((pt) => (
              <button key={pt} type="button" onClick={() => setPaymentType(pt)}
                      className="py-2.5 rounded-lg text-sm font-semibold"
                      style={paymentType === pt
                        ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-fg)' }
                        : { backgroundColor: 'var(--color-surface)', color: 'var(--color-text-muted)',
                            border: '1px solid var(--color-border)' }}>
                {t(`paymentType.${pt}`, paymentTypeMeta(pt).labelFallback)}
              </button>
            ))}
          </div>
          <div className="text-xs mt-2 text-[var(--color-text-faint)]">
            {t('wallet.paymentTypeHelp',
              'Only "Payment" counts toward tax. Gift, Information and Contract are exempt.')}
          </div>
        </div>

        {/* ISO 20022 accordion */}
        {draft && (
          <div className="mt-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] overflow-hidden">
            <button type="button" onClick={() => setIsoOpen((o) => !o)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left active:bg-[var(--color-surface-muted)]"
                    aria-expanded={isoOpen}>
              <span className="text-[13px] font-medium text-[var(--color-text)]">{t('wallet.iso.title')}</span>
              <span className="text-xs text-[var(--color-accent)]">{isoOpen ? t('common.close') : t('common.show')}</span>
            </button>
            {isoOpen && (
              <div className="px-4 pb-4 -mt-1">
                <IsoParty label={t('wallet.iso.debtor')} party={draft.debtor} />
                <IsoParty label={t('wallet.iso.creditor')} party={draft.creditor} />
                <IsoRow label={t('wallet.iso.purpose')} value={draft.purpose} mono />
                <IsoRow label={t('wallet.iso.reference')} value={draft.reference} mono />
                <p className="mt-3 text-[11px] text-[var(--color-text-faint)] leading-snug">{t('wallet.iso.note')}</p>
              </div>
            )}
          </div>
        )}

        {/* Fraud assessment */}
        {assessment && assessment.signals.length > 0 && (() => {
          const top = assessment.signals.some((s) => s.severity === 'warning') ? 'warning'
            : assessment.signals.some((s) => s.severity === 'caution') ? 'caution' : 'info';
          const tone = {
            warning: { bg: 'var(--color-red-dim)', line: 'var(--color-red)', fg: 'var(--color-red)' },
            caution: { bg: 'var(--color-gold-dim)', line: 'var(--color-gold)', fg: 'var(--color-gold)' },
            info:    { bg: 'var(--color-accent-soft)', line: 'var(--color-accent-dim)', fg: 'var(--color-text)' },
          }[top];
          return (
            <div className="mt-3 rounded-xl p-4" style={{ backgroundColor: tone.bg, border: `1px solid ${tone.line}` }}>
              <div className="text-sm font-bold mb-2" style={{ color: tone.fg }}>{t(`fraud.title.${top}`)}</div>
              <div className="flex flex-col gap-1.5">
                {assessment.signals.map((s) => (
                  <div key={s.id} className="flex gap-2 items-start">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor:
                            s.severity === 'warning' ? 'var(--color-red)'
                            : s.severity === 'caution' ? 'var(--color-gold)'
                            : 'var(--color-text-faint)' }} />
                    <span className="text-sm text-[var(--color-text)]">{t(s.messageKey, s.params)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {expired && (
          <p className="mt-3 text-sm text-[var(--color-red)]">{t('review.expired', 'Payment code expired')}</p>
        )}
        {error && <p className="mt-3 text-sm text-[var(--color-red)]">{error}</p>}
      </div>

      <div className="px-5 pb-5">
        <PrimaryButton onClick={() => void confirm()} disabled={expired || submitting}
                       style={armed ? { backgroundColor: 'var(--color-error)' } : undefined}>
          {submitting ? t('wallet.recording')
            : armed ? t('fraud.payAnyway')
            : t('review.confirm', 'Confirm & pay')}
        </PrimaryButton>
        {armed && (
          <p className="mt-2 text-center text-[11px] text-[var(--color-red)]">{t('fraud.payAnywayHint')}</p>
        )}
      </div>
    </section>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-2 px-3 pt-4 pb-3">
      <button type="button" onClick={onBack} className="p-2 rounded-lg" aria-label="Back"
              style={{ color: 'var(--color-text-muted)' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <h2 className="text-lg font-bold text-[var(--color-text)]">{title}</h2>
    </div>
  );
}

function IsoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="mt-3">
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">{label}</div>
      <div className={`mt-0.5 text-[12px] text-[var(--color-text)] break-all${mono ? ' font-mono' : ''}`}>{value}</div>
    </div>
  );
}

function IsoParty({ label, party }: {
  label: string;
  party: { name: string; address: string; country: string; city?: string; street?: string; postcode?: string };
}) {
  const addressLine = [party.street, party.postcode, party.city]
    .filter((p) => p && p.trim().length > 0).join(', ');
  return (
    <div className="mt-3">
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">{label}</div>
      <div className="mt-0.5 text-[12px] text-[var(--color-text)]">{party.name}</div>
      {addressLine && <div className="text-[11px] text-[var(--color-text-muted)]">{addressLine}</div>}
      <div className="text-[11px] text-[var(--color-text-muted)]">{party.country}</div>
      <div className="mt-0.5 font-mono text-[11px] text-[var(--color-text-faint)] break-all">{party.address}</div>
    </div>
  );
}
