/**
 * mesh-bridge.test.ts — drive the mesh→Express bridge against stub
 * Express-shape handlers. The tests exercise the request/response
 * round-trip, header preservation, body preservation, and CANCEL
 * propagation, without booting the full ANTON Express app.
 *
 * Phase 3.5 will run the same flow against the real RelayServer + the
 * real Express app.
 */

import { describe, it, expect } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildBridgeHooks } from '../../server/services/mesh/bridge.js';
import {
  encodeRpc, decodeRpc, RPC_KIND,
  type RpcRequest, type RpcResponse, type RpcError,
} from '../../server/services/mesh/rpc.js';
import type { SessionContext } from '../../server/services/mesh/dialer.js';

// ── Test fixtures ──────────────────────────────────────────────────

interface FakeSession {
  ctx: SessionContext;
  outbound: Uint8Array[];
  closeReason: string | null;
}

function fakeSession(phoneStaticPubkey = new Uint8Array(32)): FakeSession {
  const outbound: Uint8Array[] = [];
  let closeReason: string | null = null;
  const ctx: SessionContext = {
    send: (p) => { outbound.push(p); },
    close: (reason = 'closed') => { closeReason = reason; },
    phoneStaticPubkey,
  };
  return {
    ctx,
    outbound,
    get closeReason() { return closeReason; },
  } as FakeSession;
}

function makeRequest(req: Partial<RpcRequest> & { method?: string; path?: string }): Uint8Array {
  return encodeRpc({
    kind: RPC_KIND.REQUEST,
    seq: req.seq ?? 1,
    method: req.method ?? 'POST',
    path: req.path ?? '/api/app/test',
    headers: req.headers ?? [],
    body: req.body ?? new Uint8Array(0),
  });
}

// ── Tests ──────────────────────────────────────────────────────────

