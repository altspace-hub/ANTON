/**
 * agreement-engine.test.ts — the full signed two-party round-trip between two
 * independent engines (a buyer + a seller, each with its own store + identity).
 * Proves the standalone produces signatures the OTHER side verifies, plus the
 * security guards (tamper / wrong-sender / replay / terminal-flip) are intact.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { AgreementEngine } from '../../src/main/agreement-engine.js';
import { AgreementStore } from '../../src/main/agreement-store.js';
import { AgreementIdentity } from '../../src/main/agreement-identity.js';
import { InMemoryStorageBackend } from '../../src/main/storage.js';

const BUYER_HASH = 'buyer-contact-hash';
const SELLER_HASH = 'seller-contact-hash';
const SELLER_ADDR = 'fc_sellerADDRESS0000';

/** A deterministic engine: monotonic ids/nonces + a fixed-step clock so two
 *  engines never collide on an id and tests can assert exact lifecycle. */
function makeEngine(tag: string): AgreementEngine {
  const store = new AgreementStore(new InMemoryStorageBackend());
  const identity = new AgreementIdentity(new InMemoryStorageBackend());
  let n = 0;
  let t = 1_700_000_000_000;
  return new AgreementEngine(store, identity, {
    now: () => (t += 1000),
    genId: () => `agr_${tag}_${++n}`,
    genNonce: () => `non_${tag}_${++n}`,
  });
}

