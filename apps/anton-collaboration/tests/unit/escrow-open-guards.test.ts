/**
 * escrow-open-guards.test.ts — openEscrow is LLM-callable and ungated, so every
 * value it fixes is attacker-chosen unless checked HERE.
 *
 * escrow-core claims "a release can only ever pay the pre-agreed seller", and
 * the recipients genuinely are immutable after open. But nothing pre-agreed
 * them: escrowAddress / releaseTo / refundTo / arbiterPubkey all arrive verbatim
 * from the caller. Immutable-to-garbage is still garbage — so the checks that
 * matter are the ones at open time.
 *
 * Three ways the money moved without any of them:
 *   - name the SELLER as arbiter → the seller decides their own dispute;
 *   - set escrowAddress == releaseTo → the FUND leg alone pays the seller, and
 *     neither release nor a delivery confirmation is ever needed;
 *   - set autoReleaseMs: 1 → releaseAllowed() lets a SELLER-SIGNED 'shipped'
 *     record alone trigger payout, which escrow-core explicitly promises can
 *     never happen ("Never on seller self-attestation alone").
 * Plus role inversion: a seller who proposes with sellerRole:'acceptor' makes
 * buyerPubkeyOf() resolve to their own key on the victim's instance.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { EscrowEngine, MIN_AUTO_RELEASE_MS } from '../../src/main/escrow-engine.js';
import { EscrowStore } from '../../src/main/escrow-store.js';
import { FulfilmentStore } from '../../src/main/fulfilment-store.js';
import { AgreementStore } from '../../src/main/agreement-store.js';
import { InMemoryStorageBackend } from '../../src/main/storage.js';

const ID = 'ag_1';
const PHASH = 'a'.repeat(64);
const BUYER = 'bb'.repeat(32);
const SELLER = 'cc'.repeat(32);
const ARBITER = 'dd'.repeat(32);

/** Identity stub — `me` decides which party this instance is. */
function identity(me: string) {
  return { pubkey: async () => me, signString: async () => 'sig' } as never;
}

let agreements: AgreementStore;
let fulStore: FulfilmentStore;

async function engineAs(me: string): Promise<EscrowEngine> {
  return new EscrowEngine(agreements, identity(me), new EscrowStore(new InMemoryStorageBackend()), fulStore);
}

const openInput = (over: Record<string, unknown> = {}) => ({
  escrowAddress: 'fc_E', releaseTo: 'fc_seller', refundTo: 'fc_buyer',
  arbiterPubkey: ARBITER, ...over,
} as never);

beforeEach(async () => {
  agreements = new AgreementStore(new InMemoryStorageBackend());
  fulStore = new FulfilmentStore(new InMemoryStorageBackend());
  await agreements.put({
    id: ID, status: 'agreed', amountMicroFtc: '1000000',
    proposalHash: PHASH, proposerPubkey: BUYER, proposerSig: 's', acceptorPubkey: SELLER,
    acceptorSig: 's', sellerRole: 'acceptor', counterpartyHash: 'ANTON-XXXX',
    decision: 'd', terms: 't', createdAt: 1, updatedAt: 1,
  } as never);
});

describe('openEscrow: who may open', () => {
  it('the buyer may open', async () => {
    const e = await engineAs(BUYER);
    await expect(e.openEscrow(ID, openInput())).resolves.toBeDefined();
  });

  it('the named arbiter may open (each instance syncs the open)', async () => {
    const e = await engineAs(ARBITER);
    await expect(e.openEscrow(ID, openInput())).resolves.toBeDefined();
  });

  it('a third party may NOT open — this is what stops role inversion', async () => {
    // Under a seller-authored sellerRole the victim is neither buyer nor
    // arbiter, so their own instance refuses BEFORE any address is fixed.
    const e = await engineAs('ee'.repeat(32));
    await expect(e.openEscrow(ID, openInput())).rejects.toThrow(/only the buyer or the named arbiter/i);
  });
});

describe('openEscrow: the arbiter must be a third party', () => {
  it('refuses the SELLER as arbiter — they would decide their own dispute', async () => {
    const e = await engineAs(BUYER);
    await expect(e.openEscrow(ID, openInput({ arbiterPubkey: SELLER })))
      .rejects.toThrow(/third party/i);
  });

  it('refuses the BUYER as arbiter', async () => {
    const e = await engineAs(BUYER);
    await expect(e.openEscrow(ID, openInput({ arbiterPubkey: BUYER })))
      .rejects.toThrow(/third party/i);
  });
});

describe('openEscrow: address sanity', () => {
  it('refuses escrowAddress === releaseTo — the fund leg would pay the seller outright', async () => {
    const e = await engineAs(BUYER);
    await expect(e.openEscrow(ID, openInput({ escrowAddress: 'fc_seller', releaseTo: 'fc_seller' })))
      .rejects.toThrow(/direct payment, not escrow/i);
  });
});

describe('openEscrow: the auto-release window has a floor', () => {
  it('refuses a 1ms auto-release — that is seller self-release', async () => {
    const e = await engineAs(BUYER);
    await expect(e.openEscrow(ID, openInput({ autoReleaseMs: 1 })))
      .rejects.toThrow(/at least/i);
  });

  it('refuses anything under the 24h floor', async () => {
    const e = await engineAs(BUYER);
    await expect(e.openEscrow(ID, openInput({ autoReleaseMs: MIN_AUTO_RELEASE_MS - 1 })))
      .rejects.toThrow(/at least/i);
  });

  it('accepts the floor and above', async () => {
    const e = await engineAs(BUYER);
    await expect(e.openEscrow(ID, openInput({ autoReleaseMs: MIN_AUTO_RELEASE_MS })))
      .resolves.toBeDefined();
  });

  it('leaves auto-release OFF when unspecified', async () => {
    const e = await engineAs(BUYER);
    const r = await e.openEscrow(ID, openInput());
    expect((r as { autoReleaseMs?: number }).autoReleaseMs).toBeUndefined();
  });
});

describe('confirmDelivery requires a shipment first', () => {
  it('refuses to sign a delivery for an order that was never shipped', async () => {
    const { FulfilmentEngine } = await import('../../src/main/fulfilment-engine.js');
    const f = new FulfilmentEngine(agreements, identity(BUYER), fulStore);
    await expect(f.confirmDelivery(ID)).rejects.toThrow(/before a shipment is recorded/i);
  });

  it('signs once a shipment exists', async () => {
    const { FulfilmentEngine } = await import('../../src/main/fulfilment-engine.js');
    await fulStore.put({ agreementId: ID, proposalHash: PHASH, status: 'shipped' } as never);
    const f = new FulfilmentEngine(agreements, identity(BUYER), fulStore);
    await expect(f.confirmDelivery(ID)).resolves.toBeDefined();
  });
});
