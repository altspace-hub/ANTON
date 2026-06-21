/**
 * fulfilment.test.ts — the post-settlement ship → deliver leg (P7). Drives a
 * full agreement to 'agreed' between two parties (reusing the agreement engine),
 * then runs the SIGNED fulfilment round-trip and its security guards: the
 * shipment/delivery must be signed by the agreement's counterparty key, relayed
 * by the counterparty, bound to the proposalHash, and only on an agreed/settled
 * agreement.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { AgreementEngine } from '../../src/main/agreement-engine.js';
import { AgreementStore } from '../../src/main/agreement-store.js';
import { AgreementIdentity } from '../../src/main/agreement-identity.js';
import { FulfilmentEngine } from '../../src/main/fulfilment-engine.js';
import { FulfilmentStore } from '../../src/main/fulfilment-store.js';
import { InMemoryStorageBackend } from '../../src/main/storage.js';
import {
  computeShipmentDigest, shipmentDigestMap,
} from '../../src/main/fulfilment-core.js';

const BUYER_HASH = 'buyer-hash';
const SELLER_HASH = 'seller-hash';
const SELLER_ADDR = 'fc_sellerADDR';

interface Party {
  ag: AgreementEngine;
  ful: FulfilmentEngine;
}

function makeParty(tag: string): Party {
  const storage = new InMemoryStorageBackend();
  const store = new AgreementStore(storage);
  const identity = new AgreementIdentity(new InMemoryStorageBackend());
  let n = 0; let t = 1_700_000_000_000;
  const now = (): number => (t += 1000);
  const ag = new AgreementEngine(store, identity, { now, genId: () => `agr_${tag}_${++n}`, genNonce: () => `non_${tag}_${++n}` });
  const ful = new FulfilmentEngine(store, identity, new FulfilmentStore(storage), { now });
  return { ag, ful };
}

/** Drive an agreement to 'agreed' on both sides; returns the shared agreementId. */
async function toAgreed(buyer: Party, seller: Party): Promise<string> {
  const { agreement: offer, payload } = await buyer.ag.propose({
    decision: 'Air Jordans EU43', terms: 'ship to SE', amountMicroFtc: '1800000',
    counterpartyAddress: SELLER_ADDR, counterpartyHash: SELLER_HASH,
  });
  await seller.ag.applyInboundPropose(payload, BUYER_HASH);
  const { payload: acceptP } = await seller.ag.respond(offer.id, 'accept');
  await buyer.ag.applyInboundRespond(acceptP, SELLER_HASH);
  const ack = await buyer.ag.buildAck(offer.id);
  await seller.ag.applyInboundAck(ack, BUYER_HASH);
  return offer.id;
}

