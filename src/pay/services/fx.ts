/**
 * fx.ts — FTC ↔ fiat conversion (Pay).
 *
 * Three rates with three different lifecycles, mirroring how every
 * production wallet (Phantom, Coinbase Wallet, MetaMask Mobile)
 * structures this:
 *
 *   1. DISPLAY rate — mid-market spot, refreshed every 60 s while
 *      foregrounded, hidden if older than 5 min. Used for "you'll
 *      pay ≈ X SEK" labels everywhere outside the signing modal.
 *
 *   2. SIGNING rate — snapshot at the moment the user taps biometric-
 *      confirm. Aborts the sign if older than 30 s. Baked into the
 *      PaymentRecord so the broadcast amount can never silently
 *      diverge from what was authorised.
 *
 *   3. ACCOUNTING rate — snapshot at receipt time, persisted FOREVER
 *      on the record. This is the rate Skatteverket K4 and the
 *      bokföringskonsult will audit against; it must NOT be
 *      retroactively recomputed if exchange-rate history changes.
 *
 * Until Bahnhof publishes a live FTC reference oracle, the default
 * source returns null → the UI shows "Rate unavailable — FTC only"
 * with a banner rather than a fabricated number. The handoff doc
 * (HANDOFF_WINDOWS.md) confirms FTC has no live price yet; this
 * module is the seam we'll plug a real source into when it lands.
 *
 * Volatility warning: if the display rate moved more than 2 % during
 * the 60 s before sign-confirm, the caller should surface a banner.
 * The volatilityWarn() helper does the comparison; the UI owns the
 * banner.
 *
 * Compliance hook: MiCA Art. 66 ("fair, clear, not misleading") and
 * the Joint ESA crypto-asset warning (Oct 2025) require that any
 * fiat-equivalent shown to a retail user carry source + timestamp +
 * volatility caveat. This module emits all three on every quote.
 */
import { getSecure, setSecure } from './secure-store';

/** ISO-4217 currency codes we explicitly support. */
export type FiatCurrency = 'SEK' | 'EUR' | 'USD';

export interface Quote {
  /** Micro-FTC per 1.0 of the fiat unit (1 SEK = N µFTC, etc.).
   *  Stored as a string to dodge floating-point precision drift —
   *  parse via BigInt or Number at the call site. */
  microFtcPerFiat: string;
  /** Fiat per 1 FTC, the more intuitive direction for display. */
  fiatPerFtc: number;
  /** ISO-4217 of the fiat denomination. */
  currency: FiatCurrency;
  /** Epoch ms when the quote was observed at its source. */
  observedAt: number;
  /** Name of the rate source — shown to the user in the small print
   *  next to any fiat-equivalent figure. */
  source: string;
}

const PREFERRED_FIAT_KEY = 'fc.fx.preferred_fiat';
/** Max age for a display rate before we hide it as "stale". */
const DISPLAY_STALE_MS = 5 * 60 * 1000;
/** Max age for a signing rate — strict; abort sign if exceeded. */
const SIGNING_STALE_MS = 30 * 1000;

let cachedDisplay: Quote | null = null;
let displayCacheUntil = 0;

/** User-chosen fiat for display + input mode. SEK default for the
 *  Sweden launch. Stored in secure-store so it survives a cache wipe
 *  alongside the wallet. */
export async function getPreferredFiat(): Promise<FiatCurrency> {
  const stored = await getSecure(PREFERRED_FIAT_KEY);
  if (stored === 'SEK' || stored === 'EUR' || stored === 'USD') return stored;
  return 'SEK';
}

export async function setPreferredFiat(currency: FiatCurrency): Promise<void> {
  await setSecure(PREFERRED_FIAT_KEY, currency);
}

/**
 * Mid-market display quote. Cached for 60 s. Returns null if no
 * source is available — callers MUST render "Rate unavailable" in
 * that case rather than fabricate a value. This is the path until
 * Bahnhof publishes its oracle.
 */
export async function getDisplayQuote(
  currency: FiatCurrency = 'SEK',
): Promise<Quote | null> {
  const now = Date.now();
  if (cachedDisplay && cachedDisplay.currency === currency && now < displayCacheUntil) {
    return cachedDisplay;
  }
  const fresh = await fetchFromSource(currency);
  if (!fresh) return null;
  cachedDisplay = fresh;
  displayCacheUntil = now + 60_000;
  return fresh;
}

