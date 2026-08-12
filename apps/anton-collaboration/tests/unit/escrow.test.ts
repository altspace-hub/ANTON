/**
 * escrow.test.ts — the P8 custodial-escrow state machine. The BUYER and the
 * ARBITER are SEPARATE instances with their OWN escrow stores (as in reality —
 * synced by relaying open + fund), sharing the agreement + fulfilment stores.
 * Proves: conservation, the happy release path drives the agreement to settled,
 * the one-shot lock (never release AND refund), the deterministic release/refund
 * policy, the signed dispute round-trip + tamper rejection, arbiter-only release,
 * buyer-only dispute, idempotency, and funding expiry.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { EscrowEngine, DEFAULT_FUND_DEADLINE_MS } from '../../src/main/escrow-engine.js';
import { EscrowStore } from '../../src/main/escrow-store.js';
import { FulfilmentStore } from '../../src/main/fulfilment-store.js';
import { FulfilmentEngine } from '../../src/main/fulfilment-engine.js';
import { AgreementStore } from '../../src/main/agreement-store.js';
import { AgreementIdentity } from '../../src/main/agreement-identity.js';
import { InMemoryStorageBackend } from '../../src/main/storage.js';
import type { Agreement } from '../../src/main/agreement-core.js';

const ID = 'agr_1';
const PHASH = 'a'.repeat(64);
const AMOUNT = '1800000';

interface Ctx {
  now: () => number;
  advance: (ms: number) => void;
  buyer: EscrowEngine;
  arbiter: EscrowEngine;
  fulStore: FulfilmentStore;
  buyerFulfilment: FulfilmentEngine;
  agreements: AgreementStore;
  open: { escrowAddress: string; releaseTo: string; refundTo: string; arbiterPubkey: string };
  buyerPub: string;
}

async function setup(): Promise<Ctx> {
  let t = 1_000_000;
  const now = (): number => t;
  const advance = (ms: number): void => { t += ms; };
  const agreements = new AgreementStore(new InMemoryStorageBackend());
  const fulStore = new FulfilmentStore(new InMemoryStorageBackend());
  const buyerId = new AgreementIdentity(new InMemoryStorageBackend());
  const sellerId = new AgreementIdentity(new InMemoryStorageBackend());
  const arbiterId = new AgreementIdentity(new InMemoryStorageBackend());
  const buyerPub = await buyerId.pubkey();
  const sellerPub = await sellerId.pubkey();
  const arbiterPub = await arbiterId.pubkey();

  const agreement: Agreement = {
    id: ID, schemaV: 1, role: 'proposer', trustTier: 'signed',
    counterpartyHash: 'seller-hash', counterpartyAddress: 'fc_seller',
    decision: 'Jordans', terms: '', amountMicroFtc: AMOUNT, status: 'agreed', seq: 0,
    proposalHash: PHASH, proposerPubkey: buyerPub, proposerSig: 's', acceptorPubkey: sellerPub,
    sellerRole: 'acceptor', createdAt: 1, nonce: '',
  };
  await agreements.put(agreement);

  // SEPARATE escrow stores per instance.
  const buyer = new EscrowEngine(agreements, buyerId, new EscrowStore(new InMemoryStorageBackend()), fulStore, { now });
  const arbiter = new EscrowEngine(agreements, arbiterId, new EscrowStore(new InMemoryStorageBackend()), fulStore, { now });
  const buyerFulfilment = new FulfilmentEngine(agreements, buyerId, fulStore, { now });
  return {
    now, advance, buyer, arbiter, fulStore, buyerFulfilment, agreements, buyerPub,
    open: { escrowAddress: 'fc_E', releaseTo: 'fc_seller', refundTo: 'fc_buyer', arbiterPubkey: arbiterPub },
  };
}

/** Open + fund on a specific engine's own store (mirrors each instance syncing). */
async function openAndFund(ctx: Ctx, engine: EscrowEngine): Promise<void> {
  await engine.openEscrow(ID, ctx.open);
  await engine.markFunded(ID, 'tx_fund');
}