describe('fulfilment — ship → deliver round-trip', () => {
  let buyer: Party; let seller: Party;
  beforeEach(() => { buyer = makeParty('B'); seller = makeParty('S'); });

  it('seller ships (signed) → buyer ingests → buyer confirms → seller ingests: delivered both sides', async () => {
    const id = await toAgreed(buyer, seller);

    // Seller ships.
    const { record: sellerShip, payload: ship } = await seller.ful.markShipped(id, { carrier: 'PostNord', tracking: 'PN123', eta: '2026-06-25' });
    expect(sellerShip.status).toBe('shipped');
    expect(sellerShip.carrier).toBe('PostNord');

    // Buyer ingests the signed shipment.
    const buyerShip = await buyer.ful.applyInboundShipment(ship, SELLER_HASH);
    expect(buyerShip).toBeTruthy();
    expect(buyerShip!.status).toBe('shipped');
    expect(buyerShip!.tracking).toBe('PN123');
    expect((await buyer.ful.status(id))!.status).toBe('shipped');

    // Buyer confirms delivery.
    const { record: buyerDeliv, payload: deliv } = await buyer.ful.confirmDelivery(id);
    expect(buyerDeliv.status).toBe('delivered');

    // Seller ingests the signed delivery → both 'delivered'.
    const sellerDeliv = await seller.ful.applyInboundDelivery(deliv, BUYER_HASH);
    expect(sellerDeliv!.status).toBe('delivered');
    // the seller record kept its shipment fields + gained delivery
    expect(sellerDeliv!.carrier).toBe('PostNord');
    expect(sellerDeliv!.confirmerPubkey).toBe(deliv.confirmerPubkey);
  });

  it('PRECONDITION: cannot ship before the agreement is agreed/settled', async () => {
    // proposed-only agreement on the seller side (ingested but not accepted)
    const { agreement: offer, payload } = await buyer.ag.propose({
      decision: 'd', terms: 't', amountMicroFtc: '100', counterpartyAddress: SELLER_ADDR, counterpartyHash: SELLER_HASH,
    });
    await seller.ag.applyInboundPropose(payload, BUYER_HASH); // status 'proposed'
    await expect(seller.ful.markShipped(offer.id, { carrier: 'X' })).rejects.toThrow(/agreed\/settled/);
  });

  it('rejects a tampered shipment (carrier changed under the signature)', async () => {
    const id = await toAgreed(buyer, seller);
    const { payload: ship } = await seller.ful.markShipped(id, { carrier: 'PostNord', tracking: 'PN123' });
    expect(await buyer.ful.applyInboundShipment({ ...ship, carrier: 'DHL' }, SELLER_HASH)).toBeNull();
  });

  it('rejects a shipment from the wrong sender hash', async () => {
    const id = await toAgreed(buyer, seller);
    const { payload: ship } = await seller.ful.markShipped(id, { carrier: 'PostNord' });
    expect(await buyer.ful.applyInboundShipment(ship, 'someone-else')).toBeNull();
  });

  it('rejects a shipment NOT signed by the counterparty key (self-signed forgery)', async () => {
    const id = await toAgreed(buyer, seller);
    // The BUYER forges a shipment with ITS OWN identity, then tries to ingest it
    // on its own side as if it came from the seller. shipperPubkey = buyer's key
    // = proposerPubkey = my key, so it is NOT the counterparty (acceptor) key.
    const { payload: forged } = await buyer.ful.markShipped(id, { carrier: 'PostNord' });
    expect(await buyer.ful.applyInboundShipment(forged, SELLER_HASH)).toBeNull();
  });

  it('a replayed shipment cannot downgrade a completed delivery back to shipped', async () => {
    const id = await toAgreed(buyer, seller);
    const { payload: ship } = await seller.ful.markShipped(id, { carrier: 'PostNord' });
    await buyer.ful.applyInboundShipment(ship, SELLER_HASH);
    await buyer.ful.confirmDelivery(id); // buyer now 'delivered'
    // The seller replays the old shipment to the buyer — must NOT revert it.
    const after = await buyer.ful.applyInboundShipment(ship, SELLER_HASH);
    expect(after!.status).toBe('delivered');
    expect((await buyer.ful.status(id))!.status).toBe('delivered');
  });

  it('a stale (older shippedAt) shipment cannot overwrite a newer one (out-of-order relay)', async () => {
    const id = await toAgreed(buyer, seller);
    const { payload: ship1 } = await seller.ful.markShipped(id, { carrier: 'PostNord', tracking: 'OLD' });
    // seller re-ships later with corrected tracking (newer shippedAt via the clock)
    const { payload: ship2 } = await seller.ful.markShipped(id, { carrier: 'PostNord', tracking: 'NEW' });
    await buyer.ful.applyInboundShipment(ship2, SELLER_HASH); // buyer has NEW
    // the relay re-delivers the OLDER ship1 afterwards — must be ignored
    const after = await buyer.ful.applyInboundShipment(ship1, SELLER_HASH);
    expect(after!.tracking).toBe('NEW');
    expect(ship2.shippedAt).toBeGreaterThan(ship1.shippedAt);
  });

  it('getFulfilment reports "awaiting" for an agreed agreement with nothing shipped', async () => {
    const id = await toAgreed(buyer, seller);
    const r = await seller.ful.status(id);
    expect(r!.status).toBe('awaiting');
  });

  it('the shipment digest is order-independent + binds every field', () => {
    const base = { agreementId: 'a1', proposalHash: 'p1', carrier: 'PostNord', tracking: 'T', eta: 'E', shippedAt: 1 };
    const h = computeShipmentDigest(base);
    expect(computeShipmentDigest({ ...base, carrier: 'DHL' })).not.toBe(h);
    expect(computeShipmentDigest({ ...base, tracking: 'T2' })).not.toBe(h);
    expect(computeShipmentDigest({ ...base, shippedAt: 2 })).not.toBe(h);
    // flat map shape is stable
    expect(Object.keys(shipmentDigestMap(base)).sort()).toEqual(
      ['agreementId', 'carrier', 'eta', 'kind', 'proposalHash', 'schemaV', 'shippedAt', 'tracking'],
    );
  });
});
