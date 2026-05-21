/**
 * pacs008-draft.ts — assemble a display-time ISO 20022 PACS.008 draft
 * snapshot for a payment the customer is about to make.
 *
 * Pure logic, no I/O. The draft shape is app-local — it pre-dates the
 * Phase 1 SDK rewrite and was useful for showing the payment's ISO
 * shape in the UI + persisting a snapshot on the local receipt. The
 * actual on-chain settlement uses the SDK's `Pacs008Builder` /
 * `buildSignedPacs008Transaction` from services/payment.ts; this draft
 * is for display + receipt only.
 */
import type { DecodedPayment, PaymentPurpose } from './types';
import type { PayerIdentity } from './payment-identity';
import type { TravelRuleTier } from './travel-rule';

/** ISO 20022 external purpose code subset we surface for retail QR scans. */
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
const PURPOSE_TO_ISO: Record<PaymentPurpose, Purpose> = {
  RETAIL: 'GDDS',      // purchase of goods
  RESTAURANT: 'SCVE',  // purchase of services
  SERVICE: 'SCVE',
  EVENT: 'OTHR',
  REFUND: 'REFUND',
};

/** The customer as the PACS.008 debtor party. Falls back to the bare
 *  wallet address for the name when no identity has been saved.
 *
 *  Travel-Rule + GDPR two-tier: in `minimal` mode (sub-€1000 P2P
 *  self-custody transfers), street/city/postcode are deliberately
 *  OMITTED even if the user has filled them — GDPR Art. 5(1)(c)
 *  data minimisation. In `full` mode (>= €1000, Travel Rule applies),
 *  the address is included if available; if any field is missing the
 *  caller should have blocked signing rather than ship a partial
 *  disclosure. */
export function payerToParty(
  identity: PayerIdentity | null,
  walletAddress: string,
  tier: TravelRuleTier = 'minimal',
): PartyIdentification {
  const base: PartyIdentification = {
    address: walletAddress,
    name: identity?.name.trim() || walletAddress,
    country: identity?.country.trim().toUpperCase() || 'SE',
  };
  if (tier === 'minimal') {
    // Sub-threshold: strip address fields per GDPR minimisation.
    return base;
  }
  return {
    ...base,
    city: identity?.city.trim() || undefined,
    street: identity?.street.trim() || undefined,
    postcode: identity?.postcode.trim() || undefined,
  };
}

/** The merchant as the PACS.008 creditor party. Falls back to the
 *  merchant id for the name when the QR carried no creditor block. */
export function creditorToParty(decoded: DecodedPayment): PartyIdentification {
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
  tier: TravelRuleTier = 'minimal',
): Pacs008Draft {
  return {
    debtor: payerToParty(identity, walletAddress, tier),
    creditor: creditorToParty(decoded),
    amountMicroFtc: decoded.amountMicroFtc,
    currency: 'FTC',
    purpose: PURPOSE_TO_ISO[decoded.purpose],
    reference: decoded.ref,
  };
}
