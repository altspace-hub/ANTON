/**
 * url-fetcher.ts
 * Fetches a URL and returns clean, readable plain text (Knowledge Source Mode 2,
 * "Online References"). Uses Node's built-in fetch (Node 18+).
 *
 * Egress safety — every request goes through the shared DNS-resolving guard
 * (server/lib/ssrf-guard.ts) BEFORE it is made, and redirects are followed by
 * hand (`redirect: 'manual'`) so every hop is guarded before it is requested.
 * The old regex hostname list is gone: it missed bracketed IPv6 literals,
 * IPv4-mapped hex forms, CGNAT, and any hostname that merely resolves to a
 * private address (`localtest.me`).
 *
 * Bounded reading — the body is streamed and cut at MAX_BODY_BYTES (a declared
 * Content-Length above the cap is honoured as an early truncation signal, and a
 * running byte counter cuts an undeclared or lying one), so a large page costs
 * at most ~2 MB of memory instead of the whole response.
 *
 * EUR-Lex — the host answers every automated request with a bot check ("verify
 * that you're not a robot", HTTP 202), never the act. A EUR-Lex link that names
 * an act (CELEX or ELI) is read from the EU Publications Office instead, which
 * serves the same Official Journal text; any other bot-check page is an error,
 * not 26 words of "JavaScript is disabled" passed to the model as the source.
 */

import { URL } from 'url';
import { assertSafeEgressUrl } from '../lib/ssrf-guard.js';
import { estimateTokens } from './token-estimator.js';

/** Whole-operation budget: guard + every redirect hop + body read. */
export const FETCH_TIMEOUT_MS = 15_000;
/** Hard ceiling on extracted text per URL (~50k tokens). */
export const MAX_CHARS = 200_000;
/** Hard ceiling on bytes read from a response body; anything beyond is cut, never buffered. */
export const MAX_BODY_BYTES = 2 * 1024 * 1024;
/** Redirect hops followed before giving up (each hop is guarded before it is requested). */
export const MAX_REDIRECT_HOPS = 5;
/** Characters returned in `summary` mode. */
export const SUMMARY_CHARS = 5_000;

const TRUNCATION_NOTE = '\n\n[...content truncated]';
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const GUARD_LABEL = 'Online reference';

const REQUEST_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; openEXPERT/1.0; +local)',
  'Accept': 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
};

/** EUR-Lex language codes (legal-content/<XX>/) to the Publications Office's. */
const EU_LANGUAGES: Readonly<Record<string, string>> = {
  BG: 'bul', CS: 'ces', DA: 'dan', DE: 'deu', EL: 'ell', EN: 'eng', ES: 'spa', ET: 'est',
  FI: 'fin', FR: 'fra', GA: 'gle', HR: 'hrv', HU: 'hun', IT: 'ita', LT: 'lit', LV: 'lav',
  MT: 'mlt', NL: 'nld', PL: 'pol', PT: 'por', RO: 'ron', SK: 'slk', SL: 'slv', SV: 'swe',
};
const ELI_TYPES: Readonly<Record<string, string>> = { reg: 'R', dir: 'L', dec: 'D' };

/**
 * The Publications Office address of the act a EUR-Lex link names, or null.
 * `…/legal-content/SV/TXT/HTML/?uri=CELEX:32024R1624` → …/resource/celex/32024R1624
 * in Swedish; `…/eli/reg/2016/679/oj` → 32016R0679. The act is asked for as
 * XHTML in a language: without Accept-Language some acts answer 400.
 */
