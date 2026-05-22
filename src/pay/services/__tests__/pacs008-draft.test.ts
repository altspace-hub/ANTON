/**
 * pacs008-draft.test.ts — coverage for ISO 20022 PACS.008 draft
 * assembly from a payer identity + a decoded payment.
 */
import { describe, expect, it } from 'vitest';
import { assembleDraft, creditorToParty, payerToParty } from '../pacs008-draft';
import type { PayerIdentity } from '../payment-identity';
import type { DecodedPayment, PaymentPurpose } from '../types';

function decoded(over: Partial<DecodedPayment> = {}): DecodedPayment {
  return {
    toAddress: 'fc_merchant_recv',
    amountMicroFtc: 5_000_000n,
    currency: 'FTC',
    ref: 'v1: M:21A58256 O:A1B2C3D4E5F6 P:RETAIL',
    merchantId: '21A58256',
    orderId: 'A1B2C3D4E5F6',
    purpose: 'RETAIL',
    itemCount: null,
    vatMicroFtc: null,
    discountMicroFtc: null,
    expUnixSeconds: 0,
    creditor: null,
    orderEnvelope: null,
    qrUri: 'futurechain:pay?to=fc_merchant_recv',
    ...over,
  };
}

const ANNA: PayerIdentity = {
  name: 'Anna Andersson',
  country: 'se',
  city: 'Göteborg',
  street: 'Storgatan 1',
  postcode: '41110',
};

describe('payerToParty', () => {
  it('minimal tier: name + country only (GDPR data-minimisation, sub-threshold P2P)', () => {
    expect(payerToParty(ANNA, 'fc_anna_wallet')).toEqual({
      address: 'fc_anna_wallet',
      name: 'Anna Andersson',
      country: 'SE',
    });
  });

  it('full tier: includes the postal address (Travel-Rule >= EUR 1000)', () => {
    expect(payerToParty(ANNA, 'fc_anna_wallet', 'full')).toEqual({
      address: 'fc_anna_wallet',
      name: 'Anna Andersson',
      country: 'SE',
      city: 'Göteborg',
      street: 'Storgatan 1',
      postcode: '41110',
    });
  });

  it('falls back to the wallet address for the name when no identity is set', () => {
    const p = payerToParty(null, 'fc_anna_wallet');
    expect(p.name).toBe('fc_anna_wallet');
    expect(p.country).toBe('SE');
    expect(p.city).toBeUndefined();
  });
});

describe('creditorToParty', () => {
  it('uses the QR creditor block when present', () => {
    const p = creditorToParty(decoded({
      creditor: { name: 'Karl Café AB', country: 'se', city: 'Stockholm' },
    }));
    expect(p).toEqual({
      address: 'fc_merchant_recv',
      name: 'Karl Café AB',
      country: 'SE',
      city: 'Stockholm',
      street: undefined,
      postcode: undefined,
    });
  });

  it('falls back to the merchant id for the name when the QR has no creditor', () => {
    const p = creditorToParty(decoded());
    expect(p.name).toBe('21A58256');
    expect(p.country).toBe('SE');
  });
});

describe('assembleDraft', () => {
  it('assembles a complete PACS.008 draft', () => {
    const draft = assembleDraft(ANNA, 'fc_anna_wallet', decoded({
      creditor: { name: 'Karl Café AB', country: 'SE' },
    }));
    expect(draft.debtor.name).toBe('Anna Andersson');
    expect(draft.creditor.name).toBe('Karl Café AB');
    expect(draft.amountMicroFtc).toBe(5_000_000n);
    expect(draft.currency).toBe('FTC');
    expect(draft.purpose).toBe('GDDS');
    expect(draft.reference).toBe('v1: M:21A58256 O:A1B2C3D4E5F6 P:RETAIL');
  });

  it('maps every ADR-004 purpose to an ISO 20022 purpose code', () => {
    const cases: Array<[PaymentPurpose, string]> = [
      ['RETAIL', 'GDDS'],
      ['RESTAURANT', 'SCVE'],
      ['SERVICE', 'SCVE'],
      ['EVENT', 'OTHR'],
      ['REFUND', 'REFUND'],
    ];
    for (const [purpose, iso] of cases) {
      expect(assembleDraft(ANNA, 'fc_w', decoded({ purpose })).purpose).toBe(iso);
    }
  });
});
