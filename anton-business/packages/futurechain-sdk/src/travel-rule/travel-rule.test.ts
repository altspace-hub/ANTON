/**
 * travel-rule.test.ts — coverage for the deterministic EU Travel-Rule tier
 * resolver + profile-completeness checks. Net-new coverage added when the module
 * was promoted into the SDK from the (previously untested) per-app copies in
 * ANTON Pay / Comm / Business (2026-07-17).
 */
import { describe, expect, it } from 'vitest';
import {
  TRAVEL_RULE_THRESHOLD_EUR,
  travelRuleTierFor, fullDisclosureReady, minimalDisclosureReady, missingFields,
  type IdentityFieldStatus, type TravelRuleFxRate,
} from './index.js';

const MICRO = 1_000_000n;
/** 1 FTC = 2 EUR → the €1,000 threshold is crossed at 500 FTC. */
const eur = (fiatPerFtc: number): TravelRuleFxRate => ({ fiatPerFtc });

function status(over: Partial<IdentityFieldStatus> = {}): IdentityFieldStatus {
  return {
    hasName: true, hasCountry: true, hasStreet: true, hasCity: true, hasPostcode: true,
    ...over,
  };
}

describe('travelRuleTierFor', () => {
  it('is minimal below the €1,000 threshold', () => {
    // 499 FTC × 2 EUR = 998 EUR < 1000
    expect(travelRuleTierFor(499n * MICRO, eur(2))).toBe('minimal');
  });

  it('is full at exactly the threshold', () => {
    // 500 FTC × 2 EUR = 1000 EUR ≥ 1000
    expect(travelRuleTierFor(500n * MICRO, eur(2))).toBe('full');
  });

  it('is full above the threshold', () => {
    expect(travelRuleTierFor(10_000n * MICRO, eur(2))).toBe('full');
  });

  it('falls back to the conservative tier when no rate is available', () => {
    expect(travelRuleTierFor(1n * MICRO, null)).toBe('no-rate-conservative');
  });

  it('handles sub-FTC micro amounts against the threshold', () => {
    // 0.5 FTC × 2 EUR = 1 EUR → minimal
    expect(travelRuleTierFor(500_000n, eur(2))).toBe('minimal');
  });

  it('threshold constant is EUR 1000', () => {
    expect(TRAVEL_RULE_THRESHOLD_EUR).toBe(1000);
  });
});

describe('fullDisclosureReady', () => {
  it('is true only when every address field is present', () => {
    expect(fullDisclosureReady(status())).toBe(true);
  });
  it('is false when any address field is missing', () => {
    expect(fullDisclosureReady(status({ hasPostcode: false }))).toBe(false);
    expect(fullDisclosureReady(status({ hasStreet: false }))).toBe(false);
    expect(fullDisclosureReady(status({ hasName: false }))).toBe(false);
  });
});

describe('minimalDisclosureReady', () => {
  it('needs only name + country', () => {
    expect(minimalDisclosureReady(status({ hasStreet: false, hasCity: false, hasPostcode: false }))).toBe(true);
  });
  it('is false without a country', () => {
    expect(minimalDisclosureReady(status({ hasCountry: false }))).toBe(false);
  });
});

describe('missingFields', () => {
  it('lists nothing for a complete profile', () => {
    expect(missingFields(status())).toEqual([]);
  });
  it('lists exactly the absent fields, in canonical order', () => {
    expect(missingFields(status({ hasName: false, hasPostcode: false })))
      .toEqual(['name', 'postcode']);
  });
});
