/**
 * portal-cache.test.ts — coverage for the offline portal cache.
 *
 * Two layers under test:
 *   1. portal-cache.ts itself — read/write/clear/eviction roundtrips
 *      against the fake-indexeddb store.
 *   2. portals.ts — that fetchPortalDescriptor / fetchPortalPages /
 *      fetchPortalPage actually fall back to the cache when the
 *      network throws or returns 5xx.
 *
 * The contract we're verifying for the fallback:
 *   - 200 → write through, return fresh
 *   - 404 → DO NOT cache, return the authoritative null/[]
 *   - 5xx → return cached if any, else throw
 *   - fetch throw (DNS, TLS, ECONNREFUSED) → return cached if any, else rethrow
 *
 * Critically: a stale cache must NEVER mask a real 404. A publisher
 * deleting a page should result in visitors seeing it gone, not seeing
 * the last cached copy. This is what isolates "network flaky" from
 * "content gone" — the rule is encoded in the if-ladders in portals.ts.
 */
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import {
  readDescriptor,
  writeDescriptor,
  readPages,
  writePages,
  readPage,
  writePage,
  clearPortal,
  _debugCount,
} from '../services/portal-cache';
import {
  fetchPortalDescriptor,
  fetchPortalPage,
  fetchPortalPages,
  type PortalDescriptor,
} from '../services/portals';

// Each test uses a unique address so concurrent runs against the same
// fake-indexeddb factory don't collide.
let nonce = 0;
const addr = () => `portal-cache-test-${++nonce}.global.portal`;

const baseDescriptor = (address: string): PortalDescriptor => ({
  schemaVersion: '0.2',
  portal: {
    name: address,
    displayTitle: 'Cached',
    originEndpoint: 'http://localhost:3001',
  },
  capabilities: [],
});

beforeEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = vi.fn();
});

describe('portal-cache (raw layer)', () => {
  it('roundtrips a descriptor', async () => {
    const a = addr();
    const desc = baseDescriptor(a);
    await writeDescriptor(a, desc);
    const got = await readDescriptor<PortalDescriptor>(a);
    expect(got).toEqual(desc);
  });

  it('roundtrips a page list', async () => {
    const a = addr();
    const pages = [{ path: '/', title: 'Home', sortOrder: 0 }];
    await writePages(a, pages);
    expect(await readPages(a)).toEqual(pages);
  });

  it('roundtrips a single page', async () => {
    const a = addr();
    const page = { html: '<h1>hi</h1>', title: 'Hi' };
    await writePage(a, '/about', page);
    expect(await readPage(a, '/about')).toEqual(page);
  });

  it('normalises page paths so /foo and foo collide', async () => {
    const a = addr();
    await writePage(a, '/x', { html: 'A', title: null });
    await writePage(a, 'x', { html: 'B', title: null });
    // Both paths should resolve to the same key — the second write wins.
    expect(await readPage(a, '/x')).toEqual({ html: 'B', title: null });
  });

  it('returns null for unknown keys', async () => {
    expect(await readDescriptor(`missing-${++nonce}.global.portal`)).toBeNull();
    expect(await readPages(`missing-${++nonce}.global.portal`)).toBeNull();
    expect(await readPage(`missing-${++nonce}.global.portal`, '/')).toBeNull();
  });

  it('clearPortal wipes all three kinds for one address but leaves others', async () => {
    const a = addr();
    const b = addr();
    await writeDescriptor(a, baseDescriptor(a));
    await writePages(a, [{ path: '/', title: 'h', sortOrder: 0 }]);
    await writePage(a, '/', { html: 'a', title: null });
    await writePage(a, '/about', { html: 'b', title: null });
    await writeDescriptor(b, baseDescriptor(b));

    await clearPortal(a);

    expect(await readDescriptor(a)).toBeNull();
    expect(await readPages(a)).toBeNull();
    expect(await readPage(a, '/')).toBeNull();
    expect(await readPage(a, '/about')).toBeNull();
    expect(await readDescriptor(b)).not.toBeNull();
  });

  it('_debugCount reflects what was written', async () => {
    const before = await _debugCount();
    const a = addr();
    await writeDescriptor(a, baseDescriptor(a));
    await writePage(a, '/x', { html: 'x', title: null });
    expect(await _debugCount()).toBe(before + 2);
  });
});

