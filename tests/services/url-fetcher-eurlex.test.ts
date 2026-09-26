/**
 * url-fetcher-eurlex.test.ts — Online References and EUR-Lex.
 *
 * EUR-Lex answers every automated request with a bot check ("verify that
 * you're not a robot", HTTP 202). The fetcher took that page as a successful
 * 26-word reference, so a run "grounded" in the AMLR was given the bot check
 * as its source, and /api/eurlex/validate-pack checked packs against it (live
 * check 2026-09-25). A EUR-Lex link that names an act (CELEX or ELI) is now
 * read from the EU Publications Office, which serves the same Official Journal
 * text; a bot-check page from any site is an error.
 *
 * DNS and fetch are mocked — nothing here touches the network.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { lookupMock } = vi.hoisted(() => ({ lookupMock: vi.fn() }));
vi.mock('node:dns/promises', () => ({ lookup: lookupMock }));

import { fetchUrl, eurLexSource, euActArticlesFirst } from '../../server/services/url-fetcher';

type FetchFn = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
const fetchMock = vi.fn<FetchFn>();
const PUBLIC = [{ address: '93.184.216.34', family: 4 }];

const BOT_CHECK_PAGE = '<html><head><title></title></head><body><noscript>JavaScript is disabled. In order to continue, '
  + 'we need to verify that you\'re not a robot. This requires JavaScript. Enable JavaScript and then reload the page.'
  + '</noscript><script>window.awsWafCookieDomainList = [];</script></body></html>';
const ACT_XHTML = '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>L_202401624EN.000101.fmx.xml</title></head><body>'
  + '<p class="oj-ti-art">Article 10</p><p class="oj-sti-art">Business-wide risk assessment</p>'
  + '<p class="oj-normal">Obliged entities shall take appropriate measures to identify and assess the risks.</p></body></html>';

function requests(): Array<{ url: string; headers: Record<string, string> }> {
  return fetchMock.mock.calls.map(([input, init]) => ({
    url: typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url,
    headers: (init?.headers ?? {}) as Record<string, string>,
  }));
}

beforeEach(() => {
  fetchMock.mockReset();
  lookupMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  lookupMock.mockImplementation(async (host: string) => {
    if (['eur-lex.europa.eu', 'publications.europa.eu', 'example.com'].includes(host)) return PUBLIC;
    throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${host}`), { code: 'ENOTFOUND' });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('eurLexSource: the act a EUR-Lex link names', () => {
  const office = (celex: string) => `https://publications.europa.eu/resource/celex/${celex}`;

  it('reads CELEX links in any of their forms, in the link\'s language', () => {
    expect(eurLexSource('https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32024R1624'))
      .toEqual({ url: office('32024R1624'), language: 'eng' });
    expect(eurLexSource('https://eur-lex.europa.eu/legal-content/SV/TXT/?uri=CELEX%3A32024R1689'))
      .toEqual({ url: office('32024R1689'), language: 'swe' });
    expect(eurLexSource('https://www.eur-lex.europa.eu/legal-content/de/ALL/?uri=celex:32023r1114'))
      .toEqual({ url: office('32023R1114'), language: 'deu' });
  });

  it('turns an ELI into its CELEX number (regulation R, directive L, number padded to four)', () => {
    expect(eurLexSource('https://eur-lex.europa.eu/eli/reg/2016/679/oj')).toEqual({ url: office('32016R0679'), language: 'eng' });
    expect(eurLexSource('https://eur-lex.europa.eu/eli/dir/2024/1640/oj/swe')).toEqual({ url: office('32024L1640'), language: 'swe' });
  });

  it('leaves links that name no act, and every other host, alone', () => {
    expect(eurLexSource('https://eur-lex.europa.eu/search.html?text=AMLR')).toBeNull();
    expect(eurLexSource('https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=OJ:L_202401624')).toBeNull();
    expect(eurLexSource('https://example.com/?uri=CELEX:32024R1624')).toBeNull();
    expect(eurLexSource('https://eur-lex.europa.eu.evil.example/eli/reg/2016/679/oj')).toBeNull();
    expect(eurLexSource('not a url')).toBeNull();
  });
});

describe('fetchUrl on a EUR-Lex link', () => {
  it('reads the act from the Publications Office as XHTML in the link\'s language, following its redirect', async () => {
    const cellar = 'http://publications.europa.eu/resource/cellar/868bf3cf-2dd4-11ef-a61b-01aa75ed71a1.0006.03/DOC_1';
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 303, headers: { location: cellar } }))
      .mockResolvedValueOnce(new Response(ACT_XHTML, { status: 200, headers: { 'content-type': 'application/xhtml+xml;charset=UTF-8' } }));

    const r = await fetchUrl('https://eur-lex.europa.eu/legal-content/SV/TXT/HTML/?uri=CELEX:32024R1624');

    expect(r.error).toBeUndefined();
    expect(r.url).toBe('https://eur-lex.europa.eu/legal-content/SV/TXT/HTML/?uri=CELEX:32024R1624');
    expect(r.finalUrl).toBe(cellar);
    expect(r.text).toContain('Business-wide risk assessment');
    const sent = requests();
    expect(sent.map((s) => s.url)).toEqual(['https://publications.europa.eu/resource/celex/32024R1624', cellar]);
    for (const s of sent) {
      expect(s.headers.Accept).toBe('application/xhtml+xml');
      expect(s.headers['Accept-Language']).toBe('swe');
    }
  });

  it('a EUR-Lex page that names no act, answered with the bot check, is an error that says how to link it', async () => {
    fetchMock.mockResolvedValueOnce(new Response(BOT_CHECK_PAGE, { status: 202, headers: { 'content-type': 'text/html' } }));
    const r = await fetchUrl('https://eur-lex.europa.eu/search.html?text=AMLR');
    expect(r.text).toBe('');
    expect(r.error).toMatch(/bot check/);
    expect(r.error).toContain('CELEX');
  });

  it('a bot check on any other site is an error too', async () => {
    fetchMock.mockResolvedValueOnce(new Response(
      '<html><body><h1>Checking your browser before accessing example.com</h1></body></html>',
      { status: 200, headers: { 'content-type': 'text/html' } },
    ));
    const r = await fetchUrl('https://example.com/guidance');
    expect(r.text).toBe('');
    expect(r.error).toMatch(/bot check/);
  });
});

describe('negative controls: ordinary pages are untouched', () => {
  it('an ordinary URL is requested as given, with the usual headers', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html><body><p>Guidance text.</p></body></html>', { status: 200, headers: { 'content-type': 'text/html' } }));
    const r = await fetchUrl('https://example.com/guidance');
    expect(r.error).toBeUndefined();
    expect(r.text).toContain('Guidance text.');
    const [sent] = requests();
    expect(sent.url).toBe('https://example.com/guidance');
    expect(sent.headers['Accept-Language']).toBeUndefined();
    expect(sent.headers.Accept).toContain('text/html');
  });

  it('a long page that merely mentions a bot check is returned', async () => {
    const article = `<p>${'Regulators note that customers are asked to verify that you\'re not a robot on some portals. '.repeat(30)}</p>`;
    fetchMock.mockResolvedValueOnce(new Response(`<html><body>${article}</body></html>`, { status: 200, headers: { 'content-type': 'text/html' } }));
    const r = await fetchUrl('https://example.com/article');
    expect(r.error).toBeUndefined();
    expect(r.wordCount).toBeGreaterThan(200);
  });
});

// ── Long acts: the articles first ──────────────────────────────────────────────
// The fetcher keeps the first 200k characters. The AMLR runs 167k characters of
// recitals before Article 1, so a run grounded in it saw hardly an article.

const OJ_ACT = [
  '<html xmlns="http://www.w3.org/1999/xhtml"><body>',
  '<div class="eli-container" id="pbl_1"><p class="oj-doc-ti">REGULATION (EU) 2024/1624</p>',
  '<div class="eli-subdivision" id="rct_1"><p>(1) Recital one: why this exists.</p></div>',
  '<div class="eli-subdivision" id="rct_2"><p>(2) Recital two.</p></div></div>',
  '<div class="eli-subdivision" id="enc_1"><div class="eli-subdivision" id="art_1"><p class="oj-ti-art">Article 1</p>',
  '<p class="oj-normal">Subject matter.</p></div></div>',
  '<div class="eli-subdivision" id="fnp_1"><p>This Regulation shall be binding in its entirety.</p></div>',
  '<div class="eli-container"><p>ANNEX I</p><p>Indicative list of risk factors.</p></div>',
  '</body></html>',
].join('\n');

describe('euActArticlesFirst: an Official Journal act, articles first', () => {
  it('orders title, articles, final provisions and annexes, then the recitals, and says so', () => {
    const out = euActArticlesFirst(OJ_ACT);
    expect(out).not.toBeNull();
    const at = (needle: string) => out!.indexOf(needle);
    expect(at('REGULATION (EU) 2024/1624')).toBeLessThan(at('Official Journal text in this order'));
    expect(at('Official Journal text in this order')).toBeLessThan(at('Article 1'));
    expect(at('Article 1')).toBeLessThan(at('shall be binding'));
    expect(at('shall be binding')).toBeLessThan(at('ANNEX I'));
    expect(at('ANNEX I')).toBeLessThan(at('RECITALS'));
    expect(at('RECITALS')).toBeLessThan(at('Recital one'));
    // Nothing is lost.
    for (const part of ['Recital two', 'Subject matter', 'Indicative list']) expect(out).toContain(part);
  });

  it('leaves anything without that structure alone', () => {
    expect(euActArticlesFirst('<html><body><p>Guidance.</p></body></html>')).toBeNull();
    expect(euActArticlesFirst('<div id="enc_1">Article 1</div><div id="rct_1">late recital</div>')).toBeNull();
  });

  it('fetchUrl reads an act from the Publications Office articles first, space-only lines collapsed', async () => {
    fetchMock.mockResolvedValueOnce(new Response(OJ_ACT, { status: 200, headers: { 'content-type': 'application/xhtml+xml' } }));
    const r = await fetchUrl('https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1624');
    expect(r.error).toBeUndefined();
    expect(r.text.indexOf('Article 1')).toBeLessThan(r.text.indexOf('Recital one'));
    expect(r.text).not.toMatch(/\n[ \t]+\n/);
  });

  it('negative control: the same markup from another site keeps its own order', async () => {
    fetchMock.mockResolvedValueOnce(new Response(OJ_ACT, { status: 200, headers: { 'content-type': 'text/html' } }));
    const r = await fetchUrl('https://example.com/copy-of-the-act');
    expect(r.error).toBeUndefined();
    expect(r.text.indexOf('Recital one')).toBeLessThan(r.text.indexOf('Article 1'));
  });
});
