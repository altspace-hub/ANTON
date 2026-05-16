/**
 * behavior-profile.test.ts — coverage for the behaviour-profile
 * derivation (the input to the light fraud engine).
 */
import { describe, expect, it } from 'vitest';
import {
  deriveBehaviorProfile, emptyBehaviorProfile, isKnownCounterparty,
  type BehaviorEvent,
} from '../behavior-profile';

const NOW = Date.parse('2026-05-16T12:00:00Z');
const HOUR = 3_600_000;
const DAY = 86_400_000;

function ev(over: Partial<BehaviorEvent> = {}): BehaviorEvent {
  return {
    amountMicroFtc: 1_000_000n,
    counterparty: '21A58256',
    purpose: 'RETAIL',
    at: NOW - HOUR,
    ...over,
  };
}

describe('deriveBehaviorProfile — empty history', () => {
  it('returns the empty profile', () => {
    expect(deriveBehaviorProfile([], NOW)).toEqual(emptyBehaviorProfile());
  });
});

describe('deriveBehaviorProfile — amounts', () => {
  it('takes the middle value as the median for an odd count', () => {
    const p = deriveBehaviorProfile([
      ev({ amountMicroFtc: 3_000_000n }),
      ev({ amountMicroFtc: 1_000_000n }),
      ev({ amountMicroFtc: 2_000_000n }),
    ], NOW);
    expect(p.medianMicroFtc).toBe(2_000_000n);
    expect(p.maxMicroFtc).toBe(3_000_000n);
    expect(p.count).toBe(3);
  });

  it('averages the two middle values as the median for an even count', () => {
    const p = deriveBehaviorProfile([
      ev({ amountMicroFtc: 1_000_000n }),
      ev({ amountMicroFtc: 2_000_000n }),
      ev({ amountMicroFtc: 3_000_000n }),
      ev({ amountMicroFtc: 4_000_000n }),
    ], NOW);
    expect(p.medianMicroFtc).toBe(2_500_000n);
  });
});

describe('deriveBehaviorProfile — counterparties & purposes', () => {
  it('collects distinct counterparties, sorted, dropping blanks', () => {
    const p = deriveBehaviorProfile([
      ev({ counterparty: 'BBBB' }),
      ev({ counterparty: 'AAAA' }),
      ev({ counterparty: 'BBBB' }),
      ev({ counterparty: '' }),
    ], NOW);
    expect(p.knownCounterparties).toEqual(['AAAA', 'BBBB']);
  });

  it('collects distinct purposes, dropping blanks', () => {
    const p = deriveBehaviorProfile([
      ev({ purpose: 'RETAIL' }),
      ev({ purpose: 'RESTAURANT' }),
      ev({ purpose: 'RETAIL' }),
      ev({ purpose: '' }),
    ], NOW);
    expect(p.purposes).toEqual(['RESTAURANT', 'RETAIL']);
  });

  it('isKnownCounterparty reflects the history', () => {
    const p = deriveBehaviorProfile([ev({ counterparty: 'KNOWN1' })], NOW);
    expect(isKnownCounterparty(p, 'KNOWN1')).toBe(true);
    expect(isKnownCounterparty(p, 'NEVER')).toBe(false);
  });
});

describe('deriveBehaviorProfile — active hours', () => {
  it('collects distinct local hours, sorted ascending', () => {
    const p = deriveBehaviorProfile([
      ev({ at: NOW - HOUR }),
      ev({ at: NOW - 2 * HOUR }),
      ev({ at: NOW - 3 * HOUR }),
      ev({ at: NOW - HOUR }), // same hour as the first → deduped
    ], NOW);
    expect(p.activeHours.length).toBe(3);
    expect([...p.activeHours]).toEqual([...p.activeHours].sort((a, b) => a - b));
    expect(p.activeHours.every((h) => h >= 0 && h <= 23)).toBe(true);
  });
});

describe('deriveBehaviorProfile — recency & velocity', () => {
  it('reports the most recent payment time', () => {
    const p = deriveBehaviorProfile([
      ev({ at: NOW - 5 * DAY }),
      ev({ at: NOW - 2 * HOUR }),
      ev({ at: NOW - 10 * DAY }),
    ], NOW);
    expect(p.lastPaymentAt).toBe(NOW - 2 * HOUR);
  });

  it('counts payments and totals within the last 24h', () => {
    const p = deriveBehaviorProfile([
      ev({ at: NOW - 2 * HOUR, amountMicroFtc: 1_000_000n }),
      ev({ at: NOW - 10 * HOUR, amountMicroFtc: 2_000_000n }),
      ev({ at: NOW - 2 * DAY, amountMicroFtc: 9_000_000n }), // outside 24h
    ], NOW);
    expect(p.count24h).toBe(2);
    expect(p.total24hMicroFtc).toBe(3_000_000n);
  });

  it('totals payments within the last 30 days', () => {
    const p = deriveBehaviorProfile([
      ev({ at: NOW - 2 * DAY, amountMicroFtc: 1_000_000n }),
      ev({ at: NOW - 20 * DAY, amountMicroFtc: 2_000_000n }),
      ev({ at: NOW - 40 * DAY, amountMicroFtc: 8_000_000n }), // outside 30d
    ], NOW);
    expect(p.total30dMicroFtc).toBe(3_000_000n);
  });

  it('ignores events dated in the future relative to now', () => {
    const p = deriveBehaviorProfile([
      ev({ at: NOW + HOUR, amountMicroFtc: 5_000_000n }),
    ], NOW);
    expect(p.count24h).toBe(0);
    expect(p.total24hMicroFtc).toBe(0n);
    expect(p.total30dMicroFtc).toBe(0n);
  });
});
