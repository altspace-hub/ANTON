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
import PassphrasePromptModal from '../components/PassphrasePromptModal';
import PinPromptModal from '../components/PinPromptModal';
import {
  estimateSek, executePayment, formatFtc, formatSek, isExpired,
  loadBehaviorProfile, secondsUntilExpiry,
} from '../services/payment';
import { loadProfile } from '../services/profile';
import { loadPayerIdentity } from '../services/payment-identity';
import { loadMoneyProfile } from '../services/money-profile';
import { loadWallet } from '../services/wallet';
import { assembleDraft, type Pacs008Draft } from '../services/pacs008-draft';
import { assessPayment, type FraudAssessment } from '../services/fraud-engine';
import {
  findSimilarContacts, getContactByAddress,
  type Contact, type SimilarityWarning,
} from '../services/address-book';
import {
  travelRuleTierFor, fullDisclosureReady, minimalDisclosureReady,
  missingFields, type TravelRuleTier,
} from '../services/travel-rule';
import { getDisplayQuote } from '../services/fx';
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
  const [draft, setDraft] = useState<Pacs008Draft | null>(null);
  const [isoOpen, setIsoOpen] = useState(false);
  const [assessment, setAssessment] = useState<FraudAssessment | null>(null);
  const [armed, setArmed] = useState(false);
  /** Address-poisoning warning state. `knownContact` = the recipient
   *  is a known contact (good signal). `similar` = there are contacts
   *  with addresses dangerously close to this one (look-alike attack).
   *  When `similar.length > 0` the signing flow is hard-gated behind
   *  an explicit "I confirm this is not <name>" tap. */
  const [knownContact, setKnownContact] = useState<Contact | null>(null);
  const [similar, setSimilar] = useState<SimilarityWarning[]>([]);
  const [similarAck, setSimilarAck] = useState(false);
  /** Travel Rule + GDPR tier resolved at decode time. `null` until
   *  the FX quote returns. Drives whether the PACS.008 carries
   *  address fields and whether signing is blocked on profile-
   *  completeness. */
  const [travelTier, setTravelTier] = useState<TravelRuleTier | null>(null);
  /** Tracks whether the user's saved identity has the address fields
   *  required at the full-disclosure tier. */
  const [identityComplete, setIdentityComplete] = useState<boolean>(true);
  const [identityMissing, setIdentityMissing] = useState<string[]>([]);
  /** Wave 10 — free-text note the customer attaches to this payment.
   *  Bundles into PACS.008 RmtInf.Ustrd[1] alongside the structured
   *  order envelope. Soft-capped at 500 chars for the textarea but the
   *  underlying RmtInf can carry much more. */
  const [customerNote, setCustomerNote] = useState('');
  /** Whether the customer's wallet is ready — gates the note textarea
   *  (no note when paying through a non-FTC fallback). */
  const [walletConnected, setWalletConnected] = useState(false);
  /** Passphrase prompt state. Open when executePayment needs the
   *  second factor; the modal resolves the in-flight promise via
   *  `passphraseResolver`. */
  const [passphraseOpen, setPassphraseOpen] = useState(false);
  const [passphraseResolver, setPassphraseResolver] =
    useState<((p: string | null) => void) | null>(null);
  const [passphraseFailures, setPassphraseFailures] = useState(0);

  /** In-app payment-PIN prompt state. Opened by executePayment's biometric→
   *  PIN fallback when the device has no usable biometric. */
  const [pinOpen, setPinOpen] = useState(false);
  const [pinMode, setPinMode] = useState<'create' | 'enter'>('enter');
  const [pinResolver, setPinResolver] = useState<((p: string | null) => void) | null>(null);
  const [pinFailures, setPinFailures] = useState(0);

  useEffect(() => {
    void (async () => {
      const [profile, identity, wallet, money, behavior] = await Promise.all([
        loadProfile(), loadPayerIdentity(), loadWallet(),
        loadMoneyProfile(), loadBehaviorProfile(),
      ]);
      if (profile) setFtcPerSek(profile.ftcPerSek);
      // Travel Rule + GDPR tier — resolved from the amount + EUR rate.
      const eurQuote = await getDisplayQuote('EUR');
      const tier = travelRuleTierFor(payment.amountMicroFtc, eurQuote);
      setTravelTier(tier);
      const idStatus = {
        hasName: !!identity?.name.trim(),
        hasCountry: !!identity?.country.trim(),
        hasStreet: !!identity?.street.trim(),
        hasCity: !!identity?.city.trim(),
        hasPostcode: !!identity?.postcode.trim(),
      };
      // For minimal tier we only need name + country; for full tier
      // (Travel Rule applies) we need every field.
      const ready = tier === 'full' || tier === 'no-rate-conservative'
        ? fullDisclosureReady(idStatus)
        : minimalDisclosureReady(idStatus);
      setIdentityComplete(ready);
      setIdentityMissing(missingFields(idStatus));
      setWalletConnected(!!wallet);
      if (wallet) setDraft(assembleDraft(identity, wallet.address, payment, tier));
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
      // Address-poisoning check — exact match vs near-match against
      // the explicit contact list. The result drives the UI banner +
      // the signing gate.
      const [known, sim] = await Promise.all([
        getContactByAddress(payment.toAddress),
        findSimilarContacts(payment.toAddress),
      ]);
      setKnownContact(known);
      setSimilar(sim);
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
    // Address-poisoning hard gate. Look-alike contacts MUST be
    // explicitly acknowledged before signing — this is the Wintermute
    // (May 2024, USD 24M) defence. Refuses to proceed otherwise.
    if (similar.length > 0 && !similarAck) {
      return; // UI shows the "I confirm this is not <name>" gate.
    }
    // Travel Rule gate (EU 2023/1113). Above the €1000 threshold the
    // PACS.008 must carry full Dbtr address — block sign if not all
    // fields are present.
    if (!identityComplete) {
      return; // UI shows the "complete your profile" banner.
    }
    // A 'warning'-level assessment takes a deliberate second tap — the
    // engine is advisory, never a hard block.
    if (assessment?.level === 'warning' && !armed) {
      setArmed(true);
      return;
    }
    setBusy(true);
    setPassphraseFailures(0);
    try {
      const record = await executePayment(
        payment, assessment ?? undefined, customerNote, {
          promptForPassphrase: openPassphraseModal,
          promptForPin: openPinModal,
        },
      );
      onConfirmed(record);
    } catch {
      setBusy(false);
    }
  }

  /** Opens the passphrase modal and resolves with the entered string
   *  (or null on cancel). On wrong-passphrase, executePayment calls
   *  this again with a bumped `failedAttempts` — we propagate that
   *  into the modal via setPassphraseFailures, which the modal uses
   *  to drive its error message + 5-attempt back-off. */
  async function openPassphraseModal(failedAttempts: number): Promise<string | null> {
    setPassphraseFailures(failedAttempts);
    return new Promise<string | null>((resolve) => {
      setPassphraseResolver(() => (val: string | null) => {
        setPassphraseOpen(false);
        setPassphraseResolver(null);
        resolve(val);
      });
      setPassphraseOpen(true);
    });
  }

  /** Opens the in-app payment-PIN modal (create on first use, else enter) and
   *  resolves with the entered PIN, or null on cancel. On a wrong PIN,
   *  executePayment calls this again with a bumped failedAttempts, which the
   *  modal uses to drive its error message + back-off. */
  async function openPinModal(mode: 'create' | 'enter', failedAttempts: number): Promise<string | null> {
    setPinMode(mode);
    setPinFailures(failedAttempts);
    return new Promise<string | null>((resolve) => {
      setPinResolver(() => (val: string | null) => {
        setPinOpen(false);
        setPinResolver(null);
        resolve(val);
      });
      setPinOpen(true);
    });
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

        {/* Wave 10 — itemized order details from the merchant's QR.
            Shown when the merchant flipped "Include order details". */}
        {payment.orderEnvelope?.items && payment.orderEnvelope.items.length > 0 && (
          <div className="rounded-xl mb-4 overflow-hidden"
               style={{ backgroundColor: 'var(--color-surface)',
                        border: '1px solid var(--color-border)' }}>
            <div className="px-4 py-2 text-xs uppercase tracking-wider"
                 style={{ color: 'var(--color-text-faint)',
                          borderBottom: '1px solid var(--color-border-soft)' }}>
              {t('review.orderDetails', 'Order details')}
            </div>
            {payment.orderEnvelope.items.map((it, i) => (
              <div key={i}
                   className="flex items-start justify-between px-4 py-2.5"
                   style={{ borderTop: i === 0 ? undefined : '1px solid var(--color-border-soft)' }}>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold"
                       style={{ color: 'var(--color-text)' }}>
                    {it.qty}× {it.name}
                  </div>
                  {it.unitPriceSek !== undefined && (
                    <div className="text-xs mt-0.5"
                         style={{ color: 'var(--color-text-muted)' }}>
                      {it.unitPriceSek.toFixed(2)} SEK · VAT {it.vatRate}%
                    </div>
                  )}
                </div>
                {it.lineTotalSek !== undefined && (
                  <div className="text-sm mono font-semibold ml-3 text-right"
                       style={{ color: 'var(--color-text)' }}>
                    {it.lineTotalSek.toFixed(2)} SEK
                  </div>
                )}
              </div>
            ))}
            {(payment.orderEnvelope.amountSek !== undefined
              || payment.orderEnvelope.vatSek !== undefined) && (
              <div className="px-4 py-2 text-xs flex justify-between"
                   style={{ borderTop: '1px solid var(--color-border-soft)',
                            color: 'var(--color-text-muted)' }}>
                <span>
                  {payment.orderEnvelope.vatSek !== undefined && payment.orderEnvelope.vatSek > 0
                    ? t('review.orderVat', 'VAT {{vat}} SEK',
                        { vat: payment.orderEnvelope.vatSek.toFixed(2) })
                    : ''}
                </span>
                {payment.orderEnvelope.amountSek !== undefined && (
                  <span className="font-semibold"
                        style={{ color: 'var(--color-text)' }}>
                    {payment.orderEnvelope.amountSek.toFixed(2)} SEK
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Wave 10 — customer's optional free-text note. Gets bundled
            into the PACS.008 RmtInf alongside the order details when
            the customer signs (Ustrd[1] line). */}
        {walletConnected && (
          <div className="mb-4">
            <label className="text-xs uppercase tracking-wider block mb-1"
                   style={{ color: 'var(--color-text-faint)' }}>
              {t('review.noteLabel', 'Add a note (optional)')}
            </label>
            <textarea value={customerNote}
                      onChange={(e) => setCustomerNote(e.target.value)}
                      placeholder={t('review.notePlaceholder',
                        'For internal use — what this payment is for, any agreement.')}
                      rows={3}
                      maxLength={500}
                      className="w-full px-3 py-2 rounded-lg text-sm"
                      style={{ backgroundColor: 'var(--color-surface)',
                               border: '1px solid var(--color-border)',
                               color: 'var(--color-text)',
                               resize: 'vertical' }} />
            {customerNote.length > 0 && (
              <div className="text-xs mt-1 text-right"
                   style={{ color: 'var(--color-text-faint)' }}>
                {customerNote.length}/500
              </div>
            )}
          </div>
        )}

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

        {/* Address-poisoning hard gate. Surfaced ABOVE the Pay button
            because acknowledging it is required before sign. Stripe-
            Terminal-style explicit Confirm pattern. */}
        {knownContact && (
          <div className="rounded-xl p-3 mb-3"
               style={{ backgroundColor: 'var(--color-accent-soft, rgba(45,212,168,0.12))',
                        border: '1px solid var(--color-accent-dim, rgba(45,212,168,0.32))' }}>
            <div className="text-xs font-semibold mb-0.5"
                 style={{ color: 'var(--color-accent)' }}>
              {t('review.knownContact', 'Recognized contact')}
            </div>
            <div className="text-sm" style={{ color: 'var(--color-text)' }}>
              {t('review.payingTo', { name: knownContact.label, defaultValue: 'Paying to {{name}}' })}
            </div>
          </div>
        )}

        {similar.length > 0 && (
          <div className="rounded-xl p-3 mb-3"
               style={{ backgroundColor: 'rgba(192,57,43,0.08)',
                        border: '1px solid #C0392B' }}>
            <div className="text-xs font-semibold mb-1"
                 style={{ color: '#C0392B' }}>
              {t('review.lookAlike', 'Look-alike address detected')}
            </div>
            <div className="text-sm mb-2" style={{ color: 'var(--color-text)' }}>
              {t('review.lookAlikeBody', {
                name: similar[0].contact.label,
                defaultValue: 'This address looks similar to your contact "{{name}}" but is NOT the same. Attackers grind addresses with matching head/tail to trick recipients. Verify the full address before paying.',
              })}
            </div>
            <label className="flex items-start gap-2 text-xs cursor-pointer"
                   style={{ color: 'var(--color-text)' }}>
              <input type="checkbox" checked={similarAck}
                     onChange={(e) => setSimilarAck(e.target.checked)}
                     className="mt-0.5" />
              <span>
                {t('review.lookAlikeAck', {
                  name: similar[0].contact.label,
                  defaultValue: 'I confirm this address is NOT "{{name}}" and I want to pay this new address.',
                })}
              </span>
            </label>
          </div>
        )}

        {/* Travel Rule + GDPR tier banner. Shown above the Pay
            button when the tier is `full` or `no-rate-conservative`
            AND the user's profile is missing fields. EU 2023/1113. */}
        {!identityComplete && (
          <div className="rounded-xl p-3 mb-3"
               style={{ backgroundColor: 'rgba(200,136,30,0.08)',
                        border: '1px solid #C8881E' }}>
            <div className="text-xs font-semibold mb-1"
                 style={{ color: '#C8881E' }}>
              {t('travelRule.title', 'Profile required for this amount')}
            </div>
            <div className="text-sm" style={{ color: 'var(--color-text)' }}>
              {travelTier === 'no-rate-conservative'
                ? t('travelRule.noRateBody',
                    'No live FTC/EUR rate available. Conservative posture: payments are treated as above the EU Travel Rule €1000 threshold until the rate source is back online.')
                : t('travelRule.fullBody',
                    'This payment exceeds the EU Travel Rule threshold (€1000). EU 2023/1113 requires the originator address fields to be included.')}
            </div>
            <div className="text-xs mt-2"
                 style={{ color: 'var(--color-text-muted)' }}>
              {t('travelRule.missing', { fields: identityMissing.join(', '), defaultValue: 'Missing: {{fields}}. Open Settings → Payment details to complete.' })}
            </div>
          </div>
        )}

        <PrimaryButton onClick={confirm}
                       disabled={expired || busy
                         || (similar.length > 0 && !similarAck)
                         || !identityComplete}
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
      {passphraseOpen && passphraseResolver ? (
        <PassphrasePromptModal
          reason={t('passphrase.reasonSend',
            'Confirm to sign this payment')}
          attemptFailures={passphraseFailures}
          onSubmit={(p) => passphraseResolver(p)}
          onCancel={() => passphraseResolver(null)}
        />
      ) : null}
      {pinOpen && pinResolver ? (
        <PinPromptModal
          mode={pinMode}
          attemptFailures={pinFailures}
          onSubmit={(p) => pinResolver(p)}
          onCancel={() => pinResolver(null)}
        />
      ) : null}
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
