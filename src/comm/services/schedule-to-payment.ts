/**
 * schedule-to-payment.ts — turn a Schedule into a `futurechain:pay`
 * URI so the existing Comm send/review flow (parsePayUri → review →
 * sign) handles a scheduled occurrence with no new signing path.
 *
 * The schedule was created by the user with full intent; we treat its
 * address + amount + ref as the "scanned" payment. The same biometric
 * gate, address-poisoning check, Travel-Rule tier resolution, and
 * signing pipeline that handles a fresh QR scan runs over this
 * synthetic URI too — there's no second-class signing path.
 *
 * The URI carries an extra `sched=<id>` param so WalletReviewScreen
 * can call recordFire(id) on a successful send and roll the schedule
 * forward to its next window. parsePayUri ignores unknown params for
 * non-schedule URIs, so this is additive + backward-compatible.
 *
 * (Pay's sibling builds a DecodedPayment for its ReviewScreen; Comm's
 * review consumes a ParsedPayUri, so we emit a URI string instead.)
 */
import type { Schedule } from './schedules';

/** Stable orderId derived from the schedule id + the fire timestamp,
 *  so the same schedule firing twice produces two distinct receipts. */
function orderIdFor(schedule: Schedule, fireTs: number): string {
  const seed = `${schedule.id}-${fireTs}`;
  let h = 0n;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31n + BigInt(seed.charCodeAt(i))) & 0xffffffffffffn;
  }
  return h.toString(16).padStart(12, '0').slice(0, 12).toUpperCase();
}

/**
 * Build the synthetic `futurechain:pay` URI the send flow consumes.
 * The ref carries an optional user-supplied ADR-004-style string so
 * the receiver can match the occurrence to its recurring obligation.
 */
export function scheduleToPayUri(schedule: Schedule, fireTs = Date.now()): string {
  const orderId = orderIdFor(schedule, fireTs);
  const ref = schedule.ref ?? `S:${schedule.id.slice(0, 8)} O:${orderId}`;
  const params = new URLSearchParams();
  params.set('to', schedule.payeeAddress);
  params.set('amount', schedule.amountMicroFtc.toString());
  params.set('ref', ref);
  params.set('sched', schedule.id);
  if (schedule.payeeLabel) params.set('cn', schedule.payeeLabel);
  return `futurechain:pay?${params.toString()}`;
}
