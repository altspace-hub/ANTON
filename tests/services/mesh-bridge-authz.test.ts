/**
 * mesh-bridge-authz.test.ts — what a mesh peer is allowed to reach.
 *
 * bootstrap.ts hands the bridge the WHOLE Express app, and a completed Noise IK
 * handshake authenticates the RESPONDER to the initiator — not the initiator to
 * us. dialer.ts holds no database handle, so it cannot check a peer against
 * app_devices even in principle. Authorization therefore lives at dispatch, and
 * these tests are what hold it there.
 *
 * The three properties under test:
 *   1. Only the two paths real clients use are dispatched. Everything else is
 *      404'd without Express ever seeing it.
 *   2. Identity-bearing headers the peer supplies are dropped, not forwarded —
 *      origin/host alone are a complete CSRF bypass (csrf.ts:112) and a
 *      password-reset link injection (auth.ts:178).
 *   3. The synthetic socket presents as REMOTE, so every "caller is local,
 *      therefore trusted" gate fails closed for mesh.
 */
import { describe, it, expect } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildBridgeHooks, isMeshAllowedPath } from '../../server/services/mesh/bridge.js';
import { encodeRpc, decodeRpc, RPC_KIND, type RpcResponse } from '../../server/services/mesh/rpc.js';
import type { SessionContext } from '../../server/services/mesh/dialer.js';

interface FakeSession { ctx: SessionContext; outbound: Uint8Array[] }

function fakeSession(): FakeSession {
  const outbound: Uint8Array[] = [];
  const ctx: SessionContext = {
    send: (p) => { outbound.push(p); },
    close: () => { /* noop */ },
    phoneStaticPubkey: new Uint8Array(32).fill(0x7),
  };
  return { ctx, outbound };
}

function frame(path: string, headers: Array<{ name: string; value: string }> = [], seq = 1): Uint8Array {
  return encodeRpc({ kind: RPC_KIND.REQUEST, seq, method: 'POST', path, headers, body: new Uint8Array(0) });
}

/** Dispatch one frame; resolve with the captured Express req (or null if never dispatched). */
async function dispatch(path: string, headers: Array<{ name: string; value: string }> = []): Promise<{
  reached: IncomingMessage | null; status: number;
}> {
  let reached: IncomingMessage | null = null;
  const handler = (req: IncomingMessage, res: ServerResponse): void => {
    reached = req;
    res.writeHead(200);
    res.end();
  };
  const hooks = buildBridgeHooks({ expressHandler: handler });
  const sess = fakeSession();
  const sid = new Uint8Array(16).fill(0xAB);
  hooks.onSessionOpen(sid, sess.ctx);
  hooks.onSessionData(sid, frame(path, headers));
  const deadline = Date.now() + 1000;
  while (sess.outbound.length === 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 5));
  const resp = decodeRpc(sess.outbound[0]!) as RpcResponse;
  return { reached, status: resp.status };
}

describe('mesh path allowlist — the real clients still work', () => {
  it('dispatches the Companion app surface (/api/app/*)', async () => {
    // src/app/services/api.ts:104 sends '/api/app' + suffix for EVERY call.
    for (const p of ['/api/app/messages', '/api/app/checkpoints', '/api/app/enrollment/complete']) {
      const { reached, status } = await dispatch(p);
      expect(reached, p).not.toBeNull();
      expect(status).toBe(200);
    }
  });

  it('dispatches instance-to-instance A2A (/api/p2p/receive)', async () => {
    const { reached, status } = await dispatch('/api/p2p/receive');
    expect(reached).not.toBeNull();
    expect(status).toBe(200);
  });
});

describe('mesh path allowlist — everything else is refused before Express', () => {
  const forbidden = [
    '/mcp',                              // full tool-calling interface; loopback-gated when MCP_SECRET unset
    '/api/metrics',
    '/metrics',
    '/api/relay/send',                   // loopback-gated when RELAY_PUBLIC unset
    '/api/admin/app/enrollment/start',   // mints enrollment packages for arbitrary users
    '/api/admin/app/mesh/relays',        // repoints the mesh relay
    '/api/futurechain/gateway/regenerate-key',
    '/api/auth/forgot-password',         // host-header injection into the emailed link
    '/api/sessions',
    '/api/settings',
    '/',
  ];

  it('404s every non-allowlisted path WITHOUT dispatching into Express', async () => {
    for (const p of forbidden) {
      const { reached, status } = await dispatch(p);
      expect(reached, `${p} must never reach Express`).toBeNull();
      expect(status, p).toBe(404);
    }
  });

  it('404s rather than 403s, so a probing peer learns nothing about what exists', async () => {
    const real = await dispatch('/api/admin/app/mesh/relays');   // exists in Express
    const fake = await dispatch('/api/does-not-exist-at-all');   // does not
    // Assert the ABSOLUTE value too, not just that the two agree — comparing
    // them to each other alone would also pass if both were wrongly 200.
    expect(real.status).toBe(404);
    expect(fake.status).toBe(404);
    expect(real.reached).toBeNull();
    expect(fake.reached).toBeNull();
  });

  it('the allowlist is wired into dispatch, not merely exported', async () => {
    // Guards the wiring specifically: isMeshAllowedPath can be correct while the
    // call site is removed or short-circuited, which the pure-function tests
    // below would not catch.
    const { reached, status } = await dispatch('/mcp');
    expect(reached).toBeNull();
    expect(status).toBe(404);
  });
});

