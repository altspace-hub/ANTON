/**
 * pacs008-draft.ts — assemble an ISO 20022 PACS.008 draft for a
 * payment the customer is about to make.
 *
 * Pure logic, no I/O. The draft is built from three sources:
 *   • the payer's saved identity  → debtor party
 *   • the scanned QR's creditor   → creditor party
 *   • the scanned QR's amount/ref → instruction fields
 *
 * The SDK's `Pacs008Builder.build()` / `canonicalize()` / `hash()` are
 * still stubbed (blocked on the Rust `iso20022_pacs008.rs` vendor), so
 * this module assembles the `Pacs008Draft` object directly — enough to
 * display the payment's ISO 20022 shape and snapshot it on the record.
 * Signing lands when the SDK module is unstubbed.
 */
import type { pacs008 } from '@futurechain/sdk';
import type { DecodedPayment, PaymentPurpose } from './types';
import type { PayerIdentity } from './payment-identity';

/** ADR-004 v1 purpose → ISO 20022 external purpose code. */
const PURPOSE_TO_ISO: Record<PaymentPurpose, pacs008.Purpose> = {
  RETAIL: 'GDDS',      // purchase of goods
  RESTAURANT: 'SCVE',  // purchase of services
  SERVICE: 'SCVE',
  EVENT: 'OTHR',
  REFUND: 'REFUND',
};

/** The customer as the PACS.008 debtor party. Falls back to the bare
 *  wallet address for the name when no identity has been saved. */
export function payerToParty(
  identity: PayerIdentity | null,
  walletAddress: string,
): pacs008.PartyIdentification {
  return {
    address: walletAddress,
    name: identity?.name.trim() || walletAddress,
    country: identity?.country.trim().toUpperCase() || 'SE',
    city: identity?.city.trim() || undefined,
    street: identity?.street.trim() || undefined,
    postcode: identity?.postcode.trim() || undefined,
  };
}

/** The merchant as the PACS.008 creditor party. Falls back to the
 *  merchant id for the name when the QR carried no creditor block. */
export function creditorToParty(decoded: DecodedPayment): pacs008.PartyIdentification {
  return {
    address: decoded.toAddress,
    name: decoded.creditor?.name.trim() || decoded.merchantId,
    country: decoded.creditor?.country.trim().toUpperCase() || 'SE',
    city: decoded.creditor?.city,
    street: decoded.creditor?.street,
    postcode: decoded.creditor?.postcode,
  };
}

/** Assemble the full PACS.008 draft for a pending payment. */
export function assembleDraft(
  identity: PayerIdentity | null,
  walletAddress: string,
  decoded: DecodedPayment,
): pacs008.Pacs008Draft {
  return {
    debtor: payerToParty(identity, walletAddress),
    creditor: creditorToParty(decoded),
    amountMicroFtc: decoded.amountMicroFtc,
    currency: 'FTC',
    purpose: PURPOSE_TO_ISO[decoded.purpose],
    reference: decoded.ref,
  };
}
