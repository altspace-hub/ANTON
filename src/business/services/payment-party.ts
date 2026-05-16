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
import type { pacs008 } from '@futurechain/sdk';
import type { MerchantConfig } from './types';
import type { CreditorParty } from './qr';

/** The merchant as a full ISO 20022 party (PACS.008 creditor). */
export function merchantToParty(c: MerchantConfig): pacs008.PartyIdentification {
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
