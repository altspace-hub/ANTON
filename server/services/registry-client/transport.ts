/**
 * transport.ts — HTTP transport wrapper for the registry client.
 *
 * Native fetch() + AbortSignal.timeout(). Maps Registry Protocol §8.5
 * error codes to typed RegistryError. Exponential backoff for retryable
 * failures (5xx, 429 with Retry-After).
 */

import { childLogger } from '../../lib/logger.js';
import { RegistryError, type RegistryResponseBody } from './types.js';

const log = childLogger('registry-transport');

// ── Configuration ──────────────────────────────────────────────────────────

export interface TransportConfig {
  /** Base URL of the registry, e.g. "https://registry.anton.space/v1". */
  baseUrl: string;
  /** Per-request timeout. Defaults to 10s. */
  timeoutMs?: number;
  /** Max retries on retryable errors. Defaults to 3. */
  maxRetries?: number;
  /** Inject a fetch impl for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RETRIES = 3;

// ── Backoff: exponential with jitter ──────────────────────────────────────
// Reads (resolve, search, sth) keep the 16-min cap — they're idempotent and
// the user usually isn't blocking on them. Writes (operations) cap at 30s
// total because a 14-minute hang on "Register portal" is user-hostile.

const READ_BACKOFF_CAP_MS = 16 * 60 * 1000;
const WRITE_BACKOFF_CAP_MS = 30 * 1000;

/** Returns ms to wait before retry attempt N (1-indexed). */
export function backoffMs(attempt: number, kind: 'read' | 'write' = 'read'): number {
  const cap = kind === 'write' ? WRITE_BACKOFF_CAP_MS : READ_BACKOFF_CAP_MS;
  const base = Math.min(Math.pow(2, attempt) * (kind === 'write' ? 1000 : 60 * 1000), cap);
  const jitter = Math.random() * 0.3 * base;
  return Math.min(base + jitter, cap);
}

// ── Public API ─────────────────────────────────────────────────────────────

export interface TransportClient {
  postSignedEnvelope<T>(path: string, body: unknown): Promise<T>;
  get<T>(path: string, query?: Record<string, string | number | undefined>): Promise<T>;
}

export function createTransport(config: TransportConfig): TransportClient {
  const fetchImpl = config.fetchImpl ?? fetch;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;

  function url(path: string, query?: Record<string, string | number | undefined>): string {
    const u = new URL(config.baseUrl.replace(/\/$/, '') + path);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined) u.searchParams.set(k, String(v));
      }
    }
    return u.toString();
  }

  async function execute<T>(req: () => Promise<Response>, kind: 'read' | 'write'): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const res = await req();
        const text = await res.text();
        let body: RegistryResponseBody<T>;
        try {
          body = text ? JSON.parse(text) : { status: 'error', error: { code: 'E_EMPTY_RESPONSE', message: 'Empty response body' } };
        } catch {
          throw new RegistryError('E_INVALID_RESPONSE', 'Registry returned non-JSON response', res.status);
        }

        if (body.status === 'ok') {
          return body.data;
        }

        // Error envelope.
        const err = new RegistryError(
          body.error.code,
          body.error.message,
          res.status,
          body.error.details,
        );

        // Honour Retry-After on 429.
        if (res.status === 429) {
          const retryAfter = res.headers.get('Retry-After');
          if (retryAfter) {
            const seconds = Number(retryAfter);
            if (Number.isFinite(seconds) && seconds > 0 && attempt < maxRetries) {
              await sleep(seconds * 1000);
              lastErr = err;
              continue;
            }
          }
        }

        if (err.isRetryable && attempt < maxRetries) {
          const wait = backoffMs(attempt + 1, kind);
          log.warn({ code: err.code, httpStatus: err.httpStatus, attempt: attempt + 1, retryInMs: wait, kind }, 'registry retry');
          await sleep(wait);
          lastErr = err;
          continue;
        }
        log.error({ code: err.code, httpStatus: err.httpStatus }, 'registry call failed (non-retryable)');
        throw err;
      } catch (e) {
        if (e instanceof RegistryError) throw e;
        if (attempt < maxRetries) {
          const wait = backoffMs(attempt + 1, kind);
          log.warn({ err: e instanceof Error ? e.message : String(e), attempt: attempt + 1, retryInMs: wait, kind }, 'registry transport error, retrying');
          await sleep(wait);
          lastErr = e;
          continue;
        }
        log.error({ err: e instanceof Error ? e.message : String(e) }, 'registry transport exhausted retries');
        throw new RegistryError(
          'E_TRANSPORT',
          e instanceof Error ? e.message : 'Transport error',
          0,
        );
      }
    }
    throw lastErr instanceof Error
      ? lastErr
      : new RegistryError('E_TRANSPORT', 'Exhausted retries', 0);
  }

  return {
    async postSignedEnvelope<T>(path: string, body: unknown) {
      // Writes use the short-cap backoff (max ~30s total) — failing fast
      // is a better UX than holding the user's "Register portal" click
      // open for 14 minutes.
      return execute<T>(() =>
        fetchImpl(url(path), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'User-Agent': userAgent() },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        }),
        'write',
      );
    },

    async get<T>(path: string, query?: Record<string, string | number | undefined>) {
      return execute<T>(() =>
        fetchImpl(url(path, query), {
          method: 'GET',
          headers: { Accept: 'application/json', 'User-Agent': userAgent() },
          signal: AbortSignal.timeout(timeoutMs),
        }),
        'read',
      );
    },
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

function userAgent(): string {
  // Per Protocol §12.2.
  return 'ANTON/0.7.5 RegistryProtocol/1.0.0';
}
