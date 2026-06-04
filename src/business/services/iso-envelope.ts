/**
 * iso-envelope.ts — assemble the canonical ISO 20022 pacs.008 envelope for a
 * received sale from a Receipt's settlement facts.
 *
 * The merchant is the recipient, so it never persists a structured pacs008
 * (unlike Pay/Comm, which store the draft they signed). This builds the
 * envelope on demand from what the inbound poller captured — the merchant is
 * the Creditor (Cdtr), the customer the Debtor (Dbtr) — as a copyable
 * audit-trail artifact for the merchant's accounting.
 *
 * Pure + presentation-only; no IO. Unit-tested in __tests__/iso-envelope.test.ts.
 */
import type { Receipt, MerchantConfig } from './types';

export function formatIsoEnvelope(receipt: Receipt, merchant: MerchantConfig, customerName?: string): string {
  const party = (label: string, o: { name?: string; country?: string; street?: string; postcode?: string; city?: string; account?: string }): string => {
    const lines = [`${label}:`];
    if (o.name) lines.push(`  Name: ${o.name}`);
    if (o.country) lines.push(`  Country: ${o.country}`);
    if (o.street) lines.push(`  Street: ${o.street}`);
    if (o.postcode) lines.push(`  Postcode: ${o.postcode}`);
    if (o.city) lines.push(`  City: ${o.city}`);
    if (o.account) lines.push(`  Account: ${o.account}`);
    return lines.length > 1 ? lines.join('\n') : `${label}: —`;
  };
  const amt = (Number(receipt.amountMicroFtc) / 1_000_000).toFixed(6);
  return [
    'ISO 20022 pacs.008.001 · FIToFICstmrCdtTrf',
    `Amount: ${amt} FTC`,
    receipt.amountSek ? `Value: ${receipt.amountSek.toFixed(2)} SEK` : null,
    `Purpose: ${receipt.purpose || 'COMMERCE'}`,
    receipt.ref ? `Reference (EndToEndId): ${receipt.ref}` : null,
    receipt.uetr ? `UETR: ${receipt.uetr}` : null,
    party('Debtor (Dbtr · customer)', { name: customerName, account: receipt.customerAddress }),
    party('Creditor (Cdtr · merchant)', {
      name: merchant.legalName, country: merchant.country, street: merchant.street,
      postcode: merchant.postcode, city: merchant.city,
      account: receipt.receivingAddress || merchant.safelloReceiveAddress,
    }),
  ].filter(Boolean).join('\n');
}
