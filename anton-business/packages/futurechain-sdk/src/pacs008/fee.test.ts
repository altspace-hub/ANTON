/**
 * fee.test.ts — the network fee policy contract (docs/FEE_POLICY.md).
 * The client AND the node must compute this identically (the fee is signed
 * into the tx), so this is a load-bearing invariant.
 */
import { describe, it, expect } from 'vitest';
import { computeNetworkFee, FEE_CAP_SATOSHI, FEE_MIN_SATOSHI } from './index';

describe('computeNetworkFee — 0.1%, floor 250 (app) / 200 (network), cap 0.1 FTC', () => {
  it('charges 0.1% in the normal range', () => {
    expect(computeNetworkFee(20_000_000)).toBe(20_000);   // 0.2 FTC -> 0.0002 FTC
    expect(computeNetworkFee(250_000)).toBe(250);          // exactly at the floor boundary
    expect(computeNetworkFee(1_000_000)).toBe(1_000);      // 0.01 FTC -> 0.00001 FTC
  });

  it('floors at the app minimum (250) for tiny amounts', () => {
    expect(computeNetworkFee(100_000)).toBe(250);          // 0.1% = 100 -> floored to 250
    expect(computeNetworkFee(1)).toBe(250);
    expect(computeNetworkFee(249_000)).toBe(250);          // 0.1% = 249 -> 250
  });

  it('caps at exactly 0.1 FTC (10,000,000 sat)', () => {
    expect(computeNetworkFee(10_000_000_000)).toBe(FEE_CAP_SATOSHI);   // 100 FTC, 0.1% = 0.1 FTC
    expect(computeNetworkFee(20_000_000_000)).toBe(FEE_CAP_SATOSHI);   // 200 FTC, 0.1% would be 0.2 FTC -> capped
    expect(FEE_CAP_SATOSHI).toBe(10_000_000);
  });

  it('rounds half-up at 500/1000, exact integer math', () => {
    expect(computeNetworkFee(1_500_000)).toBe(1_500);      // exact 0.1%
    expect(computeNetworkFee(1_500_500)).toBe(1_501);      // r=500 -> up
    expect(computeNetworkFee(1_500_499)).toBe(1_500);      // r=499 -> down
    expect(computeNetworkFee(1_500_999)).toBe(1_501);      // r=999 -> up
  });

  it('honours an explicit (network) floor of 200', () => {
    expect(computeNetworkFee(100_000, 200)).toBe(200);
    expect(computeNetworkFee(20_000_000, 200)).toBe(20_000); // floor irrelevant in range
    expect(FEE_MIN_SATOSHI).toBe(250);
  });

  it('returns the floor for non-positive / invalid input', () => {
    expect(computeNetworkFee(0)).toBe(FEE_MIN_SATOSHI);
    expect(computeNetworkFee(-5)).toBe(FEE_MIN_SATOSHI);
    expect(computeNetworkFee(Number.NaN)).toBe(FEE_MIN_SATOSHI);
  });
});