describe('fetchPortalDescriptor with cache', () => {
  it('writes through on a 200 success', async () => {
    const a = addr();
    const desc = baseDescriptor(a);
    (globalThis.fetch as Mock).mockResolvedValueOnce(
      new Response(JSON.stringify({ found: true, descriptor: desc }), { status: 200 }),
    );
    const out = await fetchPortalDescriptor(a);
    expect(out).toEqual(desc);
    // Cache should now have it.
    expect(await readDescriptor<PortalDescriptor>(a)).toEqual(desc);
  });

  it('falls back to cache on 5xx', async () => {
    const a = addr();
    const desc = baseDescriptor(a);
    await writeDescriptor(a, desc);
    (globalThis.fetch as Mock).mockResolvedValueOnce(new Response('boom', { status: 502 }));
    const out = await fetchPortalDescriptor(a);
    expect(out).toEqual(desc);
  });

  it('falls back to cache on fetch throw (network unreachable)', async () => {
    const a = addr();
    const desc = baseDescriptor(a);
    await writeDescriptor(a, desc);
    (globalThis.fetch as Mock).mockRejectedValueOnce(new TypeError('NetworkError'));
    const out = await fetchPortalDescriptor(a);
    expect(out).toEqual(desc);
  });

  it('throws on 5xx with no cache', async () => {
    const a = addr();
    (globalThis.fetch as Mock).mockResolvedValueOnce(new Response('boom', { status: 502 }));
    await expect(fetchPortalDescriptor(a)).rejects.toThrow(/502/);
  });

  it('rethrows on network failure with no cache', async () => {
    const a = addr();
    (globalThis.fetch as Mock).mockRejectedValueOnce(new TypeError('NetworkError'));
    await expect(fetchPortalDescriptor(a)).rejects.toThrow(/NetworkError/);
  });

  it('returns null on 404 even when a stale entry exists (no stale-masking)', async () => {
    const a = addr();
    await writeDescriptor(a, baseDescriptor(a));
    (globalThis.fetch as Mock).mockResolvedValueOnce(new Response('not found', { status: 404 }));
    expect(await fetchPortalDescriptor(a)).toBeNull();
  });
});

