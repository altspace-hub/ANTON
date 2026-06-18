/**
 * talk.test.ts — TALK transport: the buyer invokes a seller capability on the
 * seller's OWN ANTON (not the relay). No network. Models "ask the sport store
 * about Air Jordans size 43".
 */
import { describe, it, expect } from 'vitest';
import { invokeCapability, capabilityForVerb } from '../../src/main/talk.js';
import type { ResolvedPortal } from '../../src/main/discovery.js';

const SELLER: ResolvedPortal = {
  portalAddress: 'kicks.sthlm.portal',
  contactHash: 'ANTON-7F3A-92BC',
  signingPubkeyHex: 'ab'.repeat(32),
  descriptor: {
    portal: {
      name: 'kicks', namespace: 'sthlm', displayTitle: 'Kicks Stockholm',
      originEndpoint: 'https://kicks.example/',
    },
    capabilities: [
      { id: 'cap-inq', verb: 'inquire', title: 'Ask about stock + price' },
      { id: 'cap-ord', verb: 'order', title: 'Place an order' },
    ],
  },
};

/** Record the calls; route by URL substring. */
function stubFetch(handler: (url: string, init?: RequestInit) => { status?: number; body: unknown }): {
  fetch: typeof fetch; calls: Array<{ url: string; body: unknown }>;
} {
  const calls: Array<{ url: string; body: unknown }> = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, body });
    const r = handler(url, init);
    const status = r.status ?? 200;
    return { ok: status >= 200 && status < 300, status, json: async () => r.body } as Response;
  }) as typeof fetch;
  return { fetch: fn, calls };
}

describe('invokeCapability', () => {
  it('POSTs to the seller origin with the FULL name.namespace.portal address', async () => {
    const { fetch, calls } = stubFetch(() => ({
      body: { kind: 'invoke_accepted', responseId: 'resp_1', invocationId: 'inv_1', verb: 'inquire', output: { inStock: true, priceFtc: 1.8 } },
    }));
    const r = await invokeCapability(SELLER, 'cap-inq', { question: 'Jordans size 43?' }, { fetch, visitorContactHash: 'BUYER-1' });

    expect(r.kind).toBe('response');
    expect(r.responseId).toBe('resp_1');
    expect(r.output).toEqual({ inStock: true, priceFtc: 1.8 });
    // URL uses the full address + the cap id, against the seller's own origin
    // (trailing slash on originEndpoint normalised away).
    expect(calls[0]!.url).toBe(
      'https://kicks.example/api/portals/visit/kicks.sthlm.portal/capabilities/cap-inq/invoke',
    );
    expect(calls[0]!.body).toEqual({ input: { question: 'Jordans size 43?' }, visitorContactHash: 'BUYER-1' });
  });

  it('omits visitorContactHash when none is supplied (anonymous buyer)', async () => {
    const { fetch, calls } = stubFetch(() => ({ body: { kind: 'invoke_accepted', responseId: 'r', invocationId: 'r', verb: 'inquire', output: {} } }));
    await invokeCapability(SELLER, 'cap-inq', { q: 1 }, { fetch });
    expect(calls[0]!.body).toEqual({ input: { q: 1 } });
  });

  it('returns capability_not_found for an unknown capability id', async () => {
    const { fetch, calls } = stubFetch(() => ({ body: {} }));
    const r = await invokeCapability(SELLER, 'cap-nope', {}, { fetch });
    expect(r.kind).toBe('capability_not_found');
    expect(calls).toHaveLength(0); // never hits the network
  });

  it('returns not_supported when the seller has no originEndpoint', async () => {
    const noOrigin: ResolvedPortal = {
      ...SELLER,
      descriptor: { ...SELLER.descriptor, portal: { ...SELLER.descriptor.portal, originEndpoint: undefined } },
    };
    const { fetch, calls } = stubFetch(() => ({ body: {} }));
    const r = await invokeCapability(noOrigin, 'cap-inq', {}, { fetch });
    expect(r.kind).toBe('not_supported');
    expect(calls).toHaveLength(0);
  });

  it('maps a 429 to rate_limited', async () => {
    const { fetch } = stubFetch(() => ({ status: 429, body: {} }));
    const r = await invokeCapability(SELLER, 'cap-inq', {}, { fetch });
    expect(r.kind).toBe('rate_limited');
  });

  it('passes a structured 4xx body through (e.g. capability_not_found from the server)', async () => {
    const { fetch } = stubFetch(() => ({ status: 404, body: { kind: 'capability_not_found', message: 'gone' } }));
    const r = await invokeCapability(SELLER, 'cap-inq', {}, { fetch });
    expect(r.kind).toBe('capability_not_found');
    expect(r.message).toBe('gone');
  });

  it('maps a 5xx to seller_offline', async () => {
    const { fetch } = stubFetch(() => ({ status: 502, body: {} }));
    const r = await invokeCapability(SELLER, 'cap-inq', {}, { fetch });
    expect(r.kind).toBe('seller_offline');
  });

  it('maps a network throw to seller_offline', async () => {
    const throwingFetch = (async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof globalThis.fetch;
    const r = await invokeCapability(SELLER, 'cap-inq', {}, { fetch: throwingFetch });
    expect(r.kind).toBe('seller_offline');
    expect(r.message).toContain('ECONNREFUSED');
  });

  it('refuses a non-https seller origin by default (SSRF guard) without hitting the network', async () => {
    const metadata: ResolvedPortal = {
      ...SELLER,
      descriptor: { ...SELLER.descriptor, portal: { ...SELLER.descriptor.portal, originEndpoint: 'http://169.254.169.254' } },
    };
    const { fetch, calls } = stubFetch(() => ({ body: {} }));
    const r = await invokeCapability(metadata, 'cap-inq', {}, { fetch });
    expect(r.kind).toBe('not_supported');
    expect(r.message).toContain('not https');
    expect(calls).toHaveLength(0);
  });

  it('allows an http origin when allowInsecureOrigin is set (local/dev seller)', async () => {
    const local: ResolvedPortal = {
      ...SELLER,
      descriptor: { ...SELLER.descriptor, portal: { ...SELLER.descriptor.portal, originEndpoint: 'http://127.0.0.1:8443' } },
    };
    const { fetch, calls } = stubFetch(() => ({ body: { kind: 'invoke_accepted', responseId: 'r', invocationId: 'r', verb: 'inquire', output: {} } }));
    const r = await invokeCapability(local, 'cap-inq', {}, { fetch, allowInsecureOrigin: true });
    expect(r.kind).toBe('response');
    expect(calls[0]!.url).toContain('http://127.0.0.1:8443/api/portals/visit/');
  });

  it('builds the full address from portalAddress when namespace is absent', async () => {
    const noNs: ResolvedPortal = {
      ...SELLER,
      portalAddress: 'solo.shop', // missing the .portal suffix
      descriptor: { ...SELLER.descriptor, portal: { name: 'solo', displayTitle: 'Solo', originEndpoint: 'https://solo.example' } },
    };
    const { fetch, calls } = stubFetch(() => ({ body: { kind: 'invoke_accepted', responseId: 'r', invocationId: 'r', verb: 'inquire', output: {} } }));
    await invokeCapability(noNs, 'cap-inq', {}, { fetch });
    expect(calls[0]!.url).toContain('/api/portals/visit/solo.shop.portal/capabilities/cap-inq/invoke');
  });
});

describe('capabilityForVerb', () => {
  it('finds a capability by its verb', () => {
    expect(capabilityForVerb(SELLER, 'order')!.id).toBe('cap-ord');
    expect(capabilityForVerb(SELLER, 'rocket')).toBeNull();
  });
});
