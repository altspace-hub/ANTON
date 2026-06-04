import { describe, it, expect } from 'vitest';
import { formatIsoEnvelope } from '../iso-envelope';
import type { Receipt, MerchantConfig } from '../types';

const merchant = {
  legalName: 'Test Merchant AB', orgNr: '556677-8899', country: 'SE',
  street: 'Kungsgatan 9', postcode: '11143', city: 'Stockholm',
  safelloReceiveAddress: 'fc_merchantfallback00000000000000000',
} as unknown as MerchantConfig;

function receipt(over: Partial<Receipt> = {}): Receipt {
  return {
    amountMicroFtc: 200000n, amountSek: 199.5, ftcPerSek: 0.001, purpose: 'COMMERCE',
    ref: 'E2E-REF-001', uetr: 'uetr-abc-123',
    receivingAddress: 'fc_merchantwallet0000000000000000000',
    customerAddress: 'fc_customer000000000000000000000000A',
    ...over,
  } as unknown as Receipt;
}

describe('formatIsoEnvelope', () => {
  it('assembles a labelled pacs.008 with merchant=creditor + customer=debtor', () => {
    const env = formatIsoEnvelope(receipt(), merchant, 'Acme AB');
    expect(env).toContain('ISO 20022 pacs.008.001');
    expect(env).toContain('Amount: 0.200000 FTC');
    expect(env).toContain('Value: 199.50 SEK');
    expect(env).toContain('Reference (EndToEndId): E2E-REF-001');
    expect(env).toContain('UETR: uetr-abc-123');
    // creditor (merchant) carries the full address
    expect(env).toMatch(/Creditor \(Cdtr · merchant\):[\s\S]*Name: Test Merchant AB[\s\S]*Street: Kungsgatan 9[\s\S]*Account: fc_merchantwallet/);
    // debtor (customer) carries the saved name + account
    expect(env).toMatch(/Debtor \(Dbtr · customer\):[\s\S]*Name: Acme AB[\s\S]*Account: fc_customer000/);
  });

  it('is bigint-safe (formats amountMicroFtc, never JSON.stringify)', () => {
    expect(() => formatIsoEnvelope(receipt({ amountMicroFtc: 1_500_000n }), merchant)).not.toThrow();
    expect(formatIsoEnvelope(receipt({ amountMicroFtc: 1_500_000n }), merchant)).toContain('Amount: 1.500000 FTC');
  });

  it('omits optional lines when absent + falls back the creditor account to the merchant config', () => {
    const env = formatIsoEnvelope(receipt({ ref: '', uetr: null, amountSek: 0, receivingAddress: undefined }), merchant);
    expect(env).not.toContain('Reference (EndToEndId)');
    expect(env).not.toContain('UETR:');
    expect(env).not.toContain('Value:');
    expect(env).toContain('Account: fc_merchantfallback'); // safelloReceiveAddress fallback
  });

  it('renders a debtor with no known name as account-only (never blank)', () => {
    const env = formatIsoEnvelope(receipt({ customerAddress: 'fc_anon00000000000000000000000000000' }), merchant);
    expect(env).toMatch(/Debtor \(Dbtr · customer\):\n  Account: fc_anon/);
    expect(env).not.toContain('Name: undefined');
  });
});
