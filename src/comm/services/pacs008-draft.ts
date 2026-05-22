/**
 * pacs008-draft.ts — assemble an ISO 20022 PACS.008 draft for a
 * payment the Comm user is about to make.
 *
 * Pure logic, no I/O. The draft is built from three sources:
 *   • the user's saved payer identity → debtor party
 *   • the scanned QR's creditor       → creditor party
 *   • the scanned QR's amount/ref     → instruction fields
 *
 * Unlike the Pay app, Comm's `parsePayUri` does not decode the
 * ADR-004 reference, so this module decodes it here with
 * `reference.decode` to recover the merchant id + v1 purpose
 * (mirroring `src/pay/services/payment.ts`).
 *
 * The SDK's `Pacs008Builder.build()` / `canonicalize()` / `hash()`
 * are now implemented (Phase 1, May 20 2026 — see
 * `@futurechain/sdk/pacs008` index.ts:248-336). This module still
 * assembles the `Pacs008Draft` object literal directly because the
 * draft shape is a UI-facing display object, not a signable message —
 * the Wallet send screen consumes the draft for display + local
 * receipt only. When the Comm app wires a Bahnhof submission path
 * (mirroring `src/pay/services/payment.ts::executePayment`), it will
 * call `pacs008.buildPacs008` + `pacs008.buildSignedPacs008Transaction`
 * directly, not this module.
 */
import { reference } from '@futurechain/sdk';
import type { PayerIdentity } from './payment-identity';

/** ADR-004 v1 purpose codes (`reference.V1Purpose`). */
type V1Purpose = 'RETAIL' | 'RESTAURANT' | 'EVENT' | 'SERVICE' | 'REFUND';

/** ISO 20022 external purpose code subset we surface for retail QR scans.
 *  App-local — not an SDK type (the SDK's `Pacs008Builder` owns the
 *  on-chain message shape; this draft is display + local-receipt only). */
export type Purpose = 'GDDS' | 'SCVE' | 'OTHR' | 'REFUND';

/** Display-time party identification. App-local — not the on-chain
 *  `Pacs008Party` shape (which only carries name + country + accountId). */
export interface PartyIdentification {
  address: string;
  name: string;
  country: string;
  city?: string;
  street?: string;
  postcode?: string;
}

/** Display-time PACS.008 draft snapshot for the local receipt. */
export interface Pacs008Draft {
  debtor: PartyIdentification;
  creditor: PartyIdentification;
  amountMicroFtc: bigint;
  currency: string;
  purpose: Purpose;
  reference: string;
}

/** ADR-004 v1 purpose → ISO 20022 external purpose code. */
const PURPOSE_TO_ISO: Record<V1Purpose, Purpose> = {
  RETAIL: 'GDDS',      // purchase of goods
  RESTAURANT: 'SCVE',  // purchase of services
  SERVICE: 'SCVE',
  EVENT: 'OTHR',
  REFUND: 'REFUND',
};

/**
 * The optional ISO 20022 creditor party decoded from the QR's
 * `cn/cc/cct/cst/cpc` params. Null when the QR predates the
 * creditor-party extension.
 */
export interface CreditorParty {
  name: string;
  /** ISO 3166-1 alpha-2 country code. */
  country: string;
  city?: string;
  street?: string;
  postcode?: string;
}

/** The minimal pay-URI shape this module needs to assemble a draft. */
export interface PayUriForDraft {
  /** Recipient FTC address (QR `to`). */
  to: string;
  /** Amount in micro-FTC (QR `amount`). */
  amountMicroFtc: bigint;
  /** Raw ADR-004 reference string (QR `ref`), or null. */
  ref: string | null;
  /** Optional decoded creditor party (QR `cn/cc/cct/cst/cpc`). */
  creditor: CreditorParty | null;
}

/** The Comm user as the PACS.008 debtor party. Falls back to the
 *  bare wallet address for the name when no identity has been saved. */
export function payerToParty(
  identity: PayerIdentity | null,
  walletAddress: string,
): PartyIdentification {
  return {
    address: walletAddress,
    name: identity?.name.trim() || walletAddress,
    country: identity?.country.trim().toUpperCase() || 'SE',
    city: identity?.city.trim() || undefined,
    street: identity?.street.trim() || undefined,
    postcode: identity?.postcode.trim() || undefined,
  };
}

/** The recipient as the PACS.008 creditor party. Falls back to the
 *  recipient address for the name when the QR carried no creditor
 *  block. */
export function creditorToParty(
  uri: PayUriForDraft,
  fallbackName: string,
): PartyIdentification {
  return {
    address: uri.to,
    name: uri.creditor?.name.trim() || fallbackName,
    country: uri.creditor?.country.trim().toUpperCase() || 'SE',
    city: uri.creditor?.city,
    street: uri.creditor?.street,
    postcode: uri.creditor?.postcode,
  };
}

/**
 * Assemble the full PACS.008 draft for a pending payment. Returns
 * null when the QR carried no ADR-004 v1 reference — without a v1
 * reference there is no merchant id / purpose to build a draft from.
 */
export function assembleDraft(
  identity: PayerIdentity | null,
  walletAddress: string,
  uri: PayUriForDraft,
): Pacs008Draft | null {
  if (!uri.ref) return null;

  // The ADR-004 reference must be a v1 (merchant-bearing) remittance.
  const decoded = reference.decode(uri.ref);
  if (decoded.kind !== 'v1') return null;
  const f = decoded.fields;

  return {
    debtor: payerToParty(identity, walletAddress),
    creditor: creditorToParty(uri, f.merchantId),
    amountMicroFtc: uri.amountMicroFtc,
    currency: 'FTC',
    purpose: PURPOSE_TO_ISO[f.purpose],
    reference: uri.ref,
  };
}
