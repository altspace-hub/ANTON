/**
 * enrollment.test.ts — unit tests for the Bahnhof /enroll caller.
 *
 * Covers:
 *   - ensureEnrolled posts the right body shape on first run
 *   - return value reflects the server response
 *   - second call returns cached bearer without re-posting
 *   - endpoint change forces a re-enroll
 *   - non-200 response surfaces a descriptive error
 *   - server-returned install_id mismatch is rejected
 *   - _clearCachedBearer drops the cache
 */
import { describe, expect, it } from 'vitest';

import {
  _clearCachedBearer, ensureEnrolled,
} from '../../src/main/enrollment.js';
import { InMemoryStorageBackend } from '../../src/main/wallet/storage.js';
import { getInstallIdentity } from '../../src/main/attestation/install-keys.js';

describe('enrollment', () => {
  it('posts /enroll with platform=desktop + attestation_pubkey on first run', async () => {
    const storage = new InMemoryStorageBackend();
    const id = await getInstallIdentity(storage);
    let captured: { url: string; body: Record<string, unknown> } | null = null;
    const fetch = mkFetch((url, init) => {
      captured = { url, body: JSON.parse(String(init?.body)) };
      return jsonOk({
        install_token: 'a'.repeat(64),
        install_id: id.installId,
        issued_at: '2026-05-24T13:00:00Z',
      });
    });
    const res = await ensureEnrolled({
      storage, endpoint: 'https://rpc.test/', appVersion: '0.0.1', fetch,
    });
    expect(captured).not.toBeNull();
    expect(captured!.url).toBe('https://rpc.test/enroll');
    expect(captured!.body.install_id).toBe(id.installId);
    expect(captured!.body.app_version).toBe('0.0.1');
    expect(captured!.body.platform).toBe('desktop');
    expect(captured!.body.attestation_pubkey).toBe(id.pubHex);
    expect(res.bearerToken).toBe('a'.repeat(64));
    expect(res.installId).toBe(id.installId);
    expect(res.endpoint).toBe('https://rpc.test');  // canonical (no trailing /)
  });

  it('returns the cached bearer on the second call (no second /enroll)', async () => {
    const storage = new InMemoryStorageBackend();
    const id = await getInstallIdentity(storage);
    let calls = 0;
    const fetch = mkFetch(() => {
      calls += 1;
      return jsonOk({
        install_token: 'b'.repeat(64),
        install_id: id.installId,
        issued_at: '2026-05-24T13:00:00Z',
      });
    });
    const r1 = await ensureEnrolled({ storage, endpoint: 'https://rpc.test', fetch });
    const r2 = await ensureEnrolled({ storage, endpoint: 'https://rpc.test', fetch });
    expect(r2.bearerToken).toBe(r1.bearerToken);
    expect(calls).toBe(1);
  });

  it('re-enrolls when the endpoint changes (dev ↔ prod swap)', async () => {
    const storage = new InMemoryStorageBackend();
    const id = await getInstallIdentity(storage);
    let calls = 0;
    const fetch = mkFetch((url) => {
      calls += 1;
      return jsonOk({
        install_token: url.includes('dev') ? 'd'.repeat(64) : 'p'.repeat(64),
        install_id: id.installId,
        issued_at: '2026-05-24T13:00:00Z',
      });
    });
    const r1 = await ensureEnrolled({ storage, endpoint: 'https://dev.test', fetch });
    expect(r1.bearerToken).toBe('d'.repeat(64));
    const r2 = await ensureEnrolled({ storage, endpoint: 'https://prod.test', fetch });
    expect(r2.bearerToken).toBe('p'.repeat(64));
    expect(calls).toBe(2);
  });

  it('surfaces a non-200 with the response body in the error', async () => {
    const storage = new InMemoryStorageBackend();
    await getInstallIdentity(storage);
    const fetch = mkFetch(() => textRes(429, 'rate-limited: 5/h/IP'));
    await expect(ensureEnrolled({
      storage, endpoint: 'https://rpc.test', fetch,
    })).rejects.toThrow(/429 .* rate-limited/);
  });

  it('rejects a server response whose install_id does not match what we sent', async () => {
    const storage = new InMemoryStorageBackend();
    await getInstallIdentity(storage);
    const fetch = mkFetch(() => jsonOk({
      install_token: 'a'.repeat(64),
      install_id: '99999999-9999-9999-9999-999999999999',  // wrong
      issued_at: '2026-05-24T13:00:00Z',
    }));
    await expect(ensureEnrolled({
      storage, endpoint: 'https://rpc.test', fetch,
    })).rejects.toThrow(/install_id .* but we sent/);
  });

  it('rejects a server response missing required fields', async () => {
    const storage = new InMemoryStorageBackend();
    await getInstallIdentity(storage);
    const fetch = mkFetch(() => jsonOk({ install_token: 'a'.repeat(64) }));  // missing the rest
    await expect(ensureEnrolled({
      storage, endpoint: 'https://rpc.test', fetch,
    })).rejects.toThrow(/missing fields/);
  });

  it('_clearCachedBearer drops the cache so the next ensureEnrolled re-attempts', async () => {
    const storage = new InMemoryStorageBackend();
    const id = await getInstallIdentity(storage);
    let calls = 0;
    const fetch = mkFetch(() => {
      calls += 1;
      return jsonOk({
        install_token: 'a'.repeat(64),
        install_id: id.installId,
        issued_at: '2026-05-24T13:00:00Z',
      });
    });
    await ensureEnrolled({ storage, endpoint: 'https://rpc.test', fetch });
    await _clearCachedBearer(storage);
    await ensureEnrolled({ storage, endpoint: 'https://rpc.test', fetch });
    expect(calls).toBe(2);
  });
});

// ── helpers ─────────────────────────────────────────────────────

function mkFetch(handler: (url: string, init?: RequestInit) => Response):
    (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  return async (input, init) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL ? input.toString() : input.url;
    return handler(url, init);
  };
}

function jsonOk(body: unknown): Response {
  const text = JSON.stringify(body);
  return {
    ok: true, status: 200, statusText: 'OK',
    json: async () => JSON.parse(text),
    text: async () => text,
    headers: new Headers({ 'Content-Type': 'application/json' }),
  } as unknown as Response;
}

function textRes(status: number, body: string): Response {
  return {
    ok: status < 400, status, statusText: '',
    json: async () => { throw new Error('not json'); },
    text: async () => body,
    headers: new Headers(),
  } as unknown as Response;
}
