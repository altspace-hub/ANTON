/**
 * schedule-to-payment.ts — synthesize a DecodedPayment from a
 * Schedule so the existing ReviewScreen can sign a scheduled
 * occurrence with no new UI surface.
 *
 * The schedule was created by the user with full intent; we treat
 * its address + amount + ref as the "scanned" payment. The same
 * biometric gate, address-poisoning check, Travel Rule tier
 * resolution, and signing pipeline that handles a fresh QR scan
 * runs over this synthetic payment too — so there's no second-
 * class signing path for scheduled fires.
 */
import type { Schedule } from './schedules';
import type { DecodedPayment } from './types';

/** Stable orderId derived from the schedule id + the fire timestamp,
 *  so the same schedule firing twice produces two distinct receipts.
 *  Slice to 12 chars to match the v1 reference encoding's order-id
 *  width — Business and Pay both expect 12-char `O:` tokens. */
function orderIdFor(schedule: Schedule, fireTs: number): string {
  const seed = `${schedule.id}-${fireTs}`;
  // Hash via sha-256 prefix; we want a deterministic readable id.
  let h = 0n;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31n + BigInt(seed.charCodeAt(i))) & 0xffffffffffffn;
  }
  return h.toString(16).padStart(12, '0').slice(0, 12).toUpperCase();
}

/** A schedule-style merchantId. 8 chars per the v1 reference
 *  convention; we prefix "SCHED" + first 3 hex of the id. */
function merchantIdFor(schedule: Schedule): string {
  const tail = schedule.id.slice(0, 3).toUpperCase();
  return `SCHED${tail}`;
}

/**
 * Build the synthetic DecodedPayment the ReviewScreen consumes. The
 * ref carries an optional user-supplied ADR-004-style string so the
 * receiver can match the occurrence to its recurring obligation.
 */
export function scheduleToDecodedPayment(
  schedule: Schedule,
  fireTs = Date.now(),
): DecodedPayment {
  const orderId = orderIdFor(schedule, fireTs);
  const merchantId = merchantIdFor(schedule);
  const ref = schedule.ref ?? `S:${schedule.id.slice(0, 8)} O:${orderId}`;

  // Reconstruct a futurechain:pay URI shape so the payment record
  // persisted by executePayment looks like every other tx.
  const qrUri =
    `futurechain:pay?to=${schedule.payeeAddress}` +
    `&amount=${schedule.amountMicroFtc.toString()}` +
    `&ref=${encodeURIComponent(ref)}`;

  return {
    toAddress: schedule.payeeAddress,
    amountMicroFtc: schedule.amountMicroFtc,
    currency: 'FTC',
    ref,
    merchantId,
    orderId,
    purpose: 'SERVICE',
    itemCount: null,
    vatMicroFtc: null,
    discountMicroFtc: null,
    // No expiry — the user is the originator, not a merchant
    // counting down a QR window.
    expUnixSeconds: 0,
    // Schedule has a payee label; use it as the creditor name. The
    // ReviewScreen's "Recognized contact" check (Wave 2) still runs
    // independently on toAddress, so a payee in the contact book
    // gets the green banner.
    creditor: schedule.payeeLabel
      ? { name: schedule.payeeLabel, country: 'SE' }
      : null,
    // Schedules carry no merchant order envelope — the user is the
    // originator, so there are no line items to re-bundle.
    orderEnvelope: null,
    qrUri,
  };
}
