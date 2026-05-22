/**
 * stats.ts — sales analytics over the local receipt + refund stores.
 *
 * Pure read-side aggregation. No new IndexedDB store, no schema
 * change — everything is computed on demand from `listReceipts()` +
 * `listRefunds()`. At a few thousand kvittos this is a sub-10ms walk;
 * if a high-volume merchant ever outgrows that we can add a rolled-up
 * daily-totals store, but for v1 the live computation keeps the data
 * model honest (one source of truth = the kvittos themselves).
 *
 * Conventions:
 *   • All money is SEK (the merchant's settlement currency).
 *   • `voided` receipts/refunds are excluded from every figure — a
 *     voided kvitto is not a sale.
 *   • A "sale" is a non-voided receipt. Gross = amountSek (VAT-incl).
 *   • Refunds are subtracted from net revenue but reported separately
 *     so the merchant can see both.
 */
import { listReceipts } from './receipts';
import { listRefunds } from './refunds';
import type { Receipt, RefundReceipt } from './types';

// ───────────────────────────────────────────────────────────────────────
// Period handling
// ───────────────────────────────────────────────────────────────────────

export type StatsPeriod = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'all';

export interface PeriodRange {
  /** Inclusive lower bound (ms epoch). 0 for 'all'. */
  fromMs: number;
  /** Exclusive upper bound (ms epoch). */
  toMs: number;
  period: StatsPeriod;
}

/** Resolve a period keyword into a concrete [from, to) range. `now`
 *  is injectable for deterministic tests. Weeks start Monday (sv-SE). */
export function resolvePeriod(period: StatsPeriod, now = Date.now()): PeriodRange {
  const d = new Date(now);
  const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  switch (period) {
    case 'today':
      return { fromMs: startOfDay, toMs: now, period };
    case 'week': {
      // Monday-based week.
      const dow = (d.getDay() + 6) % 7; // 0 = Monday
      const monday = startOfDay - dow * 86_400_000;
      return { fromMs: monday, toMs: now, period };
    }
    case 'month':
      return { fromMs: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), toMs: now, period };
    case 'quarter': {
      const q = Math.floor(d.getMonth() / 3) * 3;
      return { fromMs: new Date(d.getFullYear(), q, 1).getTime(), toMs: now, period };
    }
    case 'year':
      return { fromMs: new Date(d.getFullYear(), 0, 1).getTime(), toMs: now, period };
    case 'all':
      return { fromMs: 0, toMs: now, period };
  }
}

/** The matching previous range — same length, immediately before
 *  `range.fromMs`. Used for period-over-period deltas. 'all' has no
 *  meaningful previous range, so it returns a zero-width range. */
export function previousRange(range: PeriodRange): PeriodRange {
  if (range.period === 'all') {
    return { fromMs: 0, toMs: 0, period: 'all' };
  }
  const span = range.toMs - range.fromMs;
  return { fromMs: range.fromMs - span, toMs: range.fromMs, period: range.period };
}

// ───────────────────────────────────────────────────────────────────────
// Core summary
// ───────────────────────────────────────────────────────────────────────

export interface SalesSummary {
  /** Count of non-voided receipts in range. */
  saleCount: number;
  /** Gross SEK (VAT-inclusive) across those sales. */
  grossSek: number;
  /** Net SEK (gross − VAT). */
  netSek: number;
  /** VAT collected, SEK. */
  vatSek: number;
  /** Average sale value, SEK (gross / saleCount; 0 when no sales). */
  avgSaleSek: number;
  /** Total item count across all sales (sum of receipt.itemCount). */
  itemsSold: number;
  /** Count of non-voided refunds in range. */
  refundCount: number;
  /** Total refunded, SEK. */
  refundedSek: number;
  /** Net revenue after refunds, SEK (grossSek − refundedSek). */
  netOfRefundsSek: number;
  /** FTC received across the range (micro-FTC summed → FTC). */
  ftcReceived: number;
}

function inRange(ms: number, r: PeriodRange): boolean {
  return ms >= r.fromMs && ms < r.toMs;
}

/** A receipt counts as a sale when it isn't voided. */
function isSale(r: Receipt): boolean {
  return r.status !== 'voided';
}

function isLiveRefund(r: RefundReceipt): boolean {
  return r.status !== 'voided';
}

