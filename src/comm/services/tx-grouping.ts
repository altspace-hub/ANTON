/**
 * tx-grouping.ts — bucket the wallet ledger into per-calendar-day groups
 * for the history view's sticky "Today / Yesterday / <date>" headers.
 *
 * Pure + deterministic (`now` injected, no Date.now() inside) so the
 * Today/Yesterday boundaries are unit-testable. Ported from Pay's
 * activity.ts groupActivityByDay, adapted to Comm's WalletTx (#86).
 */
import type { WalletTx } from './transactions';

/** One calendar-day bucket of transactions, newest item first. */
export interface TxDayGroup {
  /** Stable `YYYY-MM-DD` key for the local calendar day (React key). */
  dayKey: string;
  /** Human-readable header — "Today" / "Yesterday" / an explicit date. */
  label: string;
  /** The day's rows, newest first. */
  items: WalletTx[];
}

/** How the grouping helper turns a day into its sticky-header label. The
 *  caller supplies i18n + the explicit-date formatter so this stays free
 *  of react-i18next / locale concerns. */
export interface GroupLabeler {
  today: string;
  yesterday: string;
  formatDate: (ms: number) => string;
}

/** Local-calendar-day key — `YYYY-MM-DD` in the device timezone, so a
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
 * Bucket a flat WalletTx[] into ordered per-day groups. Newest day first;
 * within each day, newest item first. Sorts defensively — does not assume
 * the input is ordered.
 */
export function groupTxsByDay(
  txs: WalletTx[],
  labeler: GroupLabeler,
  now: number,
): TxDayGroup[] {
  const todayKey = dayKeyOf(now);
  // One day earlier from a local-midnight anchor so DST shifts don't bleed
  // "yesterday" into the wrong bucket.
  const yesterdayAnchor = new Date(now);
  yesterdayAnchor.setHours(0, 0, 0, 0);
  yesterdayAnchor.setDate(yesterdayAnchor.getDate() - 1);
  const yesterdayKey = dayKeyOf(yesterdayAnchor.getTime());

  const byKey = new Map<string, WalletTx[]>();
  for (const tx of txs) {
    const key = dayKeyOf(tx.ts);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(tx);
    else byKey.set(key, [tx]);
  }

  const groups: TxDayGroup[] = [];
  for (const [dayKey, items] of byKey) {
    items.sort((x, y) => y.ts - x.ts);
    const label =
      dayKey === todayKey ? labeler.today
        : dayKey === yesterdayKey ? labeler.yesterday
          : labeler.formatDate(items[0]!.ts);
    groups.push({ dayKey, label, items });
  }
  // Newest day first — compare the freshest item in each group.
  groups.sort((g1, g2) => g2.items[0]!.ts - g1.items[0]!.ts);
  return groups;
}
