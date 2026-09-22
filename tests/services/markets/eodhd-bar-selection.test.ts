import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * 2026-08-18: EODHD reported a successful fetch every day while the newest
 * stored bar sat at 2026-07-31 for two and a half weeks. Nothing was wrong
 * with the key or the plan — the API returns its window ASCENDING (oldest
 * first), unlike FMP and Alpha Vantage, and the ingest kept `.slice(0, 10)`.
 * So it stored the oldest ten bars of a 30-day window and discarded every
 * recent one. ANTON Sweden 100 draws 10/10 holdings from that feed, so its
 * NAV was priced off July closes.
 *
 * Verified against the live API on 2026-08-18: the 30-day window returned 21
 * rows, 2026-07-20 .. 2026-08-17, ascending.
 */
const src = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../../server/services/market-data-service.ts'),
  'utf8',
);

/** The EODHD ingest body, isolated from the other providers' fetchers. */
function eodhdBody(): string {
  const start = src.indexOf('async function fetchEODHD');
  expect(start, 'fetchEODHD must exist').toBeGreaterThan(-1);
  const next = src.indexOf('\n  async function ', start + 10);
  return src.slice(start, next === -1 ? src.length : next);
}

describe('EODHD bar selection', () => {
  it('does not keep the head of the provider-ordered array', () => {
    // .slice(0, N) directly on the API response is the bug: for an ascending
    // provider it selects the oldest bars.
    expect(eodhdBody()).not.toMatch(/\(days\s*\?\?\s*\[\]\)\.slice\(\s*0\s*,/);
  });

  it('orders bars by date before truncating', () => {
    const body = eodhdBody();
    expect(body).toMatch(/\.sort\(/);
    // Sort must be on the bar date, and descending, so slice takes the newest.
    expect(body).toMatch(/a\.date\s*<\s*b\.date\s*\?\s*1/);
  });
});

describe('sibling price ingests keep the newest bars', () => {
  it('documents that FMP and Alpha Vantage return newest-first', () => {
    // Both were verified correct when the EODHD bug was found: their
    // .slice(0, N) takes the newest because those providers sort descending.
    // If either provider ever flips order, this comment is the breadcrumb —
    // the guard that matters is that EODHD no longer trusts provider order.
    expect(src).toMatch(/newest first/);
  });
});
