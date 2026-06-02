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

/** One calendar-day bucket of activity, newest item first. */
export interface ActivityDayGroup {
  /** Stable `YYYY-MM-DD` key for the local calendar day (React key). */
  dayKey: string;
  /** Human-readable header — "Today" / "Yesterday" / an explicit date. */
  label: string;
  /** The day's activity rows, newest first. */
  items: Activity[];
}

/** How the grouping helper turns a day into its sticky-header label.
 *  The caller supplies i18n + the explicit-date formatter so the pure
 *  helper stays free of react-i18next / locale concerns. */
export interface GroupLabeler {
  today: string;
  yesterday: string;
  /** Explicit date for any older day, formatted from the day's first
   *  (representative) timestamp. */
  formatDate: (ms: number) => string;
}

/** Local-calendar-day key — `YYYY-MM-DD` from the device timezone, so a
 *  payment at 23:00 and one at 01:00 the next morning land in different
 *  buckets the way the user experienced them. */
function dayKeyOf(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Bucket a flat, already-built Activity[] into ordered per-day groups.
 *
 * Pure + deterministic: `now` is injected (no `Date.now()` inside) so
 * the "Today" / "Yesterday" boundaries are testable. Newest day first;
 * within each day, newest item first. Does not assume the input is
 * sorted — it sorts defensively, mirroring buildActivity().
 */
export function groupActivityByDay(
  activities: Activity[],
  labeler: GroupLabeler,
  now: number,
): ActivityDayGroup[] {
  const todayKey = dayKeyOf(now);
  // One full day earlier, computed from a local-midnight anchor so DST
  // shifts don't bleed "yesterday" into the wrong bucket.
  const yesterdayAnchor = new Date(now);
  yesterdayAnchor.setHours(0, 0, 0, 0);
  yesterdayAnchor.setDate(yesterdayAnchor.getDate() - 1);
  const yesterdayKey = dayKeyOf(yesterdayAnchor.getTime());

  const byKey = new Map<string, Activity[]>();
  for (const a of activities) {
    const key = dayKeyOf(a.at);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(a);
    else byKey.set(key, [a]);
  }

  const groups: ActivityDayGroup[] = [];
  for (const [dayKey, items] of byKey) {
    items.sort((x, y) => y.at - x.at);
    const label =
      dayKey === todayKey ? labeler.today
        : dayKey === yesterdayKey ? labeler.yesterday
          : labeler.formatDate(items[0].at);
    groups.push({ dayKey, label, items });
  }
  // Newest day first — compare the freshest item in each group.
  groups.sort((g1, g2) => g2.items[0].at - g1.items[0].at);
  return groups;
}
