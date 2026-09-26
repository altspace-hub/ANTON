/**
 * Calendar days from the API.
 *
 * A DATE column arrives as 'YYYY-MM-DD' (server/db/adapters/postgresql-adapter.ts).
 * `new Date('2027-03-31')` reads that as UTC midnight, which a browser west of
 * Greenwich shows as 30 March. A day is a day: read it in local time.
 */
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A Date for the value — a bare 'YYYY-MM-DD' at local midnight, anything else as `new Date` reads it. */
export function parseDay(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = DAY.exec(value.trim());
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The value as a local date string, or '' when it is empty or not a date. */
export function formatDay(value: string | null | undefined, options?: Intl.DateTimeFormatOptions): string {
  const d = parseDay(value);
  return d ? d.toLocaleDateString(undefined, options) : '';
}