describe('fetchPortalPages with cache', () => {
  it('writes through on success and serves from cache on 5xx', async () => {
    const a = addr();
    const desc = baseDescriptor(a);
    const pages = [
      { path: '/', title: 'Home', sortOrder: 0 },
      { path: '/about', title: 'About', sortOrder: 1 },
    ];
    (globalThis.fetch as Mock).mockResolvedValueOnce(
      new Response(JSON.stringify({ pages }), { status: 200 }),
    );
    expect(await fetchPortalPages(desc)).toEqual(pages);

    // Now 5xx — should serve from cache.
    (globalThis.fetch as Mock).mockResolvedValueOnce(new Response('', { status: 500 }));
    expect(await fetchPortalPages(desc)).toEqual(pages);
  });

  it('returns [] on 404 (no cache write)', async () => {
    const a = addr();
    const desc = baseDescriptor(a);
    (globalThis.fetch as Mock).mockResolvedValueOnce(new Response('', { status: 404 }));
    expect(await fetchPortalPages(desc)).toEqual([]);
    expect(await readPages(a)).toBeNull();
  });

  it('returns null without a network call when descriptor has no origin', async () => {
    const desc: PortalDescriptor = {
      portal: { name: 'no-origin.global.portal', displayTitle: 'X' },
      capabilities: [],
    };
    expect(await fetchPortalPages(desc)).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe('fetchPortalPage with cache', () => {
  it('writes through on success', async () => {
    const a = addr();
    const desc = baseDescriptor(a);
    (globalThis.fetch as Mock).mockResolvedValueOnce(
      new Response(JSON.stringify({ kind: 'page', html: '<h1>hi</h1>', title: 'Hi' }), { status: 200 }),
    );
    const page = await fetchPortalPage(desc, '/');
    expect(page).toEqual({ html: '<h1>hi</h1>', title: 'Hi' });
    expect(await readPage(a, '/')).toEqual({ html: '<h1>hi</h1>', title: 'Hi' });
  });

  it('serves from cache on network throw', async () => {
    const a = addr();
    const desc = baseDescriptor(a);
    await writePage(a, '/', { html: '<p>cached</p>', title: 'C' });
    (globalThis.fetch as Mock).mockRejectedValueOnce(new TypeError('NetworkError'));
    const page = await fetchPortalPage(desc, '/');
    expect(page).toEqual({ html: '<p>cached</p>', title: 'C' });
  });

  it('returns null on a real 404 even when stale cache exists', async () => {
    const a = addr();
    const desc = baseDescriptor(a);
    await writePage(a, '/gone', { html: '<p>was here</p>', title: 'Old' });
    (globalThis.fetch as Mock).mockResolvedValueOnce(new Response('', { status: 404 }));
    expect(await fetchPortalPage(desc, '/gone')).toBeNull();
  });

  it('caches each path independently', async () => {
    const a = addr();
    const desc = baseDescriptor(a);
    (globalThis.fetch as Mock)
      .mockResolvedValueOnce(new Response(JSON.stringify({ kind: 'page', html: 'A', title: null }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ kind: 'page', html: 'B', title: null }), { status: 200 }));
    await fetchPortalPage(desc, '/');
    await fetchPortalPage(desc, '/about');
    expect((await readPage(a, '/') as { html: string }).html).toBe('A');
    expect((await readPage(a, '/about') as { html: string }).html).toBe('B');
  });
});

// Staleness callback contract — feeds the "Offline · showing cached copy"
// banner in PortalPageScreen. Fires when (and only when) the result came
// from cache because the network call failed.
describe('onCacheHit callback', () => {
  it('does NOT fire on a fresh 200 response', async () => {
    const a = addr();
    const desc = baseDescriptor(a);
    (globalThis.fetch as Mock).mockResolvedValueOnce(
      new Response(JSON.stringify({ kind: 'page', html: 'fresh', title: null }), { status: 200 }),
    );
    const onCacheHit = vi.fn();
    await fetchPortalPage(desc, '/', onCacheHit);
    expect(onCacheHit).not.toHaveBeenCalled();
  });

  it('fires when a 5xx falls back to cache', async () => {
    const a = addr();
    const desc = baseDescriptor(a);
    await writePage(a, '/', { html: 'cached', title: null });
    (globalThis.fetch as Mock).mockResolvedValueOnce(new Response('', { status: 502 }));
    const onCacheHit = vi.fn();
    await fetchPortalPage(desc, '/', onCacheHit);
    expect(onCacheHit).toHaveBeenCalledTimes(1);
  });

  it('fires when a network throw falls back to cache', async () => {
    const a = addr();
    const desc = baseDescriptor(a);
    await writePage(a, '/', { html: 'cached', title: null });
    (globalThis.fetch as Mock).mockRejectedValueOnce(new TypeError('NetworkError'));
    const onCacheHit = vi.fn();
    await fetchPortalPage(desc, '/', onCacheHit);
    expect(onCacheHit).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire when the network throws and there is no cache', async () => {
    const a = addr();
    const desc = baseDescriptor(a);
    (globalThis.fetch as Mock).mockRejectedValueOnce(new TypeError('NetworkError'));
    const onCacheHit = vi.fn();
    await expect(fetchPortalPage(desc, '/', onCacheHit)).rejects.toThrow();
    expect(onCacheHit).not.toHaveBeenCalled();
  });

  it('fetchPortalPages also exposes onCacheHit', async () => {
    const a = addr();
    const desc = baseDescriptor(a);
    await writePages(a, [{ path: '/', title: 'Home', sortOrder: 0 }]);
    (globalThis.fetch as Mock).mockRejectedValueOnce(new TypeError('NetworkError'));
    const onCacheHit = vi.fn();
    const out = await fetchPortalPages(desc, onCacheHit);
    expect(out).toEqual([{ path: '/', title: 'Home', sortOrder: 0 }]);
    expect(onCacheHit).toHaveBeenCalledTimes(1);
  });
});