describe('Bridge — request → Express → response round-trip', () => {
  it('a 200 with JSON body round-trips byte-for-byte', async () => {
    const handler = (_req: IncomingMessage, res: ServerResponse): void => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ text: 'pong' }));
    };

    const hooks = buildBridgeHooks({ expressHandler: handler });
    const sess = fakeSession();
    const sid = new Uint8Array(16).fill(0xAA);

    hooks.onSessionOpen(sid, sess.ctx);
    hooks.onSessionData(sid, makeRequest({ seq: 1, method: 'POST', path: '/api/app/test' }));

    await waitFor(() => sess.outbound.length > 0, 1000);
    const respFrame = decodeRpc(sess.outbound[0]!) as RpcResponse;
    expect(respFrame.kind).toBe(RPC_KIND.RESPONSE);
    expect(respFrame.seq).toBe(1);
    expect(respFrame.status).toBe(200);
    expect(new TextDecoder().decode(respFrame.body)).toBe(JSON.stringify({ text: 'pong' }));
    expect(respFrame.headers.find(h => h.name === 'content-type')?.value).toBe('application/json');
  });

  it('passes headers from the RPC request through to the handler', async () => {
    let capturedHeaders: Record<string, string> = {};
    const handler = (req: IncomingMessage, res: ServerResponse): void => {
      capturedHeaders = req.headers as Record<string, string>;
      res.writeHead(200);
      res.end();
    };

    const hooks = buildBridgeHooks({ expressHandler: handler });
    const sess = fakeSession();
    const sid = new Uint8Array(16);
    hooks.onSessionOpen(sid, sess.ctx);
    hooks.onSessionData(sid, makeRequest({
      seq: 1,
      headers: [
        { name: 'authorization', value: 'Bearer abc' },
        { name: 'x-app-session', value: 'session-token' },
      ],
    }));

    await waitFor(() => sess.outbound.length > 0, 1000);
    // The bridge forwards an ALLOWLIST, not the peer's whole header bag — see
    // mesh-bridge-authz.test.ts for why (origin/host alone are a CSRF bypass and
    // a password-reset link injection). x-app-session is what the Companion app
    // actually authenticates with (src/app/services/api.ts:63) and is forwarded.
    expect(capturedHeaders['x-app-session']).toBe('session-token');
    // `authorization` is NOT forwarded: neither mesh-reachable route consumes it
    // (/api/app/* uses x-app-session; /api/p2p/receive authenticates by contact
    // list), so carrying it would only widen the surface for no client benefit.
    expect(capturedHeaders.authorization).toBeUndefined();
  });

  it('passes the request body through to the handler', async () => {
    let capturedBody = '';
    const handler = (req: IncomingMessage, res: ServerResponse): void => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        capturedBody = Buffer.concat(chunks).toString('utf8');
        res.writeHead(200);
        res.end();
      });
    };

    const hooks = buildBridgeHooks({ expressHandler: handler });
    const sess = fakeSession();
    const sid = new Uint8Array(16);
    hooks.onSessionOpen(sid, sess.ctx);
    hooks.onSessionData(sid, makeRequest({
      seq: 1,
      method: 'POST',
      headers: [{ name: 'content-type', value: 'application/json' }],
      body: new TextEncoder().encode('{"hello":"world"}'),
    }));

    await waitFor(() => sess.outbound.length > 0, 1000);
    expect(capturedBody).toBe('{"hello":"world"}');
  });

  it('exposes phone_static_pubkey via x-mesh-phone-static when configured', async () => {
    let capturedHeaders: Record<string, string> = {};
    const handler = (req: IncomingMessage, res: ServerResponse): void => {
      capturedHeaders = req.headers as Record<string, string>;
      res.writeHead(200); res.end();
    };
    const phonePk = new Uint8Array(32);
    for (let i = 0; i < 32; i++) phonePk[i] = i;

    const hooks = buildBridgeHooks({ expressHandler: handler, attachPhoneStaticHeader: true });
    const sess = fakeSession(phonePk);
    const sid = new Uint8Array(16);
    hooks.onSessionOpen(sid, sess.ctx);
    hooks.onSessionData(sid, makeRequest({}));

    await waitFor(() => sess.outbound.length > 0, 1000);
    expect(capturedHeaders['x-mesh-phone-static']).toBe(
      Array.from(phonePk).map(b => b.toString(16).padStart(2, '0')).join(''),
    );
  });

  it('omits the x-mesh-phone-static header when attachPhoneStaticHeader is not set', async () => {
    let capturedHeaders: Record<string, string> = {};
    const handler = (req: IncomingMessage, res: ServerResponse): void => {
      capturedHeaders = req.headers as Record<string, string>;
      res.writeHead(200); res.end();
    };
    const hooks = buildBridgeHooks({ expressHandler: handler });
    const sess = fakeSession();
    const sid = new Uint8Array(16);
    hooks.onSessionOpen(sid, sess.ctx);
    hooks.onSessionData(sid, makeRequest({}));
    await waitFor(() => sess.outbound.length > 0, 1000);
    expect(capturedHeaders['x-mesh-phone-static']).toBeUndefined();
  });
});

