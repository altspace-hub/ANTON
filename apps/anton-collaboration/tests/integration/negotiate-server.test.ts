/**
 * negotiate-server.test.ts — the negotiate verb end-to-end through buildServer
 * with a stubbed relay + seller and a StubNegotiationBrain (no network). Proves:
 * negotiate returns a jobId synchronously, the loop reaches propose_ready within
 * the ceiling, NOTHING is signed, and the human gate is STILL enforced
 * independently (proposeAgreement → ERR_NO_APPROVAL with no modal wired).
 */
import { describe, it, expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  buildServer, ERR_NO_ENGINE, ERR_NO_APPROVAL, ERR_NOT_FOUND, type ServerDeps,
} from '../../src/main/server.js';
import { PairingStore } from '../../src/main/pairing.js';
import { AgreementEngine } from '../../src/main/agreement-engine.js';
import { AgreementStore } from '../../src/main/agreement-store.js';
import { AgreementIdentity } from '../../src/main/agreement-identity.js';
import { AgreementProposalStore } from '../../src/main/agreement-proposals.js';
import { NegotiationStore } from '../../src/main/negotiation-store.js';
import { StubNegotiationBrain } from '../../src/main/negotiation-brain.js';
import { InMemoryStorageBackend } from '../../src/main/storage.js';
import type { DiscoveryConfig } from '../../src/main/discovery.js';

const SELLER = {
  found: true,
  portalAddress: 'kicks.sthlm.portal',
  contactHash: 'seller-hash',
  descriptor: {
    portal: { name: 'kicks', namespace: 'sthlm', displayTitle: 'Kicks', originEndpoint: 'https://kicks.example' },
    capabilities: [{ id: 'cap-inq', verb: 'inquire', title: 'Ask stock + price' }],
    payment: { ftcAddress: 'fc_sellerPAY' },
  },
};

function stubDiscovery(invokeOutput: Record<string, unknown>): DiscoveryConfig {
  const fn = (async (input: string | URL | Request) => {
    const u = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (u.includes('/v1/portals/resolve/')) return { ok: true, status: 200, json: async () => SELLER } as Response;
    if (u.includes('/capabilities/cap-inq/invoke')) {
      return { ok: true, status: 200, json: async () => ({ kind: 'invoke_accepted', responseId: 'r1', invocationId: 'r1', verb: 'inquire', output: invokeOutput }) } as Response;
    }
    return { ok: false, status: 404, json: async () => ({ found: false }) } as Response;
  }) as typeof fetch;
  return { base: 'http://relay.test', fetch: fn };
}

interface Harness {
  app: FastifyInstance;
  call: (method: string, params?: unknown) => Promise<{ status: number; body: any }>;
}

function buildHarness(opts: { withBrain?: boolean; brain?: StubNegotiationBrain; invokeOutput?: Record<string, unknown> } = {}): Harness {
  const pairings = new PairingStore();
  const deps: ServerDeps = {
    pairings,
    discovery: stubDiscovery(opts.invokeOutput ?? { priceFtc: 1.8, available: true }),
    // an engine but NO modal → proposeAgreement must still fail closed
    engine: new AgreementEngine(new AgreementStore(new InMemoryStorageBackend()), new AgreementIdentity(new InMemoryStorageBackend())),
    approvals: new AgreementProposalStore(),
    negotiations: new NegotiationStore(),
    buyerContactHash: 'buyer-hash',
    ...(opts.withBrain === false ? {} : { brain: opts.brain ?? new StubNegotiationBrain().queue1({ action: 'accept_terms', rationale: 'fair' }) }),
  };
  const app = buildServer(deps, { bypassOriginCheck: true });
  const code = pairings.newCode();
  const { sessionToken } = pairings.redeemCode({ name: 'buyer', code });
  return {
    app,
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

const TERMINAL = new Set(['done', 'rejected', 'expired', 'cancelled']);
async function settle(h: Harness, jobId: string): Promise<any> {
  for (let i = 0; i < 100; i++) {
    const r = await h.call('getNegotiation', { jobId });
    if (r.body.result && TERMINAL.has(r.body.result.state)) return r.body.result;
    await new Promise((res) => setTimeout(res, 5));
  }
  throw new Error('negotiation never settled');
}

describe('negotiate verb (end-to-end)', () => {
  it('returns a jobId synchronously, then reaches propose_ready within the ceiling', async () => {
    const h = buildHarness();
    const r = await h.call('negotiate', {
      address: 'kicks.sthlm.portal', verb: 'inquire', objective: 'Air Jordans EU43',
      maxAmountMicroFtc: '2000000', inquiryInput: { size: 43 },
    });
    expect(r.body.result.jobId).toMatch(/^neg_/);
    expect(r.body.result.expiresAt).toBeGreaterThan(0);
    expect(r.body.result.outcome).toBeUndefined(); // async — not in the sync reply

    const done = await settle(h, r.body.result.jobId);
    expect(done.state).toBe('done');
    expect(done.outcome.kind).toBe('propose_ready');
    expect(done.outcome.prepared.amountMicroFtc).toBe('1800000');
    expect(BigInt(done.outcome.prepared.amountMicroFtc) <= 2000000n).toBe(true);
    expect(done.outcome.prepared.counterpartyAddress).toBe('fc_sellerPAY');
  });

  it('the gate is NOT bypassed: nothing signed + proposeAgreement still fails closed', async () => {
    const h = buildHarness();
    const r = await h.call('negotiate', {
      address: 'kicks.sthlm.portal', verb: 'inquire', objective: 'Jordans', maxAmountMicroFtc: '2000000',
    });
    await settle(h, r.body.result.jobId);
    // Negotiation prepared a proposal but signed nothing.
    expect((await h.call('listAgreements')).body.result.agreements).toHaveLength(0);
    // And the human gate is still independently enforced (no modal wired here).
    const prop = await h.call('proposeAgreement', {
      decision: 'Jordans', terms: '', amountMicroFtc: '1800000', counterpartyAddress: 'fc_sellerPAY',
    });
    expect(prop.body.error.code).toBe(ERR_NO_APPROVAL);
  });

  it('negotiate with no brain configured → ERR_NO_ENGINE (fail-closed, not a silent success)', async () => {
    const h = buildHarness({ withBrain: false });
    const r = await h.call('negotiate', {
      address: 'kicks.sthlm.portal', verb: 'inquire', objective: 'x', maxAmountMicroFtc: '100',
    });
    expect(r.body.error.code).toBe(ERR_NO_ENGINE);
  });

  it('cancelNegotiation on an unknown job → ERR_NOT_FOUND', async () => {
    // (The pending→cancelled + running→cancelled flips are covered by the store +
    //  orchestrator unit tests; here we only need the unknown-job path.)
    const h = buildHarness();
    const unknown = await h.call('cancelNegotiation', { jobId: 'neg_does_not_exist' });
    expect(unknown.body.error.code).toBe(ERR_NOT_FOUND);
  });
});
