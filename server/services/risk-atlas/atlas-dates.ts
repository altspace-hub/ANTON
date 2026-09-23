/**
 * A DATE/TIMESTAMPTZ column as YYYY-MM-DD — node-postgres returns a Date object, not a string.
 *
 * A DATE arrives as LOCAL midnight (`new Date(y, m, d)`), so its day is read in
 * local time. Reading it in UTC (toISOString) put every date one day early east
 * of Greenwich — a 2027-03-31 target showed as 2027-03-30 (found live
 * 2026-09-23, on a UTC+2 server). Kept in its own module so atlas-service can
 * use it without importing atlas-bwra (which imports atlas-service).
 */
export function isoDay(v: unknown): string | null {
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  }
  if (typeof v === 'string' && v.trim()) return v.slice(0, 10);
  return null;
}
