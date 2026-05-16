/**
 * behavior-profile.ts — derive the user's empirical money pattern from
 * their local wallet history.
 *
 * Pure logic, no I/O — `deriveBehaviorProfile` is the testable core.
 * The profile is NOT stored: it's recomputed on demand from the wallet
 * ledger that already lives on the device.
 *
 * Together with the self-declared money profile, this is what the
 * light fraud engine (next phase) compares each new payment against —
 * "is this normal *for this person*?".
 *
 * Kept byte-identical to src/pay/services/behavior-profile.ts so the
 * two apps score behaviour the same way.
 */

/** One spend event, normalised from an app's payment/tx record so the
 *  derivation is identical across ANTON Pay and ANTON Comm. */
export interface BehaviorEvent {
  /** Amount in micro-FTC. */
  amountMicroFtc: bigint;
  /** Merchant id or recipient address. */
  counterparty: string;
  /** ADR-004 purpose, or '' when the source record carries none. */
  purpose: string;
  /** Epoch ms the payment was made. */
  at: number;
}

export interface BehaviorProfile {
  /** Number of payments in the history. A low count means the engine
   *  has little to compare against and should stay lenient. */
  count: number;
  /** Median payment amount (micro-FTC). 0n when there is no history. */
  medianMicroFtc: bigint;
  /** Largest single payment (micro-FTC). 0n when there is no history. */
  maxMicroFtc: bigint;
  /** Distinct counterparties already paid, sorted. */
  knownCounterparties: string[];
  /** Distinct local hours-of-day (0–23) the user has transacted in. */
  activeHours: number[];
  /** Distinct payment purposes seen, sorted. */
  purposes: string[];
  /** Epoch ms of the most recent payment, or 0. */
  lastPaymentAt: number;
  /** Payments made in the 24h before `now`. */
  count24h: number;
  /** Total micro-FTC paid in the 24h before `now`. */
  total24hMicroFtc: bigint;
  /** Total micro-FTC paid in the 30 days before `now`. */
  total30dMicroFtc: bigint;
}

const DAY_MS = 86_400_000;

/** The profile of a user with no payment history. */
export function emptyBehaviorProfile(): BehaviorProfile {
  return {
    count: 0,
    medianMicroFtc: 0n,
    maxMicroFtc: 0n,
    knownCounterparties: [],
    activeHours: [],
    purposes: [],
    lastPaymentAt: 0,
    count24h: 0,
    total24hMicroFtc: 0n,
    total30dMicroFtc: 0n,
  };
}

/** Derive the behaviour profile from a list of spend events. `now` is
 *  injectable for deterministic tests; defaults to the wall clock. */
export function deriveBehaviorProfile(
  events: BehaviorEvent[],
  now: number = Date.now(),
): BehaviorProfile {
  if (events.length === 0) return emptyBehaviorProfile();

  const amounts = events
    .map((e) => e.amountMicroFtc)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const mid = amounts.length / 2;
  const medianMicroFtc = amounts.length % 2 === 1
    ? amounts[(amounts.length - 1) / 2]!
    : (amounts[mid - 1]! + amounts[mid]!) / 2n;

  const maxMicroFtc = amounts[amounts.length - 1]!;

  const knownCounterparties = [...new Set(
    events.map((e) => e.counterparty).filter((c) => c.length > 0),
  )].sort();

  const activeHours = [...new Set(
    events.map((e) => new Date(e.at).getHours()),
  )].sort((a, b) => a - b);

  const purposes = [...new Set(
    events.map((e) => e.purpose).filter((p) => p.length > 0),
  )].sort();

  let lastPaymentAt = 0;
  let count24h = 0;
  let total24hMicroFtc = 0n;
  let total30dMicroFtc = 0n;
  for (const e of events) {
    if (e.at > lastPaymentAt) lastPaymentAt = e.at;
    const age = now - e.at;
    if (age >= 0 && age < DAY_MS) {
      count24h += 1;
      total24hMicroFtc += e.amountMicroFtc;
    }
    if (age >= 0 && age < 30 * DAY_MS) {
      total30dMicroFtc += e.amountMicroFtc;
    }
  }

  return {
    count: events.length,
    medianMicroFtc,
    maxMicroFtc,
    knownCounterparties,
    activeHours,
    purposes,
    lastPaymentAt,
    count24h,
    total24hMicroFtc,
    total30dMicroFtc,
  };
}

/** True when a counterparty has been paid at least once before. */
export function isKnownCounterparty(
  profile: BehaviorProfile,
  counterparty: string,
): boolean {
  return profile.knownCounterparties.includes(counterparty);
}
