/**
 * activity.ts — merge outgoing PaymentRecord + inbound ReceivedRecord
 * into one unified, sorted Activity stream.
 *
 * Used by HomeScreen ("Recent") and HistoryScreen (full timeline).
 * Pure transform; no I/O — the caller wires the two lists in.
 */
import type { Activity, PaymentRecord, ReceivedRecord } from './types';

export function buildActivity(
  sent: PaymentRecord[],
  received: ReceivedRecord[],
): Activity[] {
  const a: Activity[] = [];
  for (const r of sent) a.push({ direction: 'sent', at: r.paidAt, record: r });
  for (const r of received) a.push({ direction: 'received', at: r.receivedAt, record: r });
  a.sort((x, y) => y.at - x.at);
  return a;
}
