/**
 * discovery.test.ts — search + resolve against a stubbed relay registry.
 * No network. Models the "find the sport store, see it sells + can take an
 * order" buyer flow.
 */
import { describe, it, expect } from 'vitest';
import {
  searchPortals, resolvePortal, portalVerbs, capabilityByVerb,
  type DiscoveryConfig,
} from '../../src/main/discovery.js';

/** Route a stub fetch by URL substring; record calls. */
function stubFetch(routes: Record<string, { status?: number; body: unknown }>): {
  cfg: DiscoveryConfig; calls: string[];
} {
  const calls: string[] = [];
  const fn = (async (input: string | URL | Request) => {
    const u = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(u);
    for (const [pattern, r] of Object.entries(routes)) {
      if (u.includes(pattern)) {
        const status = r.status ?? 200;
        return { ok: status >= 200 && status < 300, status, json: async () => r.body } as Response;
      }
    }
    return { ok: false, status: 404, json: async () => ({ found: false }) } as Response;
  }) as typeof fetch;
  return { cfg: { base: 'http://relay.test', fetch: fn }, calls };
}

const SPORT_STORE = {
  found: true,
  portalAddress: 'kicks.sthlm.portal',
  contactHash: 'ANTON-7F3A-92BC',
  signingPubkeyHex: 'ab'.repeat(32),
  descriptor: {
    schemaVersion: 'capability-1.0.0',
    portal: {
      name: 'kicks', namespace: 'sthlm', displayTitle: 'Kicks Stockholm',
      category: 'sport-store', contactHash: 'ANTON-7F3A-92BC',
      publicKey: 'ab'.repeat(32), originEndpoint: 'https://kicks.example',
    },
    capabilities: [
      { id: 'cap-inq', verb: 'inquire', title: 'Ask about stock + price' },
      { id: 'cap-ord', verb: 'order', title: 'Place an order' },
      { id: 'cap-pay', verb: 'pay', title: 'Pay via FutureChain' },
    ],
  },
};

describe('searchPortals', () => {
  it('queries by text + verbs and returns results', async () => {
    const { cfg, calls } = stubFetch({
      '/v1/portals/search': { body: { results: [{ portalAddress: 'kicks.sthlm.portal', displayTitle: 'Kicks Stockholm', capabilityVerbs: ['inquire', 'order'] }], total: 1 } },
    });
    const r = await searchPortals({ text: 'sport store', verbs: ['order'], limit: 10 }, cfg);
    expect(r.total).toBe(1);
    expect(r.results[0]!.portalAddress).toBe('kicks.sthlm.portal');
    expect(calls[0]).toContain('text=sport+store');
    expect(calls[0]).toContain('verbs=order');
    expect(calls[0]).toContain('limit=10');
  });

  it('returns an empty result set cleanly', async () => {
    const { cfg } = stubFetch({ '/v1/portals/search': { body: { results: [], total: 0 } } });
    expect(await searchPortals({ text: 'nothing here' }, cfg)).toEqual({ results: [], total: 0 });
  });

  it('throws on a non-OK relay response', async () => {
    const { cfg } = stubFetch({ '/v1/portals/search': { status: 500, body: {} } });
    await expect(searchPortals({}, cfg)).rejects.toThrow(/search failed \(500\)/);
  });
});

describe('resolvePortal', () => {
  it('resolves the signed descriptor + signing pubkey + originEndpoint', async () => {
    const { cfg, calls } = stubFetch({ '/v1/portals/resolve/': { body: SPORT_STORE } });
    const p = await resolvePortal('kicks.sthlm.portal', cfg);
    expect(p).toBeTruthy();
    expect(p!.portalAddress).toBe('kicks.sthlm.portal');
    expect(p!.signingPubkeyHex).toBe('ab'.repeat(32));
    expect(p!.descriptor.portal.originEndpoint).toBe('https://kicks.example');
    expect(calls[0]).toContain('/v1/portals/resolve/kicks.sthlm.portal');
  });

  it('returns null when the portal does not exist (relay 404)', async () => {
    const { cfg } = stubFetch({}); // every URL 404s
    expect(await resolvePortal('ghost.nowhere.portal', cfg)).toBeNull();
  });

  it('returns null when the relay reports found:false', async () => {
    const { cfg } = stubFetch({ '/v1/portals/resolve/': { body: { found: false } } });
    expect(await resolvePortal('kicks.sthlm.portal', cfg)).toBeNull();
  });

  it('throws on a non-404 error', async () => {
    const { cfg } = stubFetch({ '/v1/portals/resolve/': { status: 503, body: {} } });
    await expect(resolvePortal('kicks.sthlm.portal', cfg)).rejects.toThrow(/resolve failed \(503\)/);
  });
});

describe('verb helpers', () => {
  it('lists the commerce verbs + finds a capability by verb', async () => {
    const { cfg } = stubFetch({ '/v1/portals/resolve/': { body: SPORT_STORE } });
    const p = (await resolvePortal('kicks.sthlm.portal', cfg))!;
    expect(portalVerbs(p).sort()).toEqual(['inquire', 'order', 'pay']);
    expect(capabilityByVerb(p, 'order')!.id).toBe('cap-ord');
    expect(capabilityByVerb(p, 'rocket')).toBeNull();
  });
});
