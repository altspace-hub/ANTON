/**
 * url-fetcher-ssrf.test.ts — Knowledge Source Mode 2 ("Online References") goes
 * through the DNS-resolving egress guard BEFORE every request, follows redirects
 * by hand so each hop is guarded before it is requested, streams the body under a
 * byte cap, and budgets tokens with the same tokeniser as the rest of the app.
 *
 * DNS and fetch are mocked — nothing here touches the network.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { lookupMock } = vi.hoisted(() => ({ lookupMock: vi.fn() }));
vi.mock('node:dns/promises', () => ({ lookup: lookupMock }));

import {
  fetchUrl,
  FETCH_TIMEOUT_MS,
  MAX_BODY_BYTES,
  MAX_CHARS,
  MAX_REDIRECT_HOPS,
  SUMMARY_CHARS,
} from '../../server/services/url-fetcher';
import { assertSafeEgressUrl } from '../../server/lib/ssrf-guard';
import { estimateTokens } from '../../server/services/token-estimator';

type LookupResult = { address: string; family: number };
type FetchFn = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const PUBLIC: LookupResult = { address: '93.184.216.34', family: 4 };
const fetchMock = vi.fn<FetchFn>();

/** Install a DNS table; hosts not in it fail with ENOTFOUND like the real resolver. */
function dns(table: Record<string, LookupResult[]>): void {
  lookupMock.mockImplementation(async (host: string) => {
    const hit = table[host];
    if (!hit) throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${host}`), { code: 'ENOTFOUND' });
    return hit;
  });
}

function htmlResponse(body: string): Response {
  return new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

function textResponse(body: string, extraHeaders: Record<string, string> = {}): Response {
  return new Response(body, { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8', ...extraHeaders } });
}

function redirectResponse(location: string, status = 302): Response {
  return new Response(null, { status, headers: { location } });
}

function requestedUrls(): string[] {
  return fetchMock.mock.calls.map(([input]) => (typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url));
}

beforeEach(() => {
  fetchMock.mockReset();
  lookupMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  dns({
    'example.com': [PUBLIC],
    'localtest.me': [{ address: '127.0.0.1', family: 4 }],
    'rebind.example': [PUBLIC, { address: '10.0.0.5', family: 4 }],
    'v6loop.example': [{ address: '::1', family: 6 }],
    'mapped-metadata.example': [{ address: '::ffff:169.254.169.254', family: 6 }],
    'cgnat.example': [{ address: '100.64.0.1', family: 4 }],
    'empty.example': [],
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// ── 1. The probe list: every one of these must be refused before any request ──

const REFUSED_LITERALS = [
  // bracketed IPv6 — the forms the old regex list let through
  'http://[::ffff:127.0.0.1]/',
  'http://[::ffff:169.254.169.254]/',
  'http://[::ffff:7f00:1]/',
  'http://[::ffff:a9fe:a9fe]/',
  'http://[fd00::1]/',
  'http://[fc00::1]/',
  'http://[::]/',
  'http://[::1]/',
  'http://[0:0:0:0:0:0:0:1]/',
  'http://[fe80::1]/',
  'http://[fe81::1]/',
  'http://[febf::1]/',
  'http://[fec0::1]/',
  'http://[ff02::1]/',
  'http://[::127.0.0.1]/',
  'http://[64:ff9b::7f00:1]/',
  'http://[2002:7f00:1::1]/',
  'http://[2002:a9fe:a9fe::1]/',
  // IPv4 private / CGNAT / metadata / multicast / reserved
  'http://100.64.0.1/',
  'http://100.127.255.254/',
  'http://169.254.169.254/latest/meta-data',
  'http://127.0.0.1/',
  'http://0.0.0.0/',
  'http://10.0.0.5:8080/',
  'http://172.16.0.1/',
  'http://192.168.1.1/',
  'http://224.0.0.1/',
  'http://255.255.255.255/',
  // alternative IPv4 spellings (WHATWG canonicalises them; the guard sees 127.0.0.1)
  'http://0x7f000001/',
  'http://2130706433/',
  'http://127.1/',
  'http://017700000001/',
  // localhost-family names
  'http://localhost/',
  'http://foo.localhost/',
  'http://svc.internal/',
  'http://printer.local/',
  'http://metadata.google.internal/computeMetadata/v1/',
];

describe('fetchUrl refuses private / loopback / metadata targets before any request', () => {
  it.each(REFUSED_LITERALS)('refuses %s', async (url) => {
    const result = await fetchUrl(url);
    expect(result.error, url).toMatch(/Blocked/);
    expect(result.text).toBe('');
    expect(result.tokenEstimate).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    'http://localtest.me/',           // resolves to 127.0.0.1
    'http://rebind.example/',         // one public + one private A record
    'http://v6loop.example/',         // resolves to ::1
    'http://mapped-metadata.example/', // resolves to ::ffff:169.254.169.254
    'http://cgnat.example/',          // resolves to 100.64.0.1
  ])('refuses %s because DNS resolves it to a blocked range', async (url) => {
    const result = await fetchUrl(url);
    expect(result.error, url).toMatch(/resolves to a private/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a host that does not resolve (and one that resolves to nothing)', async () => {
    expect((await fetchUrl('http://nxdomain.example/')).error).toMatch(/Cannot resolve/);
    expect((await fetchUrl('http://empty.example/')).error).toMatch(/Cannot resolve/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['ftp://example.com/', 'file:///etc/passwd', 'javascript:alert(1)', 'data:text/plain,hi', 'gopher://example.com/'])(
    'refuses non-http(s) scheme %s without touching DNS',
    async (url) => {
      const result = await fetchUrl(url);
      expect(result.error).toBeDefined();
      expect(lookupMock).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('the shared guard itself refuses a hostname that resolves to loopback', async () => {
    await expect(assertSafeEgressUrl('http://localtest.me/')).rejects.toThrow(/resolves to a private/);
    await expect(assertSafeEgressUrl('https://example.com/')).resolves.toBeUndefined();
  });
});

// ── 2. A public host is fetched — manually-redirected, guarded, tokenised ──

describe('fetchUrl on a public host', () => {
  it('fetches with redirect: manual, extracts text + title, and budgets with estimateTokens', async () => {
    fetchMock.mockResolvedValueOnce(htmlResponse('<html><head><title> Doc </title></head><body><p>Hello world</p><script>x()</script></body></html>'));

    const result = await fetchUrl('https://example.com/page');

    expect(result.error).toBeUndefined();
    expect(result.text).toBe('Hello world');
    expect(result.title).toBe('Doc');
    expect(result.finalUrl).toBe('https://example.com/page');
    expect(result.truncated).toBe(false);
    expect(result.wordCount).toBe(2);
    expect(result.tokenEstimate).toBe(estimateTokens(result.text));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: 'manual' });
    expect(lookupMock).toHaveBeenCalledWith('example.com', { all: true });
  });

  it('summary mode returns the first SUMMARY_CHARS characters with a matching token estimate', async () => {
    fetchMock.mockResolvedValueOnce(textResponse('word '.repeat(4_000)));

    const result = await fetchUrl('https://example.com/long.txt', 'summary');

    expect(result.error).toBeUndefined();
    expect(result.text.length).toBe(SUMMARY_CHARS);
    expect(result.truncated).toBe(true);
    expect(result.tokenEstimate).toBe(estimateTokens(result.text));
  });

  it('reports a non-2xx status as an error', async () => {
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 404, statusText: 'Not Found' }));
    const result = await fetchUrl('https://example.com/missing');
    expect(result.error).toBe('HTTP 404 Not Found');
  });

  it('gives up after FETCH_TIMEOUT_MS with "Request timed out"', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }));

    const pending = fetchUrl('https://example.com/slow');
    await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS + 1);
    const result = await pending;

    expect(result.error).toBe('Request timed out');
  });
});

// ── 3. Redirects: every hop is guarded BEFORE it is requested ──

describe('fetchUrl redirects', () => {
  it('follows a relative redirect to a public path', async () => {
    fetchMock
      .mockResolvedValueOnce(redirectResponse('/next', 301))
      .mockResolvedValueOnce(textResponse('landed'));

    const result = await fetchUrl('https://example.com/start');

    expect(result.error).toBeUndefined();
    expect(result.text).toBe('landed');
    expect(result.finalUrl).toBe('https://example.com/next');
    expect(requestedUrls()).toEqual(['https://example.com/start', 'https://example.com/next']);
  });

  it.each([
    'http://169.254.169.254/latest/meta-data',
    'http://[::ffff:7f00:1]/',
    'http://127.0.0.1:3001/api/settings',
    'http://100.64.0.1/',
    'http://localtest.me/',            // private only after DNS — proves the per-hop resolve
    'http://[fd00::1]/',
    'file:///etc/passwd',
    'ftp://example.com/',
  ])('refuses a redirect to %s and never requests that hop', async (location) => {
    fetchMock.mockResolvedValueOnce(redirectResponse(location));

    const result = await fetchUrl('https://example.com/start');

    expect(result.error, location).toMatch(/Redirect blocked/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requestedUrls()).toEqual(['https://example.com/start']);
  });

  it('stops after MAX_REDIRECT_HOPS hops', async () => {
    fetchMock.mockImplementation(async () => redirectResponse('/again', 302));

    const result = await fetchUrl('https://example.com/loop');

    expect(result.error).toMatch(/Too many redirects/);
    expect(fetchMock).toHaveBeenCalledTimes(MAX_REDIRECT_HOPS + 1);
  });

  it.each([301, 302, 303, 307, 308])('treats %s + Location as a redirect', async (status) => {
    fetchMock
      .mockResolvedValueOnce(redirectResponse('http://10.0.0.5/admin', status));
    const result = await fetchUrl('https://example.com/start');
    expect(result.error).toMatch(/Redirect blocked/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// ── 4. Body cap: streamed, cut, never fully buffered ──

describe('fetchUrl body cap', () => {
  it('cuts a body over MAX_BODY_BYTES while streaming and cancels the rest', async () => {
    const CHUNK = 64 * 1024;
    const TOTAL = 3 * 1024 * 1024; // 3 MiB > 2 MiB cap
    // Prose bytes, not a single repeated character: tiktoken's BPE is quadratic on
    // one giant "word", so a 200k-char run of 'a' would take ~30 s to count.
    const chunkBytes = new TextEncoder().encode('lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(CHUNK)).subarray(0, CHUNK);
    let pulled = 0;
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (pulled >= TOTAL) { controller.close(); return; }
        controller.enqueue(chunkBytes.slice());
        pulled += CHUNK;
      },
      cancel() { cancelled = true; },
    });
    fetchMock.mockResolvedValueOnce(new Response(stream, { status: 200, headers: { 'content-type': 'text/plain' } }));

    const result = await fetchUrl('https://example.com/huge.txt');

    expect(result.error).toBeUndefined();
    expect(result.truncated).toBe(true);
    expect(cancelled).toBe(true);
    // At most the cap, plus the chunk that crossed it, plus the one chunk a
    // ReadableStream pre-pulls into its queue (highWaterMark 1) — never the 3 MiB.
    expect(pulled).toBeLessThanOrEqual(MAX_BODY_BYTES + 2 * CHUNK);
    expect(pulled).toBeLessThan(TOTAL);
    // The text ceiling still applies on top of the byte cap.
    expect(result.text.endsWith('[...content truncated]')).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(MAX_CHARS + '\n\n[...content truncated]'.length);
    expect(result.tokenEstimate).toBe(estimateTokens(result.text));
  });

  it('honours a declared Content-Length above the cap as a truncation signal', async () => {
    fetchMock.mockResolvedValueOnce(textResponse('small body', { 'content-length': String(MAX_BODY_BYTES + 1) }));

    const result = await fetchUrl('https://example.com/lying.txt');

    expect(result.error).toBeUndefined();
    expect(result.truncated).toBe(true);
    expect(result.text).toBe('small body\n\n[...content truncated]');
  });

  it('leaves a body under the cap untouched', async () => {
    fetchMock.mockResolvedValueOnce(textResponse('exactly this'));
    const result = await fetchUrl('https://example.com/ok.txt');
    expect(result.text).toBe('exactly this');
    expect(result.truncated).toBe(false);
  });

  it('applies the MAX_CHARS text ceiling', async () => {
    const prose = 'word after word. '.repeat(Math.ceil((MAX_CHARS + 10) / 17)).slice(0, MAX_CHARS + 10);
    fetchMock.mockResolvedValueOnce(textResponse(prose));
    const result = await fetchUrl('https://example.com/long.txt');
    expect(result.truncated).toBe(true);
    expect(result.text.length).toBe(MAX_CHARS + '\n\n[...content truncated]'.length);
    expect(result.text.startsWith(prose.slice(0, MAX_CHARS))).toBe(true);
    expect(result.tokenEstimate).toBe(estimateTokens(result.text));
  });
});
