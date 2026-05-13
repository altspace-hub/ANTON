/**
 * portals-page-fetch.test.ts — coverage for the new page-fetch primitives
 * (`fetchPortalPage` + `fetchPortalPages`) that point at the publisher's
 * ANTON, not the relay.
 *
 * The page-fetch path is what lets the Comm App render portal HTML
 * inside an in-app sandbox (the "window" the user asked for). It joins
 * `descriptor.portal.originEndpoint` with `/api/portals/visit/...` which
 * is the existing route on the publisher's ANTON. Tests verify URL
 * construction + the three failure modes:
 *   - no originEndpoint → null (descriptor doesn't declare a surface)
 *   - 404               → null (page not found / portal has no pages)
 *   - 5xx / network     → throws (caller surfaces "Publisher offline")
 */
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import {
  fetchPortalPage,
  fetchPortalPages,
  type PortalDescriptor,
} from '../services/portals';

function descriptor(over: Partial<PortalDescriptor['portal']> = {}): PortalDescriptor {
  return {
    portal: {
      name: 'dog-sitter-sthlm.global.portal',
      namespace: 'global',
      displayTitle: 'Dog Sitter STHLM',
      contactHash: 'ANTON-XXXX-XXXX-XXXX-XXXX',
      publicKey: 'a'.repeat(64),
      originEndpoint: 'https://publisher.example.com',
      ...over,
    },
    capabilities: [],
  };
}

beforeEach(() => {
  (globalThis.fetch as unknown as Mock | undefined)?.mockReset?.();
  globalThis.fetch = vi.fn() as unknown as typeof fetch;
});

describe('fetchPortalPage', () => {
  it('returns null when descriptor has no originEndpoint', async () => {
    const d = descriptor({ originEndpoint: undefined });
    const out = await fetchPortalPage(d, '/');
    expect(out).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('builds the right URL, encoding the address + path', async () => {
    (globalThis.fetch as Mock).mockResolvedValueOnce(
      new Response(JSON.stringify({ kind: 'page', html: '<h1>hi</h1>', title: 'Home' }), { status: 200 }),
    );
    const out = await fetchPortalPage(descriptor(), '/about');
    expect(out).toEqual({ html: '<h1>hi</h1>', title: 'Home' });
    const calledUrl = (globalThis.fetch as Mock).mock.calls[0]?.[0] as string;
    expect(calledUrl).toBe(
      'https://publisher.example.com/api/portals/visit/dog-sitter-sthlm.global.portal/page?path=%2Fabout',
    );
  });

  it('strips trailing slashes from originEndpoint', async () => {
    (globalThis.fetch as Mock).mockResolvedValueOnce(
      new Response(JSON.stringify({ kind: 'page', html: '<p>ok</p>', title: null }), { status: 200 }),
    );
    await fetchPortalPage(descriptor({ originEndpoint: 'https://publisher.example.com/' }), '/');
    const calledUrl = (globalThis.fetch as Mock).mock.calls[0]?.[0] as string;
    expect(calledUrl.startsWith('https://publisher.example.com/api/portals/visit/')).toBe(true);
  });

  it('defaults empty path to "/"', async () => {
    (globalThis.fetch as Mock).mockResolvedValueOnce(
      new Response(JSON.stringify({ kind: 'page', html: '', title: null }), { status: 200 }),
    );
    await fetchPortalPage(descriptor(), '');
    const calledUrl = (globalThis.fetch as Mock).mock.calls[0]?.[0] as string;
    expect(calledUrl.endsWith('path=%2F')).toBe(true);
  });

  it('returns null on 404', async () => {
    (globalThis.fetch as Mock).mockResolvedValueOnce(new Response('', { status: 404 }));
    const out = await fetchPortalPage(descriptor(), '/missing');
    expect(out).toBeNull();
  });

  it('returns null when body kind is not "page"', async () => {
    (globalThis.fetch as Mock).mockResolvedValueOnce(
      new Response(JSON.stringify({ kind: 'asset' }), { status: 200 }),
    );
    const out = await fetchPortalPage(descriptor(), '/');
    expect(out).toBeNull();
  });

  it('throws on 503 (publisher offline)', async () => {
    (globalThis.fetch as Mock).mockResolvedValueOnce(new Response('', { status: 503 }));
    await expect(fetchPortalPage(descriptor(), '/')).rejects.toThrow(/Page fetch failed \(503\)/);
  });

  it('throws on 500', async () => {
    (globalThis.fetch as Mock).mockResolvedValueOnce(new Response('', { status: 500 }));
    await expect(fetchPortalPage(descriptor(), '/')).rejects.toThrow(/Page fetch failed \(500\)/);
  });
});

describe('fetchPortalPages', () => {
  it('returns null when descriptor has no originEndpoint', async () => {
    const out = await fetchPortalPages(descriptor({ originEndpoint: undefined }));
    expect(out).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('returns the pages list on 200', async () => {
    const pages = [
      { path: '/', title: 'Home', sortOrder: 0 },
      { path: '/about', title: 'About', sortOrder: 1 },
    ];
    (globalThis.fetch as Mock).mockResolvedValueOnce(
      new Response(JSON.stringify({ pages }), { status: 200 }),
    );
    const out = await fetchPortalPages(descriptor());
    expect(out).toEqual(pages);
  });

  it('hits the right URL', async () => {
    (globalThis.fetch as Mock).mockResolvedValueOnce(
      new Response(JSON.stringify({ pages: [] }), { status: 200 }),
    );
    await fetchPortalPages(descriptor());
    const calledUrl = (globalThis.fetch as Mock).mock.calls[0]?.[0] as string;
    expect(calledUrl).toBe(
      'https://publisher.example.com/api/portals/visit/dog-sitter-sthlm.global.portal/pages',
    );
  });

  it('returns [] on 404', async () => {
    (globalThis.fetch as Mock).mockResolvedValueOnce(new Response('', { status: 404 }));
    const out = await fetchPortalPages(descriptor());
    expect(out).toEqual([]);
  });

  it('returns [] when body has no pages field', async () => {
    (globalThis.fetch as Mock).mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 }),
    );
    const out = await fetchPortalPages(descriptor());
    expect(out).toEqual([]);
  });

  it('throws on 503', async () => {
    (globalThis.fetch as Mock).mockResolvedValueOnce(new Response('', { status: 503 }));
    await expect(fetchPortalPages(descriptor())).rejects.toThrow(/Pages list failed \(503\)/);
  });
});