export function eurLexSource(rawUrl: string): { url: string; language: string } | null {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  if (u.hostname !== 'eur-lex.europa.eu' && u.hostname !== 'www.eur-lex.europa.eu') return null;
  const byCelex = (u.searchParams.get('uri') ?? '').match(/^CELEX:([0-9A-Z()-]+)$/i);
  const byEli = u.pathname.match(/^\/eli\/(reg|dir|dec)\/(\d{4})\/(\d{1,4})(?:\/|$)/i);
  const celex = byCelex
    ? byCelex[1].toUpperCase()
    : byEli ? `3${byEli[2]}${ELI_TYPES[byEli[1].toLowerCase()]}${byEli[3].padStart(4, '0')}` : null;
  if (!celex) return null;
  const two = u.pathname.match(/\/legal-content\/([A-Z]{2})\//i)?.[1].toUpperCase();
  const three = u.pathname.match(/\/oj\/([a-z]{3})\/?$/i)?.[1].toLowerCase();
  const language = (two ? EU_LANGUAGES[two] : undefined)
    ?? (three && Object.values(EU_LANGUAGES).includes(three) ? three : 'eng');
  return { url: `https://publications.europa.eu/resource/celex/${encodeURIComponent(celex)}`, language };
}

/** A bot check served in place of the page (EUR-Lex's WAF, Cloudflare and the like). */
const BOT_CHECK = /verify (?:that )?you(?:'|’)?re not a robot|awsWafCookieDomainList|checking your browser before accessing|enable javascript and cookies to continue/i;
/** A real page that merely mentions one of those phrases is longer than this. */
const BOT_CHECK_MAX_WORDS = 200;

function botCheckError(host: string): string {
  if (host === 'eur-lex.europa.eu' || host === 'www.eur-lex.europa.eu') {
    return 'EUR-Lex answered with a bot check instead of the page. Link the act by its CELEX number '
      + '(https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1624) or its ELI, and it is read '
      + 'from the EU Publications Office instead.';
  }
  return 'The site answered with a bot check instead of the page; paste the text or upload the document instead.';
}

/**
 * Parse + scheme check only (no DNS). Returns an error string or null.
 * Kept separate from the guard so a malformed or `file:` URL fails fast with a
 * clear message and never reaches DNS.
 */
function checkScheme(rawUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return 'Invalid URL format';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return `Unsupported protocol: ${parsed.protocol}`;
  }
  return null;
}

/** DNS-resolving egress guard. Returns an error string or null. */
async function checkEgress(rawUrl: string): Promise<string | null> {
  try {
    await assertSafeEgressUrl(rawUrl, GUARD_LABEL);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : 'Fetching from this address is not allowed';
  }
}

/** Drain-free discard of a response body we will not read (redirects, error statuses). */
async function discardBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // nothing to release
  }
}

interface BoundedBody {
  bytes: Uint8Array;
  /** True when the body was cut at MAX_BODY_BYTES (declared or observed). */
  truncated: boolean;
}

/**
 * Read at most `cap` bytes of the body. Chunks are consumed from the stream and
 * the reader is cancelled the moment the cap is crossed, so the remainder of a
 * large body is never received into memory.
 */
async function readBounded(response: Response, cap: number): Promise<BoundedBody> {
  const declaredHeader = response.headers.get('content-length');
  const declared = declaredHeader ? Number(declaredHeader) : Number.NaN;
  let truncated = Number.isFinite(declared) && declared > cap;

  const body = response.body;
  if (!body) {
    // No stream (empty or synthetic response): bound the buffered form instead.
    const buf = new Uint8Array(await response.arrayBuffer());
    if (buf.byteLength > cap) return { bytes: buf.subarray(0, cap), truncated: true };
    return { bytes: buf, truncated };
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value || value.byteLength === 0) continue;
    const room = cap - received;
    if (value.byteLength > room) {
      // Crossing the cap: keep what fits, cut the rest, and stop pulling.
      if (room > 0) chunks.push(value.subarray(0, room));
      received = cap;
      truncated = true;
      await reader.cancel().catch(() => undefined);
      break;
    }
    chunks.push(value);
    received += value.byteLength;
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes, truncated };
}