/** The buyer SIGNS a delivery confirmation (what authorizes a release post-C2).
 *
 *  A shipment is recorded first because confirmDelivery now REFUSES to run
 *  without one: a signed "I received the goods" for an order that was never sent
 *  is precisely what escrow's releaseAllowed() treats as the buyer's
 *  authorisation to pay out. These tests previously modelled open → fund →
 *  deliver with no shipment at all, which is a sequence that should not be
 *  reachable. Seeding the record directly keeps this a fixture, not a second
 *  code path. */
async function seedDelivered(ctx: Ctx): Promise<void> {
  const prev = await ctx.fulStore.get(ID);
  await ctx.fulStore.put({
    ...(prev ?? { agreementId: ID, proposalHash: PHASH }),
    agreementId: ID, proposalHash: PHASH, status: 'shipped',
  });
  await ctx.buyerFulfilment.confirmDelivery(ID);
}

describe('escrow state machine', () => {
  let ctx: Ctx;
  beforeEach(async () => { ctx = await setup(); });

  it('CONSERVATION: open + the fund instruction use the agreement amount + escrow address', async () => {
    const rec = await ctx.buyer.openEscrow(ID, ctx.open);
    expect(rec.amountMicroFtc).toBe(AMOUNT);
    const fund = await ctx.buyer.getFundInstruction(ID);
    expect(fund.amountMicroFtc).toBe(AMOUNT);
    expect(fund.to).toBe('fc_E');
  });

  it('HAPPY PATH: open → fund → deliver → arbiter release → agreement settled', async () => {
    await openAndFund(ctx, ctx.arbiter);
    await seedDelivered(ctx);
    const rel = await ctx.arbiter.buildRelease(ID);
    expect(rel.to).toBe('fc_seller');
    expect(rel.amountMicroFtc).toBe(AMOUNT);
    const released = await ctx.arbiter.markReleased(ID, 'tx_release');
    expect(released!.status).toBe('released');
    const a = await ctx.agreements.get(ID);
    expect(a!.status).toBe('settled');
    expect(a!.linkedTxHash).toBe('tx_release');
  });

  it('ONE-SHOT: after a release is pending, a refund is impossible (no double-spend)', async () => {
    await openAndFund(ctx, ctx.arbiter);
    await seedDelivered(ctx);
    await ctx.arbiter.buildRelease(ID); // → release_pending
    await expect(ctx.arbiter.buildRefund(ID)).rejects.toThrow(/release_pending/);
  });

  it('RELEASE POLICY: cannot release without a delivery proof', async () => {
    await openAndFund(ctx, ctx.arbiter);
    await expect(ctx.arbiter.buildRelease(ID)).rejects.toThrow(/no delivery proof/);
  });

  it('C2: an UNSIGNED / forged delivered record does NOT authorize a release', async () => {
    await openAndFund(ctx, ctx.arbiter);
    // a forged 'delivered' row dropped straight into the store (no buyer signature)
    await ctx.fulStore.put({ agreementId: ID, proposalHash: PHASH, status: 'delivered', confirmedAt: ctx.now() });
    await expect(ctx.arbiter.buildRelease(ID)).rejects.toThrow(/no delivery proof/);
  });

  it('C1: two concurrent release builds — exactly ONE wins (atomic CAS lock)', async () => {
    await openAndFund(ctx, ctx.arbiter);
    await seedDelivered(ctx);
    const results = await Promise.allSettled([ctx.arbiter.buildRelease(ID), ctx.arbiter.buildRelease(ID)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1); // the 2nd hit release_pending
    expect((await ctx.arbiter.get(ID))!.status).toBe('release_pending');
  });

  it('REFUND POLICY: seller never shipped + funding deadline elapsed → refund to buyer', async () => {
    await openAndFund(ctx, ctx.arbiter);
    ctx.advance(DEFAULT_FUND_DEADLINE_MS + 1);
    const ref = await ctx.arbiter.buildRefund(ID);
    expect(ref.to).toBe('fc_buyer');
    expect((await ctx.arbiter.markRefunded(ID, 'tx_refund'))!.status).toBe('refunded');
    expect((await ctx.agreements.get(ID))!.status).toBe('agreed'); // a refund does NOT settle
  });

  it('DISPUTE: buyer signs; the arbiter verifies; tampered / forged are rejected', async () => {
    await openAndFund(ctx, ctx.buyer);
    await openAndFund(ctx, ctx.arbiter);
    const { payload } = await ctx.buyer.raiseDispute(ID, 'item not as described');
    expect(payload.disputerPubkey).toBe(ctx.buyerPub);
    expect((await ctx.buyer.get(ID))!.status).toBe('disputed');

    // The arbiter's record is still 'funded' → ingests + verifies the signature.
    expect((await ctx.arbiter.applyInboundDispute({ ...payload, reason: 'changed' }))).toBeNull(); // tampered → sig fail
    expect((await ctx.arbiter.applyInboundDispute({ ...payload, disputerPubkey: 'bb'.repeat(32) }))).toBeNull(); // wrong key
    expect((await ctx.arbiter.applyInboundDispute(payload))!.status).toBe('disputed'); // valid
  });

  it('DISPUTE then arbiter overrides to refund the buyer', async () => {
    await openAndFund(ctx, ctx.arbiter);
    // simulate the buyer's signed dispute arriving (set the arbiter record to disputed)
    await openAndFund(ctx, ctx.buyer);
    const { payload } = await ctx.buyer.raiseDispute(ID, 'broken on arrival');
    await ctx.arbiter.applyInboundDispute(payload);
    const ref = await ctx.arbiter.buildRefund(ID, { arbiterOverride: 'refund' });
    expect(ref.to).toBe('fc_buyer');
    expect((await ctx.arbiter.markRefunded(ID, 'tx_refund'))!.status).toBe('refunded');
  });

  it('ARBITER-ONLY: the buyer cannot build a release', async () => {
    await openAndFund(ctx, ctx.buyer);
    await seedDelivered(ctx);
    await expect(ctx.buyer.buildRelease(ID)).rejects.toThrow(/only the arbiter/);
  });

  it('only the BUYER may raise a dispute', async () => {
    await openAndFund(ctx, ctx.arbiter);
    await expect(ctx.arbiter.raiseDispute(ID, 'x')).rejects.toThrow(/only the buyer/);
  });

  it('IDEMPOTENT: double markFunded / markReleased keep the first tx', async () => {
    await ctx.arbiter.openEscrow(ID, ctx.open);
    await ctx.arbiter.markFunded(ID, 'tx_fund');
    await ctx.arbiter.markFunded(ID, 'tx_fund_2'); // no-op
    expect((await ctx.arbiter.get(ID))!.fundTxHash).toBe('tx_fund');
    await seedDelivered(ctx);
    await ctx.arbiter.buildRelease(ID);
    await ctx.arbiter.markReleased(ID, 'tx_rel');
    await ctx.arbiter.markReleased(ID, 'tx_rel_2'); // no-op
    expect((await ctx.arbiter.get(ID))!.releaseTxHash).toBe('tx_rel');
  });

  it('EXPIRES: an unfunded escrow past the funding deadline becomes terminal', async () => {
    await ctx.buyer.openEscrow(ID, ctx.open);
    ctx.advance(DEFAULT_FUND_DEADLINE_MS + 1);
    expect((await ctx.buyer.get(ID))!.status).toBe('expired');
    await expect(ctx.buyer.getFundInstruction(ID)).rejects.toThrow(/expected requested/);
  });
});
