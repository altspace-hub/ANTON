/**
 * fraud.test.ts — coverage for the deterministic light fraud engine: each signal
 * rule, plus score + level derivation. Ported from the (now-removed) per-app
 * copies in ANTON Pay + Comm when the engine was promoted into the SDK
 * (2026-07-17). Fixtures use the SDK's structural input types.
 */
import { describe, expect, it } from 'vitest';
import {
  assessPayment, isKnownCounterparty,
  type PendingPayment, type FraudBehaviorProfile, type FraudMoneyProfile,
} from './index.js';

const NOW = Date.parse('2026-05-16T12:00:00Z');
const NOW_HOUR = new Date(NOW).getHours();
const DAY = 86_400_000;

/** A settled behaviour baseline: 10 payments, ~5 FTC median/max. */
function behavior(over: Partial<FraudBehaviorProfile> = {}): FraudBehaviorProfile {
  return {
    count: 10,
    medianMicroFtc: 5_000_000n,
    maxMicroFtc: 8_000_000n,
    knownCounterparties: ['21A58256', 'KNOWNAAA'],
    activeHours: [NOW_HOUR, (NOW_HOUR + 1) % 24],
    lastPaymentAt: NOW - DAY,
    count24h: 1,
    total30dMicroFtc: 50_000_000n,
    ...over,
  };
}

function money(over: Partial<FraudMoneyProfile> = {}): FraudMoneyProfile {
  return { expectedMonthlyFtc: 0, typicalPaymentFtc: 0, ...over };
}

function pending(over: Partial<PendingPayment> = {}): PendingPayment {
  return { amountMicroFtc: 3_000_000n, counterparty: '21A58256', purpose: 'RETAIL', expUnixSeconds: 0, now: NOW, ...over };
}

describe('isKnownCounterparty', () => {
  it('matches a counterparty in the known set', () => {
    expect(isKnownCounterparty({ knownCounterparties: ['A', 'B'] }, 'B')).toBe(true);
    expect(isKnownCounterparty({ knownCounterparties: ['A', 'B'] }, 'C')).toBe(false);
  });
});

describe('assessPayment — clear payment', () => {
  it('a normal payment to a known merchant raises no signals', () => {
    const a = assessPayment(pending(), money(), behavior());
    expect(a.signals).toEqual([]);
    expect(a.level).toBe('clear');
    expect(a.score).toBe(0);
  });
});

describe('assessPayment — amount anomaly', () => {
  it('flags caution at ~3× the median', () => {
    const s = assessPayment(pending({ amountMicroFtc: 15_000_000n }), money(), behavior()).signals.find((x) => x.id === 'amount-anomaly');
    expect(s?.severity).toBe('caution');
  });
  it('flags warning at ~5× the median', () => {
    const a = assessPayment(pending({ amountMicroFtc: 25_000_000n }), money(), behavior());
    expect(a.signals.find((x) => x.id === 'amount-anomaly')?.severity).toBe('warning');
    expect(a.level).toBe('warning');
  });
  it('does not fire without enough history', () => {
    const a = assessPayment(pending({ amountMicroFtc: 25_000_000n }), money(), behavior({ count: 2 }));
    expect(a.signals.find((x) => x.id === 'amount-anomaly')).toBeUndefined();
  });
});

describe('assessPayment — above declared typical', () => {
  it('flags a payment far above the declared typical size', () => {
    const a = assessPayment(pending({ amountMicroFtc: 30_000_000n }), money({ typicalPaymentFtc: 5 }), behavior({ count: 0, medianMicroFtc: 0n }));
    expect(a.signals.find((x) => x.id === 'above-typical')?.severity).toBe('warning');
  });
});