describe('Bridge — error handling', () => {
  it('a malformed RPC frame inside a session closes the session', async () => {
    const hooks = buildBridgeHooks({
      expressHandler: () => { throw new Error('should not be called'); },
    });
    const sess = fakeSession();
    const sid = new Uint8Array(16);
    hooks.onSessionOpen(sid, sess.ctx);
    hooks.onSessionData(sid, new Uint8Array([0x99, 0, 0, 0, 0]));   // unknown kind
    expect(sess.closeReason).toBe('bad_rpc_frame');
  });

  it('a duplicate seq closes the session per spec §5.4', async () => {
    let calls = 0;
    const handler = (_req: IncomingMessage, res: ServerResponse): void => {
      calls++;
      // Don't end the response — keeps it in flight so the duplicate fires
      // the dup-seq path before the response arrives.
      void res;
    };
    const hooks = buildBridgeHooks({ expressHandler: handler });
    const sess = fakeSession();
    const sid = new Uint8Array(16);
    hooks.onSessionOpen(sid, sess.ctx);
    hooks.onSessionData(sid, makeRequest({ seq: 1 }));
    // Now duplicate the same seq.
    hooks.onSessionData(sid, makeRequest({ seq: 1 }));

    expect(sess.closeReason).toBe('seq_duplicate');
    expect(calls).toBe(1);  // Only the first request reached the handler.

    // The duplicate should have produced an ERROR frame for that seq.
    const errFrame = sess.outbound.map(b => decodeRpc(b)).find(
      (f): f is RpcError => f.kind === RPC_KIND.ERROR && f.seq === 1,
    );
    expect(errFrame).toBeDefined();
    expect(errFrame!.code).toBe(0x0202);  // SEQ_DUPLICATE
  });

  it('an unexpected RESPONSE frame from the peer closes the session', async () => {
    const hooks = buildBridgeHooks({ expressHandler: () => { /* no-op */ } });
    const sess = fakeSession();
    const sid = new Uint8Array(16);
    hooks.onSessionOpen(sid, sess.ctx);
    hooks.onSessionData(sid, encodeRpc({
      kind: RPC_KIND.RESPONSE, seq: 1, status: 200, headers: [], body: new Uint8Array(0),
    }));
    expect(sess.closeReason).toBe('unexpected_kind');
  });

  it('a request timeout produces a 504 response and aborts the controller', async () => {
    let abortFired = false;
    const handler = (req: IncomingMessage, res: ServerResponse): void => {
      // Cooperative abort: never call res.end().
      const reqWithSignal = req as IncomingMessage & { signal?: AbortSignal };
      reqWithSignal.signal?.addEventListener('abort', () => { abortFired = true; });
      void res;
    };

    const hooks = buildBridgeHooks({ expressHandler: handler, requestTimeoutMs: 50 });
    const sess = fakeSession();
    const sid = new Uint8Array(16);
    hooks.onSessionOpen(sid, sess.ctx);
    hooks.onSessionData(sid, makeRequest({ seq: 1 }));

    await waitFor(() => sess.outbound.length > 0, 1000);
    const r = decodeRpc(sess.outbound[0]!) as RpcResponse;
    expect(r.kind).toBe(RPC_KIND.RESPONSE);
    expect(r.status).toBe(504);
    expect(abortFired).toBe(true);
  });
});

describe('Bridge — CANCEL handling', () => {
  it('CANCEL aborts the in-flight request signal', async () => {
    let abortFired = false;
    const handler = (req: IncomingMessage, res: ServerResponse): void => {
      const reqWithSignal = req as IncomingMessage & { signal?: AbortSignal };
      reqWithSignal.signal?.addEventListener('abort', () => { abortFired = true; });
      // Don't end response — wait for cancel.
      void res;
    };

    const hooks = buildBridgeHooks({ expressHandler: handler });
    const sess = fakeSession();
    const sid = new Uint8Array(16);
    hooks.onSessionOpen(sid, sess.ctx);

    hooks.onSessionData(sid, makeRequest({ seq: 5 }));
    expect(hooks.inFlightCount()).toBe(1);

    hooks.onSessionData(sid, encodeRpc({ kind: RPC_KIND.CANCEL, seq: 5 }));
    expect(abortFired).toBe(true);
    expect(hooks.inFlightCount()).toBe(0);
  });

  it('CANCEL of an unknown seq is silently ignored', () => {
    const hooks = buildBridgeHooks({ expressHandler: () => { /* no-op */ } });
    const sess = fakeSession();
    const sid = new Uint8Array(16);
    hooks.onSessionOpen(sid, sess.ctx);
    hooks.onSessionData(sid, encodeRpc({ kind: RPC_KIND.CANCEL, seq: 9999 }));
    expect(sess.closeReason).toBeNull();
  });
});

describe('Bridge — session lifecycle', () => {
  it('onSessionClose aborts every in-flight request for that session', async () => {
    let abortCount = 0;
    const handler = (req: IncomingMessage, res: ServerResponse): void => {
      const reqWithSignal = req as IncomingMessage & { signal?: AbortSignal };
      reqWithSignal.signal?.addEventListener('abort', () => { abortCount++; });
      void res;
    };

    const hooks = buildBridgeHooks({ expressHandler: handler });
    const sess = fakeSession();
    const sid = new Uint8Array(16);
    hooks.onSessionOpen(sid, sess.ctx);
    hooks.onSessionData(sid, makeRequest({ seq: 1 }));
    hooks.onSessionData(sid, makeRequest({ seq: 2 }));
    hooks.onSessionData(sid, makeRequest({ seq: 3 }));
    expect(hooks.inFlightCount()).toBe(3);

    hooks.onSessionClose(sid, 'peer_gone');
    expect(abortCount).toBe(3);
    expect(hooks.inFlightCount()).toBe(0);
  });
});

// ── Helpers ─────────────────────────────────────────────────────────

async function waitFor(cond: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 5));
  }
}
