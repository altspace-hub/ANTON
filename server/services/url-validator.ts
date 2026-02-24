import { URL } from 'url';

// Allowed protocols for external URL fetching
const ALLOWED_PROTOCOLS = ['http:', 'https:'];

// Block access to private IP ranges and cloud metadata endpoints (SSRF protection)
const BLOCKED_HOSTS = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '169.254.169.254', // AWS metadata endpoint
  'metadata.google.internal', // GCP metadata
  'fd00::', // IPv6 ULA
  '::1', // IPv6 localhost
];

// Private IP ranges (CIDR notation check would be more robust, but this is a good start)
const PRIVATE_IP_PATTERNS = [
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^fc00:/,
  /^fe80:/,
];

export interface UrlValidationResult {
  valid: boolean;
  error?: string;
  url?: URL;
}

/**
 * Validate user-provided URLs for SSRF protection.
 * Prevents access to:
 * - Non-HTTP(S) protocols (file://, gopher://, etc.)
 * - localhost / loopback addresses
 * - Private IP ranges (RFC 1918)
 * - Cloud metadata endpoints
 */
export function validateUrl(urlString: string): UrlValidationResult {
  try {
    const url = new URL(urlString);

    // Check protocol
    if (!ALLOWED_PROTOCOLS.includes(url.protocol)) {
      return {
        valid: false,
        error: `Protocol ${url.protocol} not allowed. Only HTTP and HTTPS are permitted.`,
      };
    }

    // Check blocked hosts (exact match)
    const hostname = url.hostname.toLowerCase();
    if (BLOCKED_HOSTS.includes(hostname)) {
      return {
        valid: false,
        error: 'Access to local resources is not permitted for security reasons.',
      };
    }

    // Check private IP ranges
    for (const pattern of PRIVATE_IP_PATTERNS) {
      if (pattern.test(hostname)) {
        return {
          valid: false,
          error: 'Access to private IP addresses is not permitted for security reasons.',
        };
      }
    }

    return { valid: true, url };
  } catch (e) {
    return {
      valid: false,
      error: 'Invalid URL format. Please provide a valid HTTP or HTTPS URL.',
    };
  }
}

/**
 * Validate and sanitize a list of URLs
 */
export function validateUrls(urls: string[]): { valid: string[]; invalid: Array<{ url: string; error: string }> } {
  const valid: string[] = [];
  const invalid: Array<{ url: string; error: string }> = [];

  for (const url of urls) {
    const result = validateUrl(url);
    if (result.valid) {
      valid.push(url);
    } else {
      invalid.push({ url, error: result.error || 'Unknown validation error' });
    }
  }

  return { valid, invalid };
}
