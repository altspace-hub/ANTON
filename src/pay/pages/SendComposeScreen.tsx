/**
 * SendComposeScreen — compose a payment to a chosen recipient (#89).
 *
 * Reached from the Send recipient picker (a known person) or its "Pay a new
 * address" action (recipient = null → a blank form). When a recipient is
 * chosen we show them in a locked header card and pre-fill ManualPayForm
 * with their address + name + country, so the user only enters the amount.
 *
 * The assembled `futurechain:pay` URI is fed through the SAME
 * decodePaymentUri → ReviewScreen → sign pipeline a scanned QR uses — this
 * screen adds no new signing path, it only seeds the inputs.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ManualPayForm from '../components/ManualPayForm';
import { decodePaymentUri } from '../services/payment';
import { renderAddressSegments } from '../services/address-book';
import type { Recipient } from '../services/recipients';
import type { DecodedPayment } from '../services/types';

interface Props {
  /** The chosen recipient, or null to pay a brand-new address (blank form). */
  recipient: Recipient | null;
  onBack: () => void;
  onDecoded: (payment: DecodedPayment) => void;
}

export default function SendComposeScreen({ recipient, onBack, onDecoded }: Props) {
  const { t } = useTranslation();
  const [notice, setNotice] = useState<string | null>(null);

  function handle(uri: string) {
    const result = decodePaymentUri(uri);
    if (result.ok) {
      onDecoded(result.payment);
      return;
    }
    // Send-context wording — this URI was assembled in-app, there's no QR.
    setNotice(result.reason === 'expired'
      ? t('send.invalidUriExpired', 'This payment is no longer valid. Re-enter the amount and try again.')
      : t('send.invalidUri', "Couldn't prepare this payment. Check the amount and try again."));
  }

  const segments = recipient ? renderAddressSegments(recipient.address) : [];

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
          <h2 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>
            {recipient ? t('send.composeTitle', 'Send') : t('send.newAddressTitle', 'Pay a new address')}
          </h2>
        </div>

        {/* Locked recipient card — who you're paying. The address is shown
            here (read-only, segmented) instead of as an editable field. */}
        {recipient && (
          <div className="rounded-2xl p-4 mb-5"
               style={{ backgroundColor: 'var(--color-accent-soft)',
                        border: '1px solid var(--color-accent-dim)' }}>
            <div className="text-[11px] uppercase tracking-wider mb-1"
                 style={{ color: 'var(--color-text-faint)' }}>
              {t('send.payingLabel', 'Paying')}
            </div>
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-9 h-9 rounded-full shrink-0 text-sm font-bold"
                    style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-fg)' }}>
                {initialLetter(recipient.name)}
              </span>
              <div className="min-w-0">
                <div className="font-bold truncate" style={{ color: 'var(--color-text)' }}>
                  {recipient.name}
                </div>
                {recipient.starred && (
                  <span className="text-xs" style={{ color: 'var(--color-accent)' }}>★</span>
                )}
              </div>
            </div>
            <div className="mono text-xs mt-2 break-all">
              {segments.map((seg, i) => (
                <span key={i}
                      style={{ color: seg.secure ? 'var(--color-text-body)' : 'var(--color-text-faint)' }}>
                  {seg.text}{i < segments.length - 1 ? ' ' : ''}
                </span>
              ))}
            </div>
          </div>
        )}

        <ManualPayForm
          onSubmit={handle}
          lockRecipient={!!recipient}
          initial={recipient ? {
            address: recipient.address,
            // Only seed a REAL name — never the abbreviated-address fallback,
            // which would otherwise ship as the PACS.008 creditor name. When
            // unreal, leave it blank so ManualPayForm forces a real entry.
            name: recipient.nameIsReal ? recipient.name : undefined,
            country: recipient.country,
            city: recipient.city,
            street: recipient.street,
            postcode: recipient.postcode,
          } : undefined}
        />

        {notice && (
          <div className="mt-3 rounded-lg p-3 text-sm"
               style={{ backgroundColor: 'var(--color-warning-bg)', color: 'var(--color-warning)' }}>
            {notice}
          </div>
        )}
      </div>
    </div>
  );
}

function initialLetter(name: string): string {
  const ch = name.trim()[0];
  return ch ? ch.toUpperCase() : '?';
}