/** Compute the headline summary for a range from pre-loaded rows. */
export function summarise(
  receipts: Receipt[],
  refunds: RefundReceipt[],
  range: PeriodRange,
): SalesSummary {
  let grossSek = 0, vatSek = 0, itemsSold = 0, saleCount = 0;
  let ftcMicro = 0n;
  for (const r of receipts) {
    if (!isSale(r) || !inRange(r.createdAt, range)) continue;
    saleCount++;
    grossSek += r.amountSek;
    vatSek += r.vatSek;
    itemsSold += r.itemCount;
    ftcMicro += r.amountMicroFtc;
  }
  let refundCount = 0, refundedSek = 0;
  for (const rf of refunds) {
    if (!isLiveRefund(rf) || !inRange(rf.createdAt, range)) continue;
    refundCount++;
    refundedSek += rf.amountSek;
  }
  const netSek = grossSek - vatSek;
  return {
    saleCount,
    grossSek,
    netSek,
    vatSek,
    avgSaleSek: saleCount > 0 ? grossSek / saleCount : 0,
    itemsSold,
    refundCount,
    refundedSek,
    netOfRefundsSek: grossSek - refundedSek,
    ftcReceived: Number(ftcMicro) / 1_000_000,
  };
}

// ───────────────────────────────────────────────────────────────────────
// Trend series — time-bucketed gross sales
// ───────────────────────────────────────────────────────────────────────

export type TrendGranularity = 'hour' | 'day' | 'week' | 'month';

export interface TrendBucket {
  /** Bucket start (ms epoch). */
  startMs: number;
  /** Human label for the axis ("Mon", "14:00", "Mar", "v.12"). */
  label: string;
  grossSek: number;
  saleCount: number;
}

/** Pick a sensible granularity for a period when the caller doesn't
 *  force one: today→hour, week→day, month→day, quarter→week,
 *  year→month, all→month. */
export function granularityFor(period: StatsPeriod): TrendGranularity {
  switch (period) {
    case 'today':   return 'hour';
    case 'week':    return 'day';
    case 'month':   return 'day';
    case 'quarter': return 'week';
    case 'year':    return 'month';
    case 'all':     return 'month';
  }
}

function bucketStart(ms: number, g: TrendGranularity): number {
  const d = new Date(ms);
  switch (g) {
    case 'hour':
      return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()).getTime();
    case 'day':
      return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    case 'week': {
      const dow = (d.getDay() + 6) % 7;
      const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      return day - dow * 86_400_000;
    }
    case 'month':
      return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  }
}

function bucketLabel(ms: number, g: TrendGranularity): string {
  const d = new Date(ms);
  switch (g) {
    case 'hour':
      return `${d.getHours().toString().padStart(2, '0')}`;
    case 'day':
      return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
    case 'week': {
      // ISO-ish week number.
      const jan1 = new Date(d.getFullYear(), 0, 1).getTime();
      const wk = Math.floor((ms - jan1) / (7 * 86_400_000)) + 1;
      return `v.${wk}`;
    }
    case 'month':
      return d.toLocaleDateString('sv-SE', { month: 'short' });
  }
}

/**
 * Build a contiguous trend series across the range — every bucket is
 * present even if it had zero sales, so the chart x-axis is even.
 */
export function trend(
  receipts: Receipt[],
  range: PeriodRange,
  granularity?: TrendGranularity,
): TrendBucket[] {
  const g = granularity ?? granularityFor(range.period);
  // Determine the actual span. For 'all', clamp to the earliest sale.
  let from = range.fromMs;
  if (range.period === 'all') {
    let earliest = range.toMs;
    for (const r of receipts) {
      if (isSale(r) && r.createdAt < earliest) earliest = r.createdAt;
    }
    from = earliest;
  }
  // Seed every bucket from `from` to `toMs`.
  const buckets = new Map<number, TrendBucket>();
  let cursor = bucketStart(from, g);
  const guardMax = 1000; // safety — never emit more than 1000 buckets
  let n = 0;
  while (cursor < range.toMs && n < guardMax) {
    buckets.set(cursor, { startMs: cursor, label: bucketLabel(cursor, g), grossSek: 0, saleCount: 0 });
    cursor = nextBucket(cursor, g);
    n++;
  }
  // Fold sales in.
  for (const r of receipts) {
    if (!isSale(r) || !inRange(r.createdAt, range)) continue;
    const key = bucketStart(r.createdAt, g);
    const b = buckets.get(key);
    if (b) { b.grossSek += r.amountSek; b.saleCount++; }
  }
  return [...buckets.values()].sort((a, b) => a.startMs - b.startMs);
}

function nextBucket(ms: number, g: TrendGranularity): number {
  const d = new Date(ms);
  switch (g) {
    case 'hour':  return ms + 3_600_000;
    case 'day':   return ms + 86_400_000;
    case 'week':  return ms + 7 * 86_400_000;
    case 'month': return new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
  }
}

// ───────────────────────────────────────────────────────────────────────
// Top items — aggregate cart lines across receipts
// ───────────────────────────────────────────────────────────────────────