/** Decode with the charset the server declared, falling back to UTF-8 for unknown labels. */
function decodeBody(bytes: Uint8Array, contentType: string): string {
  const charset = /charset=["']?([\w.:-]+)/i.exec(contentType)?.[1];
  if (charset) {
    try {
      return new TextDecoder(charset).decode(bytes);
    } catch {
      // unknown label — fall through to UTF-8
    }
  }
  return new TextDecoder('utf-8').decode(bytes);
}

/**
 * Strip HTML tags and decode common entities, producing clean plain text.
 */
function htmlToText(html: string): string {
  return html
    // Remove <head> (title/meta/link — the title is captured separately) and <style>/<script> blocks entirely
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    // Remove nav/footer/header noise
    .replace(/<(nav|header|footer)[^>]*>[\s\S]*?<\/\1>/gi, '')
    // Convert block elements to newlines
    .replace(/<\/(p|div|li|tr|h[1-6]|br|blockquote)>/gi, '\n')
    // Strip all remaining tags
    .replace(/<[^>]+>/g, ' ')
    // Decode entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    // Collapse whitespace
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface FetchResult {
  url: string;
  text: string;
  title?: string;
  wordCount: number;
  tokenEstimate: number;
  error?: string;
  /** URL that actually served the content after guarded redirects (absent on error). */
  finalUrl?: string;
  /** True when the body was cut at MAX_BODY_BYTES or the text at MAX_CHARS. */
  truncated?: boolean;
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Fetch a URL and return clean text. Never throws — errors are returned in
 * the result's `error` field so the caller can decide how to handle them.
 */
export async function fetchUrl(url: string, mode: 'full' | 'summary' = 'full'): Promise<FetchResult> {
  const schemeError = checkScheme(url);
  if (schemeError) return makeError(url, schemeError);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const eurLex = eurLexSource(url);
  const headers: Record<string, string> = eurLex
    ? { ...REQUEST_HEADERS, Accept: 'application/xhtml+xml', 'Accept-Language': eurLex.language }
    : REQUEST_HEADERS;

  try {
    let current = eurLex?.url ?? url;
    let response: Response | undefined;

    for (let hop = 0; ; hop++) {
      // Guard EVERY hop before it is requested — the first one and each redirect target.
      const egressError = await checkEgress(current);
      if (egressError) {
        return makeError(url, hop === 0 ? `Blocked: ${egressError}` : `Redirect blocked: ${egressError}`);
      }

      const candidate = await fetch(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers,
      });

      const location = candidate.headers.get('location');
      if (REDIRECT_STATUSES.has(candidate.status) && location) {
        await discardBody(candidate);
        if (hop >= MAX_REDIRECT_HOPS) {
          return makeError(url, `Too many redirects (more than ${MAX_REDIRECT_HOPS})`);
        }
        let next: string;
        try {
          next = new URL(location, current).toString();
        } catch {
          return makeError(url, 'Redirect blocked: target is not a valid URL');
        }
        const nextSchemeError = checkScheme(next);
        if (nextSchemeError) return makeError(url, `Redirect blocked: ${nextSchemeError}`);
        current = next;
        continue;
      }

      response = candidate;
      break;
    }

    if (!response.ok) {
      await discardBody(response);
      return makeError(url, `HTTP ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    const body = await readBounded(response, MAX_BODY_BYTES);
    const raw = decodeBody(body.bytes, contentType);

    const isHtml = contentType.includes('text/html') || contentType.includes('application/xhtml');
    const rawText = isHtml ? htmlToText(raw) : raw;
    const titleMatch = isHtml ? raw.match(/<title[^>]*>([^<]+)<\/title>/i) : null;
    const title = titleMatch ? titleMatch[1].trim() : undefined;
    if (countWords(rawText) < BOT_CHECK_MAX_WORDS && BOT_CHECK.test(raw)) {
      return makeError(url, botCheckError(new URL(current).hostname));
    }

    const cutAtChars = rawText.length > MAX_CHARS;
    const truncated = cutAtChars || body.truncated;
    const text = cutAtChars ? rawText.slice(0, MAX_CHARS) + TRUNCATION_NOTE
      : body.truncated ? rawText + TRUNCATION_NOTE
      : rawText;

    if (mode === 'summary') {
      const summary = text.slice(0, SUMMARY_CHARS);
      return {
        url,
        finalUrl: current,
        text: summary,
        title,
        wordCount: countWords(summary),
        tokenEstimate: estimateTokens(summary),
        truncated: truncated || text.length > SUMMARY_CHARS,
      };
    }

    return {
      url,
      finalUrl: current,
      text,
      title,
      wordCount: countWords(text),
      tokenEstimate: estimateTokens(text),
      truncated,
    };
  } catch (err) {
    const msg = err instanceof Error
      ? (err.name === 'AbortError' ? 'Request timed out' : err.message)
      : 'Unknown fetch error';
    return makeError(url, msg);
  } finally {
    clearTimeout(timer);
  }
}

function makeError(url: string, message: string): FetchResult {
  return { url, text: '', wordCount: 0, tokenEstimate: 0, error: message };
}
