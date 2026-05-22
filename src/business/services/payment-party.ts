/**
 * payment-party.ts — map the local merchant config onto ISO 20022
 * party identification.
 *
 * On every sale the merchant is the PACS.008 *creditor*. Two shapes:
 *   • `merchantToCreditorParty` — the compact block the sale QR carries
 *     (services/qr.ts `CreditorParty`), so the payer can assemble a
 *     complete PACS.008 from the scan alone.
 *   • `merchantToParty` — the full `pacs008.PartyIdentification` used
 *     when this app itself drafts a PACS.008 (e.g. a refund).
 */
import type { MerchantConfig } from './types';
import type { CreditorParty } from './qr';

/**
 * App-local ISO 20022 party identification — not an SDK type. Mirrors the
 * fields the business app needs to draft a PACS.008 (e.g. a refund).
 */
export interface PartyIdentification {
  /** Wallet address — `fc_...`. */
  address: string;
  name: string;
  /** ISO 3166-1 alpha-2 country code. */
  country: string;
  city: string;
  street: string;
  postcode: string;
  orgNr: string;
}

/** The merchant as a full ISO 20022 party (PACS.008 creditor). */
export function merchantToParty(c: MerchantConfig): PartyIdentification {
  return {
    address: c.safelloReceiveAddress,
    name: c.legalName,
    country: c.country,
    city: c.city,
    street: c.street,
    postcode: c.postcode,
    orgNr: c.orgNr,
  };
}

/** The compact creditor block embedded in the sale QR. */
export function merchantToCreditorParty(c: MerchantConfig): CreditorParty {
  return {
    name: c.legalName,
    country: c.country,
    city: c.city,
    street: c.street,
    postcode: c.postcode,
  };
}