export interface ItemStat {
  name: string;
  /** Units sold. */
  qty: number;
  /** Gross SEK attributable to this item (unitPrice × qty, VAT-incl). */
  grossSek: number;
}

/**
 * Aggregate the line items of every in-range sale. Simple-mode
 * receipts have `lines: null` (no itemisation) — they're folded into
 * a single synthetic "Quick sale" row so the totals still reconcile.
 */
export function topItems(
  receipts: Receipt[],
  range: PeriodRange,
  limit = 10,
): ItemStat[] {
  const byName = new Map<string, ItemStat>();
  let quickSaleGross = 0, quickSaleCount = 0;
  for (const r of receipts) {
    if (!isSale(r) || !inRange(r.createdAt, range)) continue;
    if (r.lines && r.lines.length > 0) {
      for (const l of r.lines) {
        const key = l.name;
        const cur = byName.get(key) ?? { name: key, qty: 0, grossSek: 0 };
        cur.qty += l.quantity;
        cur.grossSek += l.unitPriceSek * l.quantity;
        byName.set(key, cur);
      }
    } else {
      quickSaleGross += r.amountSek;
      quickSaleCount++;
    }
  }
  const rows = [...byName.values()];
  if (quickSaleCount > 0) {
    rows.push({ name: '__quick_sale__', qty: quickSaleCount, grossSek: quickSaleGross });
  }
  rows.sort((a, b) => b.grossSek - a.grossSek);
  return rows.slice(0, limit);
}

// ───────────────────────────────────────────────────────────────────────
// Revenue by category — uses CartLine items mapped through the
// catalogue. Lines carry no category, so the caller passes a
// name→category map built from loadItems().
// ───────────────────────────────────────────────────────────────────────

export interface CategoryStat {
  category: string;
  grossSek: number;
  qty: number;
}

export function revenueByCategory(
  receipts: Receipt[],
  range: PeriodRange,
  nameToCategory: Map<string, string>,
): CategoryStat[] {
  const byCat = new Map<string, CategoryStat>();
  for (const r of receipts) {
    if (!isSale(r) || !inRange(r.createdAt, range) || !r.lines) continue;
    for (const l of r.lines) {
      const cat = nameToCategory.get(l.name) ?? '__uncategorised__';
      const cur = byCat.get(cat) ?? { category: cat, grossSek: 0, qty: 0 };
      cur.grossSek += l.unitPriceSek * l.quantity;
      cur.qty += l.quantity;
      byCat.set(cat, cur);
    }
  }
  return [...byCat.values()].sort((a, b) => b.grossSek - a.grossSek);
}

// ───────────────────────────────────────────────────────────────────────
// Revenue by VAT rate — straight off receipt.vatBreakdown
// ───────────────────────────────────────────────────────────────────────

export interface VatRateStat {
  rate: 0 | 6 | 12 | 25;
  netSek: number;
  vatSek: number;
}

export function revenueByVatRate(receipts: Receipt[], range: PeriodRange): VatRateStat[] {
  const byRate = new Map<number, VatRateStat>();
  for (const r of receipts) {
    if (!isSale(r) || !inRange(r.createdAt, range)) continue;
    for (const b of r.vatBreakdown) {
      const cur = byRate.get(b.rate) ?? { rate: b.rate, netSek: 0, vatSek: 0 };
      cur.netSek += b.netSek;
      cur.vatSek += b.vatSek;
      byRate.set(b.rate, cur);
    }
  }
  return [...byRate.values()].sort((a, b) => a.rate - b.rate);
}

// ───────────────────────────────────────────────────────────────────────
// Busiest hours — 0..23 histogram of sale counts
// ───────────────────────────────────────────────────────────────────────

export function hourHistogram(receipts: Receipt[], range: PeriodRange): number[] {
  const hours = new Array(24).fill(0) as number[];
  for (const r of receipts) {
    if (!isSale(r) || !inRange(r.createdAt, range)) continue;
    hours[new Date(r.createdAt).getHours()]++;
  }
  return hours;
}

// ───────────────────────────────────────────────────────────────────────
// One-shot loader — pulls both stores once and returns a bundle the
// StatisticsScreen can slice without re-hitting IndexedDB per metric.
// ───────────────────────────────────────────────────────────────────────

export interface StatsBundle {
  receipts: Receipt[];
  refunds: RefundReceipt[];
}

/** Load every receipt + refund once. The 5000 limit comfortably
 *  covers a year of a busy bar; revisit if a merchant outgrows it. */
export async function loadStatsBundle(): Promise<StatsBundle> {
  const [receipts, refunds] = await Promise.all([
    listReceipts(5000),
    listRefunds(5000),
  ]);
  return { receipts, refunds };
}
