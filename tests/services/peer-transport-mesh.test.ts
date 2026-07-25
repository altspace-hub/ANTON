/**
 * peer-transport-mesh.test.ts — loopback integration test for the mesh leg
 * of peer-transport-service (plan 2.8, Wave-2 Track B).
 *
 * Stands up (mirroring mesh-integration.test.ts):
 *   - A REAL relay/src/server.ts RelayServer.
 *   - A REAL responder MeshDialer wired through the REAL bridge to a stub
 *     Express handler (echo / 500 / hang routes).
 *   - A REAL initiator MeshDialer (no bridge hooks needed — the per-session
 *     data listener takes the RESPONSE frame).
 *
 * Then drives `sendMeshRpcRequest` — the exact framing path tryMesh uses in
 * production — and asserts:
 *   1. A round-trip POST delivers and the REAL HTTP status + body come back.
 *   2. A 5xx from the peer is reported as ok=false (previously the raw-text
 *      framing reported {ok:true, httpStatus:200} on 100% loss).
 *   3. A peer that never answers times out as ok=false (bridge 504), so the
 *      transport ladder can fall through to HTTPS.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Writable } from 'node:stream';
import { createHash } from 'node:crypto';
import { ed25519, edwardsToMontgomeryPriv, edwardsToMontgomeryPub } from '@noble/curves/ed25519';

// Real relay package
import { RelayServer } from '../../relay/src/server.js';
import { createAuditLogger } from '../../relay/src/audit.js';

// Mesh modules + the unit under test
import { MeshDialer } from '../../server/services/mesh/dialer.js';
import { buildBridgeHooks } from '../../server/services/mesh/bridge.js';
import { sendMeshRpcRequest } from '../../server/services/peer-transport-service.js';

const sinkStream = new Writable({ write(_c, _e, cb) { cb(); } });

let server: RelayServer;
let canonicalRelayUrl: string;

beforeAll(async () => {
  // Same two-step bind as mesh-integration.test.ts: discover a free port,
  // then restart the relay with a canonical URL matching that port.
  let tempPort: number;
  {
    const t = new RelayServer({
      ownUrl: 'ws://127.0.0.1:1',
      port: 0, host: '127.0.0.1', insecure: true,
      audit: createAuditLogger(sinkStream),
    });
    await t.start();
    tempPort = t.actualPort();
    await t.stop();
  }
  canonicalRelayUrl = `ws://127.0.0.1:${tempPort}`;
  server = new RelayServer({
    ownUrl: canonicalRelayUrl,
    port: tempPort,
    host: '127.0.0.1',
    insecure: true,
    helloGraceSec: 30,
    reaperIntervalMs: 100,
    helloRateLimit: { capacity: 1000, refillPerSec: 1000 },
    envelopeRateLimit: { capacity: 1000, refillPerSec: 1000 },
    audit: createAuditLogger(sinkStream),
  });
  await server.start();
});

afterAll(async () => {
  await server.stop();
});

// ── Helpers (mirrors mesh-integration.test.ts) ──────────────────────

const BINDING_DOMAIN = new TextEncoder().encode('ANTON-MESH-IDENTITY/v1\n');

interface InstanceFixture {
  ed_priv: Uint8Array;
  ed_pk: Uint8Array;
  x_priv: Uint8Array;
  x_pk: Uint8Array;
  instanceId: Uint8Array;
  bindingSig: Uint8Array;
}

function makeRealInstance(): InstanceFixture {
  const ed_priv = ed25519.utils.randomPrivateKey();
  const ed_pk = ed25519.getPublicKey(ed_priv);
  const x_pk = edwardsToMontgomeryPub(ed_pk);
  const x_priv = edwardsToMontgomeryPriv(ed_priv);
  const instanceId = createHash('sha256').update(x_pk).digest().subarray(0, 16);
  const bindingMsg = new Uint8Array(BINDING_DOMAIN.length + 32 + 32);
  bindingMsg.set(BINDING_DOMAIN, 0);
  bindingMsg.set(ed_pk, BINDING_DOMAIN.length);
  bindingMsg.set(x_pk, BINDING_DOMAIN.length + 32);
  const bindingSig = ed25519.sign(bindingMsg, ed_priv);
  return { ed_priv, ed_pk, x_priv, x_pk, instanceId, bindingSig };
}

function startInstanceDialer(
  inst: InstanceFixture,
  hooks?: ReturnType<typeof buildBridgeHooks>,
): MeshDialer {
  return new MeshDialer({
    relayUrls: [canonicalRelayUrl],
    ed25519: { publicKey: inst.ed_pk, privateKey: inst.ed_priv },
    x25519:  { publicKey: inst.x_pk,  privateKey: inst.x_priv },
    instanceId: inst.instanceId,
    bindingSig: inst.bindingSig,
    onSessionOpen: hooks?.onSessionOpen,
    onSessionData: hooks?.onSessionData,
    onSessionClose: hooks?.onSessionClose,
  });
}

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i]!.toString(16).padStart(2, '0');
  return out;
}

async function waitFor(cond: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
}

// ── The tests ───────────────────────────────────────────────────────

describe('peer-transport mesh leg — instance-to-instance RPC over the real relay', () => {
  it('round-trips a POST and propagates the real status; failures no longer report delivered', async () => {
    // Stub Express handler on the responder side. All three cases now ride the
    // PRODUCTION path /api/p2p/receive and are selected by the request BODY,
    // because the mesh bridge's path allowlist (services/mesh/bridge.ts) only
    // dispatches the paths real clients use — a test-only /api/p2p/fail would be
    // 404'd by the bridge before Express, which would silently turn this into a
    // test of the allowlist rather than of status propagation.
    //   body {"mode":"fail"} → 500
    //   body {"mode":"hang"} → never responds (bridge soft-timeout → 504)
    //   anything else        → 200 echo
    const expressHandler = (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse): void => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const bodyIn = Buffer.concat(chunks).toString('utf8');
        if (bodyIn.includes('"mode":"fail"')) {
          res.writeHead(500, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'peer exploded' }));
          return;
        }
        if (bodyIn.includes('"mode":"hang"')) {
          return; // never call res.end() — bridge soft-timeout takes over
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ got: bodyIn, method: req.method, path: req.url }));
      });
    };

    // Responder instance: real bridge, short soft-timeout so the hang case
    // resolves quickly.
    const responder = makeRealInstance();
    const bridgeHooks = buildBridgeHooks({ expressHandler, requestTimeoutMs: 1_000 });
    const responderDialer = startInstanceDialer(responder, bridgeHooks);
    responderDialer.start();

    // Initiator instance: no bridge hooks — sendMeshRpcRequest registers a
    // per-session listener for the RESPONSE frame.
    const initiator = makeRealInstance();
    const initiatorDialer = startInstanceDialer(initiator);
    initiatorDialer.start();

    try {
      await waitFor(() => responderDialer.legCount() === 1, 3_000);
      await waitFor(() => initiatorDialer.legCount() === 1, 3_000);

      const peerEdHex = bytesToHex(responder.ed_pk);

      // 1) Successful round-trip: real status + real body come back.
      const okOutcome = await sendMeshRpcRequest(
        initiatorDialer, peerEdHex, '/api/p2p/receive', '{"hello":"peer"}', 8_000,
      );
      expect(okOutcome.ok).toBe(true);
      expect(okOutcome.transport).toBe('mesh');
      expect(okOutcome.httpStatus).toBe(200);
      const reply = JSON.parse(okOutcome.responseText ?? '');
      expect(reply.got).toBe('{"hello":"peer"}');
      expect(reply.method).toBe('POST');
      expect(reply.path).toBe('/api/p2p/receive');

      // 2) Peer-side failure is reported as a failure with the REAL status —
      //    this is the regression the old raw-text framing masked.
      const failOutcome = await sendMeshRpcRequest(
        initiatorDialer, peerEdHex, '/api/p2p/receive', '{"mode":"fail"}', 8_000,
      );
      expect(failOutcome.ok).toBe(false);
      expect(failOutcome.httpStatus).toBe(500);
      expect(failOutcome.error).toBe('HTTP 500');

      // 3) A peer that never answers must not be marked delivered. The
      //    bridge's soft-timeout converts it to a 504 RESPONSE frame.
      const hangOutcome = await sendMeshRpcRequest(
        initiatorDialer, peerEdHex, '/api/p2p/receive', '{"mode":"hang"}', 8_000,
      );
      expect(hangOutcome.ok).toBe(false);
      expect(hangOutcome.httpStatus).toBe(504);
    } finally {
      initiatorDialer.stop();
      responderDialer.stop();
    }
  }, 30_000);

  it('reports failure (not delivered) when the peer is unreachable', async () => {
    const initiator = makeRealInstance();
    const initiatorDialer = startInstanceDialer(initiator);
    initiatorDialer.start();
    try {
      await waitFor(() => initiatorDialer.legCount() === 1, 3_000);
      // A peer identity that never connected to the relay — the dial times
      // out (relay queues the dial; no target arrives) and the outcome must
      // be ok=false so sendToPeer falls through to HTTPS.
      const ghost = makeRealInstance();
      const outcome = await sendMeshRpcRequest(
        initiatorDialer, bytesToHex(ghost.ed_pk), '/api/p2p/receive', '{"x":1}', 4_000,
      );
      expect(outcome.ok).toBe(false);
      expect(outcome.httpStatus).toBe(0);
      expect(outcome.error).toBeTruthy();
    } finally {
      initiatorDialer.stop();
    }
  }, 15_000);
});
