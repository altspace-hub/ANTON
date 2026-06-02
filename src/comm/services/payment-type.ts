/**
 * payment-type.ts — the sender's classification of an outgoing wallet payment.
 *
 * Only 'payment' (goods & services) counts toward tax; gift / information /
 * contract are exempt. Stored sender-local on the WalletTx (never on the wire),
 * drives the ISO 20022 purpose code, and lets the wallet history be filtered by
 * type.
 *
 * Pure + no I/O so it's trivially unit-testable. Duplicated verbatim from
 * src/pay/services/payment-type.ts (matching the per-app copy pattern).
 */
export type PaymentType = 'payment' | 'gift' | 'information' | 'contract';

export const PAYMENT_TYPES = ['payment', 'gift', 'information', 'contract'] as const;

export const DEFAULT_PAYMENT_TYPE: PaymentType = 'payment';

export interface PaymentTypeMeta {
  /** ISO 20022 `Purp.Cd` to force, or null to keep the merchant-derived code. */
  isoOverride: string | null;
  /** Only goods-&-services 'payment' is a taxable disposal. */
  taxable: boolean;
  /** Badge colour family. */
  toneKey: 'success' | 'accent' | 'muted';
  labelKey: string;
  labelFallback: string;
}

export function paymentTypeMeta(t: PaymentType): PaymentTypeMeta {
  switch (t) {
    case 'gift':
      return { isoOverride: 'GIFT', taxable: false, toneKey: 'accent',
               labelKey: 'paymentType.gift', labelFallback: 'Gift' };
    case 'information':
      return { isoOverride: 'OTHR', taxable: false, toneKey: 'muted',
               labelKey: 'paymentType.information', labelFallback: 'Information' };
    case 'contract':
      return { isoOverride: 'OTHR', taxable: false, toneKey: 'muted',
               labelKey: 'paymentType.contract', labelFallback: 'Contract' };
    case 'payment':
    default:
      return { isoOverride: null, taxable: true, toneKey: 'success',
               labelKey: 'paymentType.payment', labelFallback: 'Payment' };
  }
}

/** The ISO purpose code to emit: 'payment' keeps the merchant-derived code;
 *  the others override (GIFT / OTHR). */
export function resolveIsoPurpose(t: PaymentType, merchantIso: string): string {
  return paymentTypeMeta(t).isoOverride ?? merchantIso;
}
