/**
 * tax-year.ts — fiscal/calendar tax-year window helper.
 *
 * The transaction-based engine needs to know which window of
 * transactions belongs to a given tax year. For most jurisdictions
 * the window is the calendar year. For the UK / AU / ZA (and others
 * in §6.7 of the spec), it's a fiscal year:
 *
 *   GB: 6 April – 5 April
 *   AU: 1 July – 30 June
 *   ZA: 1 March – end of February
 *
 * The schema's `TaxYear` field already carries the start/end dates
 * as ISO month-day strings ("04-06" for 6 April). This module turns
 * that into a concrete unix-ms window for a given tax-year label.
 *
 * Convention for tax-year labelling: the tax year is named after
 * the calendar year in which it ENDS. Examples:
 *   GB 2026 = 6 Apr 2025 – 5 Apr 2026
 *   AU 2026 = 1 Jul 2025 – 30 Jun 2026
 *   ZA 2026 = 1 Mar 2025 – end Feb 2026
 *
 * This matches the convention HMRC / ATO / SARS publish under.
 */
import type { JurisdictionRule, TaxYear } from './schema.js';

export interface TaxYearBounds {
  /** Inclusive lower bound in unix-ms (UTC). */
  fromTs: number;
  /** Inclusive upper bound in unix-ms (UTC) — the LAST millisecond
   *  of the tax year so a `<= toTs` filter is correct. */
  toTs: number;
  /** Human-readable label for UI surface (e.g. "2025-26" for GB,
   *  "2026" for calendar-year jurisdictions). */
  label: string;
}

export function taxYearBoundsForRule(
  rule: JurisdictionRule,
  taxYearLabel: number,
): TaxYearBounds {
  return taxYearBoundsForTaxYear(rule.tax_year, taxYearLabel);
}

export function taxYearBoundsForTaxYear(
  ty: TaxYear,
  taxYearLabel: number,
): TaxYearBounds {
  if (ty.type === 'calendar' || !ty.start_date || !ty.end_date) {
    return {
      fromTs: Date.UTC(taxYearLabel, 0, 1, 0, 0, 0, 0),
      toTs:   Date.UTC(taxYearLabel, 11, 31, 23, 59, 59, 999),
      label:  String(taxYearLabel),
    };
  }

  // Fiscal year — start_date / end_date are "MM-DD".
  const [sm, sd] = parseMonthDay(ty.start_date);
  const [em, ed] = parseMonthDay(ty.end_date);

  // The year is named after the year in which it ENDS. So the
  // start year is (taxYearLabel − 1) if start (month,day) comes
  // AFTER end (month,day) in the calendar — e.g. GB starts Apr 6
  // and ends Apr 5: same month, but the start day is LATER, so the
  // start is in the previous calendar year. Compare month×100+day.
  const startMd = sm * 100 + sd;
  const endMd   = em * 100 + ed;
  const startYear = startMd > endMd ? taxYearLabel - 1 : taxYearLabel;
  const endYear = taxYearLabel;

  const fromTs = Date.UTC(startYear, sm - 1, sd, 0, 0, 0, 0);
  const toTs   = endOfDay(endYear, em, ed);
  const label = startYear === endYear ? `${startYear}` : `${startYear}-${endYear.toString().slice(-2)}`;

  return { fromTs, toTs, label };
}

/** Current tax-year label for a given rule + reference date (defaults
 *  to today). Useful for the UI when defaulting "this year". */
export function currentTaxYearForRule(rule: JurisdictionRule, now = new Date()): number {
  return currentTaxYear(rule.tax_year, now);
}

export function currentTaxYear(ty: TaxYear, now: Date): number {
  if (ty.type === 'calendar' || !ty.start_date) {
    return now.getUTCFullYear();
  }
  // We're in the fiscal year that ENDS in either this calendar year
  // or the next, depending on whether `now` is past the start_date.
  const [sm, sd] = parseMonthDay(ty.start_date);
  const startOfThisYearFiscal = Date.UTC(now.getUTCFullYear(), sm - 1, sd);
  return now.getTime() >= startOfThisYearFiscal
    ? now.getUTCFullYear() + 1   // we're past the start — fiscal year ends NEXT calendar year
    : now.getUTCFullYear();      // we're before the start — fiscal year ends THIS calendar year
}

function parseMonthDay(s: string): [number, number] {
  const [m, d] = s.split('-').map((n) => Number.parseInt(n, 10));
  return [m ?? 1, d ?? 1];
}

function endOfDay(year: number, month: number, day: number): number {
  // Last millisecond of the given day, UTC.
  return Date.UTC(year, month - 1, day, 23, 59, 59, 999);
}