describe('assessPayment — new counterparty', () => {
  it('info-flags a first payment to an unknown merchant', () => {
    const a = assessPayment(pending({ counterparty: 'NEWMERCH' }), money(), behavior());
    expect(a.signals.find((x) => x.id === 'new-counterparty')?.severity).toBe('info');
    expect(a.level).toBe('clear');
  });
  it('warns on a large payment to an unknown merchant', () => {
    const a = assessPayment(pending({ counterparty: 'NEWMERCH', amountMicroFtc: 12_000_000n }), money(), behavior());
    expect(a.signals.find((x) => x.id === 'new-counterparty-large')?.severity).toBe('warning');
    expect(a.signals.find((x) => x.id === 'new-counterparty')).toBeUndefined();
  });
  it('does not flag the very first payment ever', () => {
    const a = assessPayment(pending({ counterparty: 'NEWMERCH' }), money(), behavior({ count: 0, knownCounterparties: [] }));
    expect(a.signals.find((x) => x.id?.startsWith('new-counterparty'))).toBeUndefined();
  });
});

describe('assessPayment — velocity', () => {
  it('cautions at 4 payments in 24h', () => {
    expect(assessPayment(pending(), money(), behavior({ count24h: 4 })).signals.find((x) => x.id === 'velocity')?.severity).toBe('caution');
  });
  it('warns at 8 payments in 24h', () => {
    expect(assessPayment(pending(), money(), behavior({ count24h: 8 })).signals.find((x) => x.id === 'velocity')?.severity).toBe('warning');
  });
});

describe('assessPayment — monthly cap', () => {
  it('cautions when the payment pushes past the declared monthly figure', () => {
    const a = assessPayment(pending({ amountMicroFtc: 5_000_000n }), money({ expectedMonthlyFtc: 52 }), behavior({ total30dMicroFtc: 50_000_000n }));
    expect(a.signals.find((x) => x.id === 'monthly-cap')?.severity).toBe('caution');
  });
  it('warns when far past the declared monthly figure', () => {
    const a = assessPayment(pending({ amountMicroFtc: 40_000_000n }), money({ expectedMonthlyFtc: 52 }), behavior({ total30dMicroFtc: 50_000_000n }));
    expect(a.signals.find((x) => x.id === 'monthly-cap')?.severity).toBe('warning');
  });
});

describe('assessPayment — odd hour', () => {
  it('cautions when the payment hour is outside the usual active hours', () => {
    const a = assessPayment(pending(), money(), behavior({ activeHours: [(NOW_HOUR + 3) % 24, (NOW_HOUR + 4) % 24] }));
    expect(a.signals.find((x) => x.id === 'odd-hour')?.severity).toBe('caution');
  });
  it('does not fire when the hour is a usual one', () => {
    expect(assessPayment(pending(), money(), behavior()).signals.find((x) => x.id === 'odd-hour')).toBeUndefined();
  });
});

describe('assessPayment — expiring QR', () => {
  it('cautions when the QR expires within a minute', () => {
    const a = assessPayment(pending({ expUnixSeconds: Math.floor(NOW / 1000) + 30 }), money(), behavior());
    expect(a.signals.find((x) => x.id === 'expiring-qr')?.severity).toBe('caution');
  });
  it('does not fire for a QR with plenty of time left', () => {
    const a = assessPayment(pending({ expUnixSeconds: Math.floor(NOW / 1000) + 600 }), money(), behavior());
    expect(a.signals.find((x) => x.id === 'expiring-qr')).toBeUndefined();
  });
});

describe('assessPayment — dormancy break', () => {
  it('cautions on a large payment after a long quiet gap', () => {
    const a = assessPayment(pending({ amountMicroFtc: 12_000_000n }), money(), behavior({ lastPaymentAt: NOW - 90 * DAY }));
    expect(a.signals.find((x) => x.id === 'dormancy-break')?.severity).toBe('caution');
  });
});

describe('assessPayment — score & level', () => {
  it('a single warning signal makes the level warning', () => {
    const a = assessPayment(pending({ amountMicroFtc: 25_000_000n }), money(), behavior());
    expect(a.level).toBe('warning');
    expect(a.score).toBeGreaterThanOrEqual(45);
  });
  it('caps the score at 100', () => {
    const a = assessPayment(
      pending({ counterparty: 'NEW', amountMicroFtc: 60_000_000n }),
      money({ typicalPaymentFtc: 5, expectedMonthlyFtc: 20 }),
      behavior({ count24h: 9, lastPaymentAt: NOW - 90 * DAY }),
    );
    expect(a.score).toBe(100);
    expect(a.level).toBe('warning');
  });
});
