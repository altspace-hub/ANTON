/**
 * escrow-server.test.ts — the escrow verbs over JSON-RPC. The full state-machine
 * logic + guards live in escrow.test.ts; here we prove the verbs dispatch, the
 * happy custodial flow (open → fund → deliver → release → settled), and the
 * fail-closed posture. The server's identity acts as the ARBITER.
 */
import { describe, it, expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer, ERR_NO_ENGINE, ERR_VALIDATION, type ServerDeps } from '../../src/main/server.js';
import { PairingStore } from '../../src/main/pairing.js';
import { AgreementEngine } from '../../src/main/agreement-engine.js';
import { AgreementStore } from '../../src/main/agreement-store.js';
import { AgreementIdentity } from '../../src/main/agreement-identity.js';
import { FulfilmentStore } from '../../src/main/fulfilment-store.js';
import { FulfilmentEngine } from '../../src/main/fulfilment-engine.js';
import { EscrowStore } from '../../src/main/escrow-store.js';
import { EscrowEngine } from '../../src/main/escrow-engine.js';
import { InMemoryStorageBackend } from '../../src/main/storage.js';
import type { Agreement } from '../../src/main/agreement-core.js';

const ID = 'agr_1';
const PHASH = 'a'.repeat(64);

interface Harness {
  app: FastifyInstance;
  agreements: AgreementStore;
  buyerFulfilment: FulfilmentEngine;
  fulStore: FulfilmentStore;
  identity: AgreementIdentity;
  buyerPub: string;
  call: (method: string, params?: unknown) => Promise<{ status: number; body: any }>;
}

async function buildHarness(withEscrow = true): Promise<Harness> {
  const pairings = new PairingStore();
  const agreements = new AgreementStore(new InMemoryStorageBackend());
  const identity = new AgreementIdentity(new InMemoryStorageBackend()); // the server = arbiter
  const buyerId = new AgreementIdentity(new InMemoryStorageBackend());
  const buyerPub = await buyerId.pubkey();
  const fulStore = new FulfilmentStore(new InMemoryStorageBackend());
  const engine = new AgreementEngine(agreements, identity);
  const deps: ServerDeps = {
    pairings, engine,
    ...(withEscrow ? { escrow: new EscrowEngine(agreements, identity, new EscrowStore(new InMemoryStorageBackend()), fulStore) } : {}),
  };
  const app = buildServer(deps, { bypassOriginCheck: true });
  const code = pairings.newCode();
  const { sessionToken } = pairings.redeemCode({ name: 'arbiter', code });
  return {
    app, agreements, identity, buyerPub,
    buyerFulfilment: new FulfilmentEngine(agreements, buyerId, fulStore),
    fulStore,
    call: async (method, params) => {
      const res = await app.inject({
        method: 'POST', url: '/rpc',
        headers: { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' },
        payload: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
      });
      return { status: res.statusCode, body: res.json() };
    },
  };
}

async function seedAgreed(h: Harness): Promise<void> {
  await h.agreements.put({
    id: ID, schemaV: 1, role: 'proposer', trustTier: 'signed',
    counterpartyHash: 'seller-hash', counterpartyAddress: 'fc_seller',
    decision: 'Jordans', terms: '', amountMicroFtc: '1800000', status: 'agreed', seq: 0,
    proposalHash: PHASH, proposerPubkey: h.buyerPub, proposerSig: 's', acceptorPubkey: 'bb'.repeat(32),
    sellerRole: 'acceptor', createdAt: 1, nonce: '',
  } satisfies Agreement);
}

describe('escrow verbs (custodial flow over JSON-RPC)', () => {
  it('open → fund → deliver → release → settled, all via the verbs', async () => {
    const h = await buildHarness();
    await seedAgreed(h);
    const arbiterPubkey = await h.identity.pubkey(); // the server is the arbiter

    const opened = await h.call('openEscrow', {
      agreementId: ID, escrowAddress: 'fc_E', releaseTo: 'fc_seller', refundTo: 'fc_buyer', arbiterPubkey,
    });
    expect(opened.body.result.escrow.status).toBe('requested');
    expect(opened.body.result.escrow.amountMicroFtc).toBe('1800000'); // conservation

    const fundInstr = await h.call('getEscrowFundInstruction', { agreementId: ID });
    expect(fundInstr.body.result.instruction.to).toBe('fc_E');

    expect((await h.call('markEscrowFunded', { agreementId: ID, txHash: 'tx_fund' })).body.result.escrow.status).toBe('funded');

    // buyer SIGNS the delivery confirmation (what authorizes a release post-C2)
    // Record the shipment first — confirmDelivery now refuses without one, since
    // a signed "I received the goods" for an order that was never sent is exactly
    // what releaseAllowed() treats as authorisation to pay out. Seeded rather than
    // called through markShipped because that verb is seller-only and this
    // harness runs as the buyer.
    await h.fulStore.put({ agreementId: ID, proposalHash: PHASH, status: 'shipped' });
    await h.buyerFulfilment.confirmDelivery(ID);

    const relInstr = await h.call('getEscrowReleaseInstruction', { agreementId: ID });
    expect(relInstr.body.result.instruction.to).toBe('fc_seller');
    expect(relInstr.body.result.instruction.amountMicroFtc).toBe('1800000');

    const released = await h.call('markEscrowReleased', { agreementId: ID, txHash: 'tx_release' });
    expect(released.body.result.escrow.status).toBe('released');

    // the release settled the agreement
    expect((await h.agreements.get(ID))!.status).toBe('settled');
    expect((await h.call('getEscrow', { agreementId: ID })).body.result.escrow.status).toBe('released');
  });

  it('release is refused without a delivery proof (policy surfaces as ERR_VALIDATION)', async () => {
    const h = await buildHarness();
    await seedAgreed(h);
    const arbiterPubkey = await h.identity.pubkey();
    await h.call('openEscrow', { agreementId: ID, escrowAddress: 'fc_E', releaseTo: 'fc_seller', refundTo: 'fc_buyer', arbiterPubkey });
    await h.call('markEscrowFunded', { agreementId: ID, txHash: 'tx_fund' });
    const rel = await h.call('getEscrowReleaseInstruction', { agreementId: ID });
    expect(rel.body.error.code).toBe(ERR_VALIDATION);
    expect(rel.body.error.message).toMatch(/no delivery proof/);
  });

  it('FAIL CLOSED: escrow verbs without an engine → ERR_NO_ENGINE', async () => {
    const h = await buildHarness(false);
    expect((await h.call('openEscrow', { agreementId: ID, escrowAddress: 'fc_E', releaseTo: 'a', refundTo: 'b', arbiterPubkey: 'c' })).body.error.code).toBe(ERR_NO_ENGINE);
    expect((await h.call('getEscrow', { agreementId: ID })).body.error.code).toBe(ERR_NO_ENGINE);
  });
});
