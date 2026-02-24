/**
 * url-fetcher.ts
 * Fetches a URL and returns clean, readable plain text.
 * Uses Node's built-in fetch (Node 18+). No external HTTP library required.
 */

import { URL } from 'url';

const FETCH_TIMEOUT_MS = 15_000;
const MAX_CHARS = 200_000; // ~50k tokens — hard ceiling per URL

// Private/loopback IP ranges that should never be fetched (SSRF prevention)
const BLOCKED_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,                        // Wildcard bind address
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,                          // Link-local / cloud metadata (AWS, Azure)
  /^metadata\.google\.internal$/i,        // GCP metadata service
  /^::1$/,
  /^fc[0-9a-f][0-9a-f]:/i,              // IPv6 ULA (fc00::/7 full range)
  /^fd[0-9a-f][0-9a-f]?[0-9a-f]?[0-9a-f]?:/i, // IPv6 ULA (fd00::/8)
  /^fe80:/i,                              // IPv6 link-local
  /^::ffff:127\./,                        // IPv4-mapped loopback
  /^::ffff:10\./,                         // IPv4-mapped private
  /^::ffff:169\.254\./,                   // IPv4-mapped link-local
  /^::ffff:192\.168\./,                   // IPv4-mapped private
];

/**
 * Validate that a hostname is not a private/loopback/metadata address.
 * Returns an error string or null if safe.
 */
function validateHostname(hostname: string): string | null {
  if (BLOCKED_HOSTNAME_PATTERNS.some((re) => re.test(hostname))) {
    return `Fetching from private/loopback addresses is not allowed`;
  }
  return null;
}

/**
 * Validate that a URL is safe to fetch:
 * - Must be http or https
 * - Must not point to private/loopback addresses
 * Returns an error string or null if valid.
 */
function validateUrl(rawUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return 'Invalid URL format';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return `Unsupported protocol: ${parsed.protocol}`;
  }
  return validateHostname(parsed.hostname.toLowerCase());
}

/**
 * Strip HTML tags and decode common entities, producing clean plain text.
 */
function htmlToText(html: string): string {
  return html
    // Remove <style> and <script> blocks entirely
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
}

/**
 * Fetch a URL and return clean text. Never throws — errors are returned in
 * the result's `error` field so the caller can decide how to handle them.
 */
export async function fetchUrl(url: string, mode: 'full' | 'summary' = 'full'): Promise<FetchResult> {
  const urlError = validateUrl(url);
  if (urlError) return makeError(url, urlError);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; openEXPERT/1.0; +local)',
        'Accept': 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
      },
    });
    clearTimeout(timer);

    if (!response.ok) {
      return makeError(url, `HTTP ${response.status} ${response.statusText}`);
    }

    // Validate the final URL after any redirects (prevents DNS rebinding / redirect-to-private)
    if (response.url && response.url !== url) {
      try {
        const finalHostname = new URL(response.url).hostname.toLowerCase();
        const redirectErr = validateHostname(finalHostname);
        if (redirectErr) return makeError(url, `Redirect blocked: ${redirectErr}`);
      } catch {
        // If we can't parse the final URL, treat it as safe (shouldn't happen)
      }
    }

    const contentType = response.headers.get('content-type') || '';
    let rawText: string;

    if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
      const html = await response.text();
      rawText = htmlToText(html);

      // Extract <title> for context
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : undefined;

      const truncated = rawText.length > MAX_CHARS
        ? rawText.slice(0, MAX_CHARS) + '\n\n[...content truncated]'
        : rawText;

      const words = truncated.split(/\s+/).filter(Boolean).length;

      if (mode === 'summary') {
        // Return first 5000 chars as "summary mode"
        const summary = truncated.slice(0, 5000);
        const summaryWords = summary.split(/\s+/).filter(Boolean).length;
        return { url, text: summary, title, wordCount: summaryWords, tokenEstimate: Math.round(summaryWords * 1.3) };
      }

      return { url, text: truncated, title, wordCount: words, tokenEstimate: Math.round(words * 1.3) };
    } else {
      // Plain text / markdown / etc.
      rawText = await response.text();
      const truncated = rawText.length > MAX_CHARS
        ? rawText.slice(0, MAX_CHARS) + '\n\n[...content truncated]'
        : rawText;
      const words = truncated.split(/\s+/).filter(Boolean).length;
      return { url, text: truncated, wordCount: words, tokenEstimate: Math.round(words * 1.3) };
    }
  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error
      ? (err.name === 'AbortError' ? 'Request timed out' : err.message)
      : 'Unknown fetch error';
    return makeError(url, msg);
  }
}

function makeError(url: string, message: string): FetchResult {
  return { url, text: '', wordCount: 0, tokenEstimate: 0, error: message };
}