describe('mesh path allowlist — traversal and encoding cannot escape it', () => {
  it('rejects path traversal out of the allowed prefix', () => {
    expect(isMeshAllowedPath('/api/app/../admin/app/mesh/relays')).toBe(false);
    expect(isMeshAllowedPath('/api/app/../../mcp')).toBe(false);
  });

  it('rejects percent-encoded traversal', () => {
    expect(isMeshAllowedPath('/api/app/%2e%2e/admin/app')).toBe(false);
    expect(isMeshAllowedPath('/api/app/%2E%2E/mcp')).toBe(false);
  });

  it('rejects backslash and double-slash tricks', () => {
    expect(isMeshAllowedPath('/api/app\\..\\admin')).toBe(false);
    expect(isMeshAllowedPath('//api/app/x')).toBe(false);
    expect(isMeshAllowedPath('/api//app/x')).toBe(false);
  });

  it('is not fooled by a prefix that merely STARTS like an allowed one', () => {
    // '/api/appalling' must not pass a '/api/app' check done naively.
    expect(isMeshAllowedPath('/api/appalling/secret')).toBe(false);
    expect(isMeshAllowedPath('/api/app-admin/x')).toBe(false);
  });

  it('ignores query and fragment when matching', () => {
    expect(isMeshAllowedPath('/api/app/messages?x=1')).toBe(true);
    expect(isMeshAllowedPath('/mcp?/api/app/')).toBe(false);
  });

  it('allows the bare /api/app and /api/p2p/receive exact paths', () => {
    expect(isMeshAllowedPath('/api/app')).toBe(true);
    expect(isMeshAllowedPath('/api/p2p/receive')).toBe(true);
    expect(isMeshAllowedPath('/api/p2p/other')).toBe(false);   // only the one A2A route
  });
});

describe('mesh header allowlist — identity headers are dropped', () => {
  it('drops origin/referer, which would waive CSRF outright', async () => {
    const { reached } = await dispatch('/api/app/x', [
      { name: 'origin', value: 'http://localhost:3001' },
      { name: 'referer', value: 'http://localhost:3001/' },
    ]);
    const h = reached!.headers as Record<string, string>;
    expect(h.origin).toBeUndefined();
    expect(h.referer).toBeUndefined();
  });

  it('pins host to a name this instance is never served on', async () => {
    const { reached } = await dispatch('/api/app/x', [{ name: 'host', value: 'evil.example.com' }]);
    expect((reached!.headers as Record<string, string>).host).toBe('mesh.invalid');
  });

  it('drops x-forwarded-* so req.ip can never become peer-controlled', async () => {
    const { reached } = await dispatch('/api/app/x', [
      { name: 'x-forwarded-for', value: '127.0.0.1' },
      { name: 'x-forwarded-host', value: 'localhost' },
      { name: 'x-forwarded-proto', value: 'https' },
      { name: 'x-real-ip', value: '127.0.0.1' },
      { name: 'forwarded', value: 'for=127.0.0.1' },
    ]);
    const h = reached!.headers as Record<string, string>;
    for (const k of ['x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-real-ip', 'forwarded']) {
      expect(h[k], k).toBeUndefined();
    }
  });

  it('drops cookie and a forged x-mesh-phone-static', async () => {
    const { reached } = await dispatch('/api/app/x', [
      { name: 'cookie', value: 'session=stolen' },
      { name: 'x-mesh-phone-static', value: 'de:ad:be:ef' },
    ]);
    const h = reached!.headers as Record<string, string>;
    expect(h.cookie).toBeUndefined();
    // Either absent, or the bridge's own trusted value — never the peer's.
    expect(h['x-mesh-phone-static']).not.toBe('de:ad:be:ef');
  });

  it('still forwards the headers the real clients need', async () => {
    const { reached } = await dispatch('/api/app/x', [
      { name: 'content-type', value: 'application/json' },
      { name: 'x-app-session', value: 'tok_abc' },
    ]);
    const h = reached!.headers as Record<string, string>;
    expect(h['content-type']).toBe('application/json');
    expect(h['x-app-session']).toBe('tok_abc');
  });
});

describe('mesh socket presents as REMOTE', () => {
  it('does not claim loopback, so local-only gates fail closed', async () => {
    const { reached } = await dispatch('/api/app/x');
    const sock = (reached as unknown as { socket: { remoteAddress: string; localAddress: string } }).socket;
    for (const addr of [sock.remoteAddress, sock.localAddress]) {
      expect(addr).not.toBe('127.0.0.1');
      expect(addr).not.toBe('::1');
      expect(addr).not.toBe('::ffff:127.0.0.1');
    }
    expect(sock.remoteAddress).toBe('192.0.2.1'); // RFC 5737 TEST-NET-1
  });
});
