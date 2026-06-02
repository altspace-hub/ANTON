/**
 * receive-uri.ts — build the payment URIs the Receive screen shows.
 *
 * Two URIs come out of a single receive:
 *
 *   • The *compact* URI — `futurechain:pay?to=<addr>[&amount=…]` — is
 *     what the static <QrCode> renders. It fits one QR comfortably and
 *     is all a sender needs to pay this wallet.
 *
 *   • The *rich* URI additionally carries the receiver's ISO 20022
 *     creditor party (cn/cc/cct/cst/cpc, drawn from the saved payment
 *     identity) and a small structured order envelope. That payload is
 *     bigger than the static QR wants to hold, which is exactly what the
 *     fountain-coded animated QR is for. `decodePaymentUri` already
 *     parses every one of these fields (payment.ts), so the sender's
 *     Pay app reconstructs a complete PACS.008 creditor party from the
 *     animated scan alone.
 *
 * The rich URI only makes sense when there is something rich to carry:
 * an amount AND a creditor name. Without both, the animated QR would be
 * a heavier, crash-prone rendering of the same address-only URI with no
 * added value — `buildRichReceiveUri` returns null and the caller hides
 * the Animated toggle.
 *
 * Pure functions, no I/O — unit-tested in __tests__/qr-transfer.test.ts.
 */
import type { PayerIdentity } from '../payment-identity';
import type { AntonRemittance } from '@futurechain/sdk/pacs008';

/** The receiver, as the ISO 20022 *creditor* party for an inbound
 *  payment. Mirrors the `cn/cc/cct/cst/cpc` params decodePaymentUri
 *  reads back. */
export interface ReceiveCreditor {
  name: string;
  country: string;
  city?: string;
  street?: string;
  postcode?: string;
}

/** Inputs the Receive screen has on hand. */
export interface ReceiveUriInput {
  /** This wallet's receive address. */
  address: string;
  /** Requested amount in micro-FTC. 0n = "sender chooses" (no amount). */
  amountMicroFtc: bigint;
  /** The saved payment identity — the receiver's own party. Null when
   *  the user hasn't filled it in yet. */
  identity: PayerIdentity | null;
  /** A label for the receive (wallet label) — folded into the order
   *  envelope message so the sender sees who/what they're paying. */
  label?: string;
}

/** The compact address-(maybe-amount) URI for the static QR. Always
 *  available — it needs only an address. */
export function buildCompactReceiveUri(address: string, amountMicroFtc: bigint): string {
  return amountMicroFtc > 0n
    ? `futurechain:pay?to=${address}&amount=${amountMicroFtc.toString()}`
    : `futurechain:pay?to=${address}`;
}

/** Does the receiver have a usable creditor party (at least a name)? */
function hasCreditorParty(identity: PayerIdentity | null): identity is PayerIdentity {
  return !!identity && identity.name.trim().length > 0;
}

/**
 * Build the rich URI for the animated QR, or null when there's nothing
 * richer than the compact URI to carry (no amount, or no creditor name).
 *
 * Carries — all fields decodePaymentUri already parses:
 *   to, amount, currency=FTC, v=1
 *   cn/cc/cct/cst/cpc  (the receiver's creditor party)
 *   order=<base64url JSON>  (a minimal AntonRemittance envelope)
 *
 * Deliberately omits `ref`: a pay-to-pay receive has no merchant
 * reference, and decodePaymentUri now treats `ref` as optional when no
 * merchant fields are present.
 */
export function buildRichReceiveUri(input: ReceiveUriInput): string | null {
  const { address, amountMicroFtc, identity, label } = input;
  // Nothing rich to carry → caller should hide the Animated toggle.
  if (amountMicroFtc <= 0n) return null;
  if (!hasCreditorParty(identity)) return null;

  const creditor: ReceiveCreditor = {
    name: identity.name.trim(),
    country: identity.country.trim() || 'SE',
    city: identity.city.trim() || undefined,
    street: identity.street.trim() || undefined,
    postcode: identity.postcode.trim() || undefined,
  };

  const params = new URLSearchParams({
    to: address,
    amount: amountMicroFtc.toString(),
    currency: 'FTC',
    v: '1',
  });
  params.set('cn', creditor.name);
  params.set('cc', creditor.country);
  if (creditor.city) params.set('cct', creditor.city);
  if (creditor.street) params.set('cst', creditor.street);
  if (creditor.postcode) params.set('cpc', creditor.postcode);

  // Minimal structured order envelope — a payment request from this
  // wallet. `kind: 'invoice'` reads naturally on the sender's Review
  // ("you're paying an invoice from <name>"); amountSek is left to the
  // sender's local FX since the QR is denominated in FTC.
  const envelope: AntonRemittance = {
    v: 1,
    kind: 'invoice',
    message: label ? `Payment request — ${label}` : `Payment request from ${creditor.name}`,
  };
  params.set('order', base64UrlSafe(JSON.stringify(envelope)));

  return `futurechain:pay?${params.toString()}`;
}

/** URL-safe base64 — `+ /` → `- _`, padding stripped. Matches
 *  src/business/services/qr.ts so the Pay app's `decodeOrderEnvelopeParam`
 *  (which restores padding + reverses the substitution) round-trips it. */
function base64UrlSafe(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = typeof btoa === 'function'
    ? btoa(bin)
    : Buffer.from(bytes).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
