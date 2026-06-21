/**
 * fulfilment-server.test.ts — the fulfilment verbs over JSON-RPC. The full
 * signed ship→deliver logic + guards live in fulfilment.test.ts; here we prove
 * the verbs dispatch, the gate posture (signed but UNGATED — no modal needed),
 * and fail-closed when the engine is absent.
 */
import { describe, it, expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer, ERR_NO_ENGINE, ERR_VALIDATION, type ServerDeps } from '../../src/main/server.js';
import { PairingStore } from '../../src/main/pairing.js';
import { AgreementEngine } from '../../src/main/agreement-engine.js';
import { AgreementStore } from '../../src/main/agreement-store.js';
import { AgreementIdentity } from '../../src/main/agreement-identity.js';
import { FulfilmentEngine } from '../../src/main/fulfilment-engine.js';
import { FulfilmentStore } from '../../src/main/fulfilment-store.js';
import { InMemoryStorageBackend } from '../../src/main/storage.js';
import type { Agreement } from '../../src/main/agreement-core.js';

interface Harness {
  app: FastifyInstance;
  store: AgreementStore;
  identity: AgreementIdentity;
  call: (method: string, params?: unknown) => Promise<{ status: number; body: any }>;
}

function buildHarness(withFulfilment = true): Harness {
  const pairings = new PairingStore();
  const storage = new InMemoryStorageBackend();
  const store = new AgreementStore(storage);
  const identity = new AgreementIdentity(new InMemoryStorageBackend());
  const engine = new AgreementEngine(store, identity);
  const deps: ServerDeps = {
    pairings, engine,
    ...(withFulfilment ? { fulfilment: new FulfilmentEngine(store, identity, new FulfilmentStore(storage)) } : {}),
  };
  const app = buildServer(deps, { bypassOriginCheck: true });
  const code = pairings.newCode();
  const { sessionToken } = pairings.redeemCode({ name: 'seller', code });
  return {
    app, store, identity,
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

/** Seed an 'agreed' agreement signed by this harness's identity (so markShipped
 *  can sign it as a party). */
async function seedAgreed(h: Harness, id = 'agr_seed_1'): Promise<Agreement> {
  const pub = await h.identity.pubkey();
  const row: Agreement = {
    id, schemaV: 1, role: 'proposer', trustTier: 'signed',
    counterpartyHash: 'buyer-hash', counterpartyAddress: 'fc_buyer',
    decision: 'Jordans', terms: '', amountMicroFtc: '1800000', status: 'agreed', seq: 0,
    proposalHash: 'a'.repeat(64), proposerPubkey: pub, proposerSig: 'sig', acceptorPubkey: 'bb'.repeat(32),
    createdAt: 1, nonce: '',
  };
  await h.store.put(row);
  return row;
}

describe('fulfilment verbs', () => {
  it('markShipped signs + records a shipment; getFulfilment then reports shipped', async () => {
    const h = buildHarness();
    await seedAgreed(h);
    const r = await h.call('markShipped', { agreementId: 'agr_seed_1', carrier: 'PostNord', tracking: 'PN1' });
    expect(r.body.result.record.status).toBe('shipped');
    expect(r.body.result.payload.shipperSig).toMatch(/^[0-9a-f]{128}$/);
    expect(r.body.result.payload.carrier).toBe('PostNord');

    const g = await h.call('getFulfilment', { agreementId: 'agr_seed_1' });
    expect(g.body.result.found).toBe(true);
    expect(g.body.result.fulfilment.status).toBe('shipped');
    expect(g.body.result.fulfilment.tracking).toBe('PN1');
  });

  it('markShipped on an unknown agreement → ERR_VALIDATION', async () => {
    const h = buildHarness();
    const r = await h.call('markShipped', { agreementId: 'nope', carrier: 'X' });
    expect(r.body.error.code).toBe(ERR_VALIDATION);
  });

  it('getFulfilment is "awaiting" for an agreed agreement with nothing shipped', async () => {
    const h = buildHarness();
    await seedAgreed(h);
    const g = await h.call('getFulfilment', { agreementId: 'agr_seed_1' });
    expect(g.body.result.fulfilment.status).toBe('awaiting');
  });

  it('FAIL CLOSED: fulfilment verbs without an engine → ERR_NO_ENGINE', async () => {
    const h = buildHarness(false);
    const r = await h.call('markShipped', { agreementId: 'x', carrier: 'X' });
    expect(r.body.error.code).toBe(ERR_NO_ENGINE);
    const g = await h.call('getFulfilment', { agreementId: 'x' });
    expect(g.body.error.code).toBe(ERR_NO_ENGINE);
  });
});
