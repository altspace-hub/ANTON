/**
 * fraud-engine.ts — the light fraud engine.
 *
 * A pure, deterministic scorer (no I/O, no LLM, no network) — the same
 * "deterministic engine" shape as the Risk Atlas. It compares a pending
 * payment against two baselines:
 *   • the self-declared money profile  (Phase 2)
 *   • the derived behaviour profile    (Phase 3)
 * and returns a risk level + a list of plain-language signals.
 *
 * It is ADVISORY. The UI shows the signals before the customer
 * confirms; it never blocks a payment. The goal is to help a person
 * spot a scam or a mistake — "is this normal *for me*?" — not to run a
 * regulated AML system (Heimdall screens sanctions at the node).
 *
 * Every signal carries an i18n `messageKey`, so the engine stays
 * language-agnostic and fully testable.
 */
import type { MoneyProfile } from './money-profile';
import type { BehaviorProfile } from './behavior-profile';
import { isKnownCounterparty } from './behavior-profile';

const MICRO_PER_FTC = 1_000_000;
const DAY_MS = 86_400_000;

export type FraudSeverity = 'info' | 'caution' | 'warning';

export type FraudSignalId =
  | 'amount-anomaly'
  | 'above-typical'
  | 'new-counterparty'
  | 'new-counterparty-large'
  | 'velocity'
  | 'monthly-cap'
  | 'odd-hour'
  | 'expiring-qr'
  | 'dormancy-break';

export interface FraudSignal {
  id: FraudSignalId;
  severity: FraudSeverity;
  /** i18n key, always `fraud.signal.<id>`. */
  messageKey: string;
  /** Interpolation params for the i18n message. */
  params: Record<string, string | number>;
}

export type FraudLevel = 'clear' | 'caution' | 'warning';

export interface FraudAssessment {
  /** 0–100, the capped sum of triggered-signal weights. */
  score: number;
  /** Highest severity present: drives the UI alarm state. */
  level: FraudLevel;
  signals: FraudSignal[];
}

/** A payment about to be confirmed. */
export interface PendingPayment {
  amountMicroFtc: bigint;
  /** Merchant id or recipient address. */
  counterparty: string;
  /** ADR-004 purpose, or '' if unknown. */
  purpose: string;
  /** Unix-seconds QR expiry; 0 when the QR carried none. */
  expUnixSeconds: number;
  /** Epoch ms — injectable for tests. */
  now: number;
}

const SEVERITY_WEIGHT: Record<FraudSeverity, number> = {
  info: 8,
  caution: 22,
  warning: 45,
};

function ftcToMicro(ftc: number): bigint {
  if (!Number.isFinite(ftc) || ftc <= 0) return 0n;
  return BigInt(Math.round(ftc * MICRO_PER_FTC));
}

/** Ratio of two micro-FTC amounts as a float (a / b). b must be > 0n. */
function ratio(a: bigint, b: bigint): number {
  return Number(a) / Number(b);
}

/**
 * Assess a pending payment. Pure + deterministic — same inputs always
 * yield the same assessment.
 */
export function assessPayment(
  pending: PendingPayment,
  money: MoneyProfile | null,
  behavior: BehaviorProfile,
): FraudAssessment {
  const signals: FraudSignal[] = [];
  const add = (
    id: FraudSignalId,
    severity: FraudSeverity,
    params: Record<string, string | number> = {},
  ) => {
    signals.push({ id, severity, messageKey: `fraud.signal.${id}`, params });
  };

  const amount = pending.amountMicroFtc;
  const hasHistory = behavior.count >= 3;
  const typicalMicro = ftcToMicro(money?.typicalPaymentFtc ?? 0);

  // ── Is this a "large" payment, by either baseline? ──────────────
  const largeVsHistory =
    hasHistory && behavior.medianMicroFtc > 0n &&
    amount >= behavior.medianMicroFtc * 2n;
  const largeVsTypical =
    typicalMicro > 0n && amount >= typicalMicro * 2n;
  const isLarge = largeVsHistory || largeVsTypical;

  // ── 1. Amount anomaly vs the customer's empirical pattern ───────
  if (hasHistory && behavior.medianMicroFtc > 0n) {
    const r = ratio(amount, behavior.medianMicroFtc);
    if (amount > behavior.maxMicroFtc * 3n || r >= 5) {
      add('amount-anomaly', 'warning', { factor: Math.round(r) });
    } else if (r >= 3) {
      add('amount-anomaly', 'caution', { factor: Math.round(r) });
    }
  }

  // ── 2. Amount vs the customer's *declared* typical payment ──────
  if (typicalMicro > 0n) {
    const r = ratio(amount, typicalMicro);
    if (r >= 5) {
      add('above-typical', 'warning', { factor: Math.round(r) });
    } else if (r >= 3) {
      add('above-typical', 'caution', { factor: Math.round(r) });
    }
  }

  // ── 3/4. New counterparty (escalated if also large) ─────────────
  const isNew =
    behavior.count > 0 && !isKnownCounterparty(behavior, pending.counterparty);
  if (isNew && isLarge) {
    add('new-counterparty-large', 'warning', {});
  } else if (isNew) {
    add('new-counterparty', 'info', {});
  }

  // ── 5. Velocity — payments already made in the last 24h ─────────
  if (behavior.count24h >= 8) {
    add('velocity', 'warning', { count: behavior.count24h });
  } else if (behavior.count24h >= 4) {
    add('velocity', 'caution', { count: behavior.count24h });
  }

  // ── 6. Monthly cap — vs the customer's declared expectation ─────
  const expectedMicro = ftcToMicro(money?.expectedMonthlyFtc ?? 0);
  if (expectedMicro > 0n) {
    const projected = behavior.total30dMicroFtc + amount;
    const expectedFtc = money?.expectedMonthlyFtc ?? 0;
    if (projected > (expectedMicro * 3n) / 2n) {
      add('monthly-cap', 'warning', { expected: expectedFtc });
    } else if (projected > expectedMicro) {
      add('monthly-cap', 'caution', { expected: expectedFtc });
    }
  }

  // ── 7. Odd hour — outside the customer's usual active hours ─────
  if (behavior.count >= 5 && behavior.activeHours.length > 0) {
    const hour = new Date(pending.now).getHours();
    if (!behavior.activeHours.includes(hour)) {
      add('odd-hour', 'caution', {});
    }
  }

  // ── 8. Expiring QR — paying a code that's about to lapse ────────
  if (pending.expUnixSeconds > 0) {
    const secsLeft = pending.expUnixSeconds - Math.floor(pending.now / 1000);
    if (secsLeft > 0 && secsLeft < 60) {
      add('expiring-qr', 'caution', {});
    }
  }

  // ── 9. Dormancy break — a large payment after a long quiet gap ──
  if (behavior.count > 0 && behavior.lastPaymentAt > 0 && isLarge) {
    const gapDays = Math.floor((pending.now - behavior.lastPaymentAt) / DAY_MS);
    if (gapDays >= 60) {
      add('dormancy-break', 'caution', { days: gapDays });
    }
  }

  const score = Math.min(
    100,
    signals.reduce((sum, s) => sum + SEVERITY_WEIGHT[s.severity], 0),
  );
  const level: FraudLevel =
    signals.some((s) => s.severity === 'warning') ? 'warning'
    : signals.some((s) => s.severity === 'caution') ? 'caution'
    : 'clear';

  return { score, level, signals };
}
