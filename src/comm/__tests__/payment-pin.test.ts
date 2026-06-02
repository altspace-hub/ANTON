/**
 * payment-pin.test.ts — the in-app payment PIN (#79 Phase 3).
 * Runs against the memory-tier secure-store (vitest has no Capacitor/IDB).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { removeSecure } from '../services/secure-store';
import {
  hasPaymentPin, isValidPinShape, setPaymentPin, verifyPaymentPin, removePaymentPin,
} from '../services/payment-pin';

const KEY = 'fc.payment.pin.v1';

beforeEach(async () => { await removeSecure(KEY); });

describe('payment-pin', () => {
  it('isValidPinShape enforces digits + length', () => {
    expect(isValidPinShape('1234')).toBe(true);
    expect(isValidPinShape('123')).toBe(false);        // too short
    expect(isValidPinShape('123456789')).toBe(false);  // too long (>8)
    expect(isValidPinShape('12a4')).toBe(false);       // non-digit
  });

  it('set → verify round-trips; a wrong PIN fails', async () => {
    expect(await hasPaymentPin()).toBe(false);
    await setPaymentPin('4321');
    expect(await hasPaymentPin()).toBe(true);
    expect(await verifyPaymentPin('4321')).toBe(true);
    expect(await verifyPaymentPin('0000')).toBe(false);
  });

  it('rejects a malformed PIN', async () => {
    await expect(setPaymentPin('12')).rejects.toThrow();
  });

  it('remove clears it', async () => {
    await setPaymentPin('5678');
    await removePaymentPin();
    expect(await hasPaymentPin()).toBe(false);
    expect(await verifyPaymentPin('5678')).toBe(false);
  });

  it('re-setting the same PIN still verifies (fresh salt each time)', async () => {
    await setPaymentPin('1234');
    expect(await verifyPaymentPin('1234')).toBe(true);
    await setPaymentPin('1234');
    expect(await verifyPaymentPin('1234')).toBe(true);
  });
});