describe('AgreementEngine — signed round-trip', () => {
  let buyer: AgreementEngine;
  let seller: AgreementEngine;
  beforeEach(() => {
    buyer = makeEngine('B');
    seller = makeEngine('S');
  });

  it('propose → accept → ack: both sides reach "agreed" on the same proposalHash', async () => {
    const { agreement: offer, payload } = await buyer.propose({
      decision: 'Air Jordans EU43 ×1', terms: 'ship to SE, paid on chain',
      amountMicroFtc: '1800000', counterpartyAddress: SELLER_ADDR, counterpartyHash: SELLER_HASH,
    });
    expect(offer.status).toBe('proposed');
    expect(offer.role).toBe('proposer');

    const sellerRow = await seller.applyInboundPropose(payload, BUYER_HASH);
    expect(sellerRow).toBeTruthy();
    expect(sellerRow!.status).toBe('proposed');
    expect(sellerRow!.role).toBe('acceptor');
    expect(sellerRow!.proposalHash).toBe(offer.proposalHash); // verified the same bind key

    const { payload: acceptPayload } = await seller.respond(offer.id, 'accept');
    expect((await seller.get(offer.id))!.status).toBe('accepted');

    const buyerAfter = await buyer.applyInboundRespond(acceptPayload, SELLER_HASH);
    expect(buyerAfter!.status).toBe('agreed');
    expect(buyerAfter!.acceptorPubkey).toBe(acceptPayload.responderPubkey);

    const ack = await buyer.buildAck(offer.id);
    const sellerFinal = await seller.applyInboundAck(ack, BUYER_HASH);
    expect(sellerFinal!.status).toBe('agreed');
  });

  it('propose → decline: proposer reaches "declined"', async () => {
    const { agreement: offer, payload } = await buyer.propose({
      decision: 'd', terms: 't', amountMicroFtc: '100', counterpartyAddress: SELLER_ADDR, counterpartyHash: SELLER_HASH,
    });
    await seller.applyInboundPropose(payload, BUYER_HASH);
    const { payload: declinePayload } = await seller.respond(offer.id, 'decline');
    const after = await buyer.applyInboundRespond(declinePayload, SELLER_HASH);
    expect(after!.status).toBe('declined');
  });

  it('propose → withdraw: acceptor reaches "withdrawn"', async () => {
    const { agreement: offer, payload } = await buyer.propose({
      decision: 'd', terms: 't', amountMicroFtc: '100', counterpartyAddress: SELLER_ADDR, counterpartyHash: SELLER_HASH,
    });
    await seller.applyInboundPropose(payload, BUYER_HASH);
    const { payload: wd } = await buyer.withdraw(offer.id);
    const after = await seller.applyInboundWithdraw(wd, BUYER_HASH);
    expect(after!.status).toBe('withdrawn');
    // the proposer's own row is withdrawn too
    expect((await buyer.get(offer.id))!.status).toBe('withdrawn');
  });

  it('counter → accept converges on the new head (seq 1), both "agreed"', async () => {
    const { agreement: offer, payload } = await buyer.propose({
      decision: 'Jordans EU43', terms: 'price 1.8 FTC', amountMicroFtc: '1800000',
      counterpartyAddress: SELLER_ADDR, counterpartyHash: SELLER_HASH,
    });
    await seller.applyInboundPropose(payload, BUYER_HASH);

    // Seller counters at a higher price.
    const { agreement: sellerCounter, payload: counterPayload } =
      await seller.respond(offer.id, 'counter', { decision: 'Jordans EU43', terms: 'price 2.0 FTC', amountMicroFtc: '2000000' });
    expect(sellerCounter.role).toBe('proposer'); // seller now proposes the new head
    expect(sellerCounter.seq).toBe(1);

    // Buyer adopts the counter head (now the acceptor of seq 1).
    const buyerCountered = await buyer.applyInboundRespond(counterPayload, SELLER_HASH);
    expect(buyerCountered!.status).toBe('proposed');
    expect(buyerCountered!.role).toBe('acceptor');
    expect(buyerCountered!.seq).toBe(1);
    expect(buyerCountered!.amountMicroFtc).toBe('2000000');
    expect(buyerCountered!.proposalHash).toBe(sellerCounter.proposalHash);

    // Buyer accepts the counter; seller (proposer of the head) reaches agreed.
    const { payload: acceptPayload } = await buyer.respond(offer.id, 'accept');
    const sellerAgreed = await seller.applyInboundRespond(acceptPayload, BUYER_HASH);
    expect(sellerAgreed!.status).toBe('agreed');
    expect(sellerAgreed!.seq).toBe(1);
  });

  it('rejects a tampered inbound proposal (amount changed under the signature)', async () => {
    const { payload } = await buyer.propose({
      decision: 'd', terms: 't', amountMicroFtc: '100', counterpartyAddress: SELLER_ADDR, counterpartyHash: SELLER_HASH,
    });
    const tampered = { ...payload, amountMicroFtc: '999999' };
    expect(await seller.applyInboundPropose(tampered, BUYER_HASH)).toBeNull();
  });

  it('rejects a response from the wrong sender', async () => {
    const { agreement: offer, payload } = await buyer.propose({
      decision: 'd', terms: 't', amountMicroFtc: '100', counterpartyAddress: SELLER_ADDR, counterpartyHash: SELLER_HASH,
    });
    await seller.applyInboundPropose(payload, BUYER_HASH);
    const { payload: acceptPayload } = await seller.respond(offer.id, 'accept');
    // fromHash must equal the proposer's recorded counterpartyHash (SELLER_HASH).
    expect(await buyer.applyInboundRespond(acceptPayload, 'someone-else')).toBeNull();
    expect((await buyer.get(offer.id))!.status).toBe('proposed'); // untouched
  });

  it('rejects a replayed / second verdict once terminal (verdict-flip defense)', async () => {
    const { agreement: offer, payload } = await buyer.propose({
      decision: 'd', terms: 't', amountMicroFtc: '100', counterpartyAddress: SELLER_ADDR, counterpartyHash: SELLER_HASH,
    });
    await seller.applyInboundPropose(payload, BUYER_HASH);
    const { payload: acceptPayload } = await seller.respond(offer.id, 'accept');
    expect((await buyer.applyInboundRespond(acceptPayload, SELLER_HASH))!.status).toBe('agreed');
    // a replay of the same accept is hard-rejected (row already terminal)
    expect(await buyer.applyInboundRespond(acceptPayload, SELLER_HASH)).toBeNull();
    expect((await buyer.get(offer.id))!.status).toBe('agreed');
  });

  it('the offer apply is idempotent (a duplicate propose is a no-op)', async () => {
    const { payload } = await buyer.propose({
      decision: 'd', terms: 't', amountMicroFtc: '100', counterpartyAddress: SELLER_ADDR, counterpartyHash: SELLER_HASH,
    });
    const first = await seller.applyInboundPropose(payload, BUYER_HASH);
    const second = await seller.applyInboundPropose(payload, BUYER_HASH);
    expect(second!.id).toBe(first!.id);
    expect((await seller.list()).length).toBe(1);
  });
});

describe('AgreementIdentity persistence', () => {
  it('persists the keypair: a second identity over the same storage reuses it', async () => {
    const storage = new InMemoryStorageBackend();
    const a = new AgreementIdentity(storage);
    const pub1 = await a.pubkey();
    const b = new AgreementIdentity(storage);
    expect(await b.pubkey()).toBe(pub1); // loaded, not regenerated
  });
});

describe('AgreementStore nonce guard', () => {
  it('claims a nonce once, rejects the replay', async () => {
    const store = new AgreementStore(new InMemoryStorageBackend());
    expect(await store.consumeNonce('n1')).toBe(true);
    expect(await store.consumeNonce('n1')).toBe(false);
    expect(await store.consumeNonce('n2')).toBe(true);
  });
});
