/**
 * received.test.ts — debtor (customer) address capture from inbound
 * PACS.008.
 *
 * The load-bearing contract: the key the Business inbound poller reads
 * must be byte-identical to the one src/pay writes. Rather than hard-code
 * a fixture (which could drift from the builder), we build a real
 * PACS.008 with the SDK's `buildPacs008` — the same call src/pay makes —
 * and assert `extractDebtorAddress` lifts the debtor's fc_ address back
 * out of it.
 */
import { describe, it, expect } from 'vitest';
import { buildPacs008 } from '@futurechain/sdk/pacs008';
import { extractDebtorAddress } from '../received';

const DEBTOR = 'fc_CustomerWalletAddressAbCdEf1234567890';
const CREDITOR = 'fc_MerchantReceiveAddressZyXwVu0987654321';

function buildEnvelope() {
  return buildPacs008({
    debtor: { name: 'Anna Andersson', accountId: DEBTOR, countryOfResidence: 'SE' },
    creditor: { name: 'Karl Café AB', accountId: CREDITOR, countryOfResidence: 'SE' },
    amountFtc: 5,
  });
}

describe('extractDebtorAddress', () => {
  it('lifts the debtor fc_ address from a real SDK-built PACS.008', () => {
    // This is the exact `document.FIToFICstmrCdtTrf.CdtTrfTxInf[0].DbtrAcct
    // .Id.Othr.Id` shape src/pay emits via buildPacs008.
    expect(extractDebtorAddress(buildEnvelope())).toBe(DEBTOR);
  });

  it('does NOT pick up the creditor (merchant) address by mistake', () => {
    expect(extractDebtorAddress(buildEnvelope())).not.toBe(CREDITOR);
  });

  it('reads the bare-CdtTrfTxInf fallback shape (block hoisted to top level)', () => {
    const full = buildEnvelope() as {
      document: { FIToFICstmrCdtTrf: { CdtTrfTxInf: unknown[] } };
    };
    const hoisted = { CdtTrfTxInf: full.document.FIToFICstmrCdtTrf.CdtTrfTxInf };
    expect(extractDebtorAddress(hoisted)).toBe(DEBTOR);
  });

  it('returns undefined when no debtor account is present', () => {
    expect(extractDebtorAddress({})).toBeUndefined();
    expect(extractDebtorAddress(null)).toBeUndefined();
    expect(extractDebtorAddress({ document: {} })).toBeUndefined();
  });

  it('returns undefined for a non-string debtor id', () => {
    const bad = {
      document: {
        FIToFICstmrCdtTrf: {
          CdtTrfTxInf: [{ DbtrAcct: { Id: { Othr: { Id: 12345 } } } }],
        },
      },
    };
    expect(extractDebtorAddress(bad)).toBeUndefined();
  });
});