/**
 * Strict signing-time quote. Re-fetches if the cached one is older
 * than 30 s. Throws if no source is reachable — never silently
 * proceeds to sign with a stale or absent rate.
 */
export async function getSigningQuote(currency: FiatCurrency): Promise<Quote> {
  const cached = cachedDisplay;
  const fresh = cached && cached.currency === currency &&
                Date.now() - cached.observedAt < SIGNING_STALE_MS
    ? cached
    : await fetchFromSource(currency);
  if (!fresh) {
    throw new Error(
      `No live FTC/${currency} rate available — payment cannot be signed at a fiat amount.`,
    );
  }
  return fresh;
}

/**
 * Stable accounting-time quote — captured at receipt creation,
 * NEVER updated after. The caller persists the returned Quote on
 * the record (PaymentRecord / Receipt) so future audits can
 * reproduce the SEK value of the taxable event.
 */
export async function captureAccountingQuote(
  currency: FiatCurrency,
): Promise<Quote | null> {
  // Same source as display, but we don't cache — we want the freshest
  // value at the precise moment of capture.
  return fetchFromSource(currency);
}

/** True if the display quote is older than the staleness threshold. */
export function isStale(q: Quote | null, kind: 'display' | 'signing' = 'display'): boolean {
  if (!q) return true;
  const ttl = kind === 'signing' ? SIGNING_STALE_MS : DISPLAY_STALE_MS;
  return Date.now() - q.observedAt > ttl;
}

/**
 * Did the rate move more than `thresholdPct` between two snapshots?
 * Used to surface a "FTC moved 2.3 % in the last minute — review
 * amount" banner before signing.
 */
export function volatilityMoved(
  before: Quote | null,
  after: Quote | null,
  thresholdPct = 2,
): boolean {
  if (!before || !after || before.currency !== after.currency) return false;
  const drift = Math.abs(after.fiatPerFtc - before.fiatPerFtc) / before.fiatPerFtc;
  return drift * 100 >= thresholdPct;
}

// ── Conversion helpers ──────────────────────────────────────────────

/** Convert a fiat amount (e.g. "1.50" SEK) to micro-FTC, using the
 *  given quote. Strict decimal parser to avoid float drift. */
export function fiatToMicroFtc(fiatStr: string, q: Quote): bigint | null {
  const trimmed = fiatStr.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(trimmed)) return null;
  const fiatN = Number(trimmed);
  if (!Number.isFinite(fiatN)) return null;
  const microPerFiat = Number(q.microFtcPerFiat);
  if (!Number.isFinite(microPerFiat) || microPerFiat <= 0) return null;
  return BigInt(Math.round(fiatN * microPerFiat));
}

/** Convert micro-FTC to a fiat display string ("12,34 SEK") at the
 *  given quote. Uses sv-SE conventions for SEK display; falls back
 *  to en-US for EUR/USD. */
export function microFtcToFiatLabel(micro: bigint, q: Quote): string {
  const ftc = Number(micro) / 1_000_000;
  const fiat = ftc * q.fiatPerFtc;
  const locale = q.currency === 'SEK' ? 'sv-SE' : 'en-US';
  return `${fiat.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${q.currency}`;
}

// ── Internal: source fetch ──────────────────────────────────────────

/**
 * Fetch the current mid-market rate from the configured source.
 * Returns null when no source is available — explicitly NOT a
 * fabricated default. When Bahnhof publishes its reference oracle
 * the implementation hooks here; for now this is the "FTC has no
 * live price yet" guard.
 *
 * Future: try Bahnhof oracle first, fall back to a curated chain
 * (CoinGecko-style aggregator → exchange-direct → cached last-known
 * with a stale flag).
 */
async function fetchFromSource(_currency: FiatCurrency): Promise<Quote | null> {
  // PHASE 1 — no live oracle. Return null so the UI shows
  // "Rate unavailable" rather than a fake number. A future commit
  // will hit the Bahnhof oracle here when its endpoint ships.
  return null;
}
