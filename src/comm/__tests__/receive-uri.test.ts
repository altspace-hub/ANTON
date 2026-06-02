/**
 * receive-uri.test.ts — the receive-screen URI builders (#79 Phase 5).
 */
import { describe, expect, it } from 'vitest';
import { buildCompactReceiveUri, buildRichReceiveUri } from '../services/qr-transfer/receive-uri';
import type { PayerIdentity } from '../services/payment-identity';

const ADDR = 'fc_Recipient00000000000000000000000';
const idWith = (name: string): PayerIdentity =>
  ({ name, country: 'SE', city: 'Stockholm', street: 'Drottninggatan 1', postcode: '111 51' });

describe('buildCompactReceiveUri', () => {
  it('address-only when no amount', () => {
    expect(buildCompactReceiveUri(ADDR, 0n)).toBe(`futurechain:pay?to=${ADDR}`);
  });
  it('includes amount when set', () => {
    expect(buildCompactReceiveUri(ADDR, 200000n)).toBe(`futurechain:pay?to=${ADDR}&amount=200000`);
  });
});

describe('buildRichReceiveUri', () => {
  it('null without an amount (nothing rich to carry)', () => {
    expect(buildRichReceiveUri({ address: ADDR, amountMicroFtc: 0n, identity: idWith('Anna') })).toBeNull();
  });
  it('null without a creditor name', () => {
    expect(buildRichReceiveUri({ address: ADDR, amountMicroFtc: 200000n, identity: null })).toBeNull();
    expect(buildRichReceiveUri({ address: ADDR, amountMicroFtc: 200000n, identity: idWith('   ') })).toBeNull();
  });
  it('carries the creditor party + an order envelope when amount + name present', () => {
    const uri = buildRichReceiveUri({ address: ADDR, amountMicroFtc: 200000n, identity: idWith('Anna'), label: 'Coffee' });
    expect(uri).not.toBeNull();
    expect(uri!).toContain('futurechain:pay?');
    const params = new URLSearchParams(uri!.split('?')[1]);
    expect(params.get('to')).toBe(ADDR);
    expect(params.get('amount')).toBe('200000');
    expect(params.get('cn')).toBe('Anna');
    expect(params.get('cc')).toBe('SE');
    expect(params.get('v')).toBe('1');
    expect(params.get('order')).toBeTruthy();
    expect(params.get('ref')).toBeNull(); // pay-to-pay receive has no merchant ref
  });
});
