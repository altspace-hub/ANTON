/**
 * server.test.ts — the JSON-RPC shell end-to-end: pair → search → resolve,
 * with a stubbed relay registry. Proves auth + dispatch + the discovery verbs.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  buildServer, ERR_AUTH_MISSING, ERR_AUTH_INVALID, ERR_VALIDATION, ERR_UPSTREAM, ERR_NOT_FOUND,
  type ServerDeps,
} from '../../src/main/server.js';
import { PairingStore } from '../../src/main/pairing.js';
import type { DiscoveryConfig } from '../../src/main/discovery.js';

const SPORT_STORE = {
  found: true,
  portalAddress: 'kicks.sthlm.portal',
  contactHash: 'ANTON-7F3A-92BC',
  signingPubkeyHex: 'ab'.repeat(32),
  descriptor: {
    portal: { name: 'kicks', namespace: 'sthlm', displayTitle: 'Kicks Stockholm', originEndpoint: 'https://kicks.example' },
    capabilities: [
      { id: 'cap-inq', verb: 'inquire', title: 'Ask stock + price' },
      { id: 'cap-ord', verb: 'order', title: 'Place an order' },
    ],
  },
};

function stubDiscovery(routes: Record<string, { status?: number; body: unknown }>): DiscoveryConfig {
  const fn = (async (input: string | URL | Request) => {
    const u = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    for (const [pattern, r] of Object.entries(routes)) {
      if (u.includes(pattern)) {
        const status = r.status ?? 200;
        return { ok: status >= 200 && status < 300, status, json: async () => r.body } as Response;
      }
    }
    return { ok: false, status: 404, json: async () => ({ found: false }) } as Response;
  }) as typeof fetch;
  return { base: 'http://relay.test', fetch: fn };
}

interface Harness {
  app: FastifyInstance;
  pair: () => { sessionToken: string };
  call: (token: string, method: string, params?: unknown) => Promise<{ status: number; body: any }>;
}

function buildHarness(discovery: DiscoveryConfig): Harness {
  const pairings = new PairingStore();
  const deps: ServerDeps = { pairings, discovery };
  const app = buildServer(deps, { bypassOriginCheck: true });
  return {
    app,
    pair: () => {
      const code = pairings.newCode();
      const issued = pairings.redeemCode({ name: 'buyer-agent', code });
      return { sessionToken: issued.sessionToken };
    },
    call: async (token, method, params) => {
      const res = await app.inject({
        method: 'POST', url: '/rpc',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        payload: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
      });
      return { status: res.statusCode, body: res.json() };
    },
  };
}

describe('collaboration JSON-RPC server', () => {
  let h: Harness;
  beforeEach(() => {
    h = buildHarness(stubDiscovery({
      '/v1/portals/search': { body: { results: [{ portalAddress: 'kicks.sthlm.portal', displayTitle: 'Kicks Stockholm', capabilityVerbs: ['inquire', 'order'] }], total: 1 } },
      '/v1/portals/resolve/': { body: SPORT_STORE },
      '/capabilities/cap-inq/invoke': { body: { kind: 'invoke_accepted', responseId: 'resp_42', invocationId: 'resp_42', verb: 'inquire', output: { inStock: true, sizeEu: 43, priceFtc: 1.8 } } },
    }));
  });

  it('rejects an unauthenticated call', async () => {
    const res = await h.app.inject({
      method: 'POST', url: '/rpc',
      headers: { 'Content-Type': 'application/json' },
      payload: JSON.stringify({ jsonrpc: '2.0', method: 'getStatus', id: 1 }),
    });
    expect(res.statusCode).toBe(401);
    expect((res.json() as any).error.code).toBe(ERR_AUTH_MISSING);
  });

  it('rejects an unknown bearer', async () => {
    const r = await h.call('sk_nope', 'getStatus');
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe(ERR_AUTH_INVALID);
  });

  it('getStatus reports paired + the available verbs', async () => {
    const { sessionToken } = h.pair();
    const r = await h.call(sessionToken, 'getStatus');
    expect(r.body.result.paired).toBe(true);
    expect(r.body.result.verbs).toContain('searchSellers');
    expect(r.body.result.verbs).toContain('inquireSeller');
    expect(r.body.result.relayBase).toBe('http://relay.test');
  });

  it('searchSellers finds the sport store by text + verb', async () => {
    const { sessionToken } = h.pair();
    const r = await h.call(sessionToken, 'searchSellers', { text: 'sport store', verbs: ['order'] });
    expect(r.body.result.total).toBe(1);
    expect(r.body.result.results[0].portalAddress).toBe('kicks.sthlm.portal');
  });

  it('resolveSeller returns the descriptor + commerce verbs + endpoint', async () => {
    const { sessionToken } = h.pair();
    const r = await h.call(sessionToken, 'resolveSeller', { address: 'kicks.sthlm.portal' });
    expect(r.body.result.found).toBe(true);
    expect(r.body.result.verbs.sort()).toEqual(['inquire', 'order']);
    expect(r.body.result.descriptor.portal.originEndpoint).toBe('https://kicks.example');
    expect(r.body.result.signingPubkeyHex).toBe('ab'.repeat(32));
  });

  it('resolveSeller returns found:false for an unknown portal', async () => {
    const h2 = buildHarness(stubDiscovery({})); // every URL 404s
    const { sessionToken } = h2.pair();
    const r = await h2.call(sessionToken, 'resolveSeller', { address: 'ghost.nowhere.portal' });
    expect(r.body.result).toEqual({ found: false });
  });

  it('validates params (resolveSeller needs an address)', async () => {
    const { sessionToken } = h.pair();
    const r = await h.call(sessionToken, 'resolveSeller', {});
    expect(r.body.error.code).toBe(ERR_VALIDATION);
  });

  it('surfaces an upstream registry failure as ERR_UPSTREAM', async () => {
    const h2 = buildHarness(stubDiscovery({ '/v1/portals/search': { status: 502, body: {} } }));
    const { sessionToken } = h2.pair();
    const r = await h2.call(sessionToken, 'searchSellers', { text: 'x' });
    expect(r.body.error.code).toBe(ERR_UPSTREAM);
  });

  it('inquireSeller resolves + invokes by verb and returns the seller quote', async () => {
    const { sessionToken } = h.pair();
    const r = await h.call(sessionToken, 'inquireSeller', {
      address: 'kicks.sthlm.portal', verb: 'inquire', input: { question: 'Jordans size 43?' },
    });
    expect(r.body.result.kind).toBe('response');
    expect(r.body.result.capabilityId).toBe('cap-inq');
    expect(r.body.result.responseId).toBe('resp_42');
    expect(r.body.result.output).toEqual({ inStock: true, sizeEu: 43, priceFtc: 1.8 });
  });

  it('inquireSeller accepts an explicit capabilityId (overriding verb resolution)', async () => {
    const { sessionToken } = h.pair();
    const r = await h.call(sessionToken, 'inquireSeller', { address: 'kicks.sthlm.portal', capabilityId: 'cap-inq', input: {} });
    expect(r.body.result.kind).toBe('response');
    expect(r.body.result.capabilityId).toBe('cap-inq');
  });

  it('inquireSeller requires either verb or capabilityId', async () => {
    const { sessionToken } = h.pair();
    const r = await h.call(sessionToken, 'inquireSeller', { address: 'kicks.sthlm.portal', input: {} });
    expect(r.body.error.code).toBe(ERR_VALIDATION);
  });

  it('inquireSeller returns ERR_NOT_FOUND when the seller does not exist', async () => {
    const h2 = buildHarness(stubDiscovery({})); // every URL 404s → resolve null
    const { sessionToken } = h2.pair();
    const r = await h2.call(sessionToken, 'inquireSeller', { address: 'ghost.nowhere.portal', verb: 'inquire' });
    expect(r.body.error.code).toBe(ERR_NOT_FOUND);
  });

  it('inquireSeller returns ERR_NOT_FOUND when the seller has no such verb', async () => {
    const { sessionToken } = h.pair();
    const r = await h.call(sessionToken, 'inquireSeller', { address: 'kicks.sthlm.portal', verb: 'teleport' });
    expect(r.body.error.code).toBe(ERR_NOT_FOUND);
    expect(r.body.error.message).toContain('teleport');
  });

  it('inquireSeller surfaces an offline seller as a structured result (not an RPC error)', async () => {
    const h2 = buildHarness(stubDiscovery({
      '/v1/portals/resolve/': { body: SPORT_STORE },
      '/capabilities/cap-inq/invoke': { status: 503, body: {} },
    }));
    const { sessionToken } = h2.pair();
    const r = await h2.call(sessionToken, 'inquireSeller', { address: 'kicks.sthlm.portal', verb: 'inquire' });
    expect(r.body.error).toBeUndefined();
    expect(r.body.result.kind).toBe('seller_offline');
  });

  it('inquireSeller attributes the buyer contact hash to the seller', async () => {
    const pairings = new PairingStore();
    const bodies: unknown[] = [];
    const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
      const u = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (u.includes('/v1/portals/resolve/')) return { ok: true, status: 200, json: async () => SPORT_STORE } as Response;
      if (u.includes('/invoke')) {
        bodies.push(init?.body ? JSON.parse(String(init.body)) : undefined);
        return { ok: true, status: 200, json: async () => ({ kind: 'invoke_accepted', responseId: 'r', invocationId: 'r', verb: 'inquire', output: {} }) } as Response;
      }
      return { ok: false, status: 404, json: async () => ({ found: false }) } as Response;
    }) as typeof fetch;
    const app = buildServer({ pairings, discovery: { base: 'http://relay.test', fetch: fetchFn }, buyerContactHash: 'BUYER-XYZ' }, { bypassOriginCheck: true });
    const code = pairings.newCode();
    const { sessionToken } = pairings.redeemCode({ name: 'buyer', code });
    await app.inject({
      method: 'POST', url: '/rpc',
      headers: { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' },
      payload: JSON.stringify({ jsonrpc: '2.0', method: 'inquireSeller', params: { address: 'kicks.sthlm.portal', verb: 'inquire', input: { q: 1 } }, id: 1 }),
    });
    expect(bodies[0]).toEqual({ input: { q: 1 }, visitorContactHash: 'BUYER-XYZ' });
  });

  it('the /pair bootstrap issues a working bearer', async () => {
    const pairings = new PairingStore();
    const discovery = stubDiscovery({ '/v1/portals/search': { body: { results: [], total: 0 } } });
    const app = buildServer({ pairings, discovery }, { bypassOriginCheck: true });
    const code = pairings.newCode();
    const paired = await app.inject({
      method: 'POST', url: '/pair',
      headers: { 'Content-Type': 'application/json' },
      payload: JSON.stringify({ name: 'buyer', code }),
    });
    expect(paired.statusCode).toBe(200);
    const token = (paired.json() as any).sessionToken as string;
    const r = await app.inject({
      method: 'POST', url: '/rpc',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      payload: JSON.stringify({ jsonrpc: '2.0', method: 'getStatus', id: 1 }),
    });
    expect((r.json() as any).result.paired).toBe(true);
  });
});
