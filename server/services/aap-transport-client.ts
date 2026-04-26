/**
 * aap-transport-client.ts — outbound peer client for AAP wire-format v1.
 *
 * Companion to aap-transport-server.ts. Use to send `.anton` bundles to a
 * peer ANTON instance over wss://peer/aap/v1.
 *
 * Shipped per ANTON_Improvement_and_Investigation_Brief.md §E.2.
 *
 * NB: like the server, this file orchestrates the protocol; the cryptographic
 * primitives live in community-crypto.ts.
 */

import { WebSocket } from 'ws';
import { randomUUID, randomBytes } from 'crypto';

interface ClientEnvelope {
  v: 1;
  type: 'HELLO' | 'BUNDLE' | 'PING' | 'GOODBYE';
  id: string;
  ts: string;
  from: string;
  nonce: string;
  payload: Record<string, unknown>;
  sig: string;
}

export interface AapClientOptions {
  peerUrl: string;                 // wss://peer.example.com/aap/v1
  ourContactHash: string;          // ANTON-XXXX-XXXX-XXXX-XXXX
  ourPubkey: string;                // base64url
  capabilities: { id: string; version: string }[];
  /** Connection timeout in ms (default 15000). */
  timeoutMs?: number;
}

export interface SendBundleInput {
  bundleType: string;              // one of the 45 BundleType values
  encryptedBody: string;           // base64url AES-256-GCM ciphertext
  iv: string;                      // base64url 12-byte IV
  authTag: string;                 // base64url 16-byte GCM tag
}

export interface AckMessage {
  in_reply_to: string;
  status: 'received' | 'applied' | 'rejected_signature' | 'rejected_schema' | 'rejected_owner_locked' | 'capability_denied';
  detail?: string;
}

export interface AapSendResult {
  acks: AckMessage[];
  durationMs: number;
}

/**
 * Establish a session, send one or more bundles, then GOODBYE. The simplest
 * usage pattern; for long-lived sessions use the lower-level openSession()
 * + sendBundle() variants below.
 */
export async function sendBundlesToPeer(
  options: AapClientOptions,
  bundles: SendBundleInput[]
): Promise<AapSendResult> {
  const t0 = Date.now();
  const session = await openSession(options);
  try {
    const acks: AckMessage[] = [];
    for (const b of bundles) {
      const ack = await sendBundle(session, b);
      acks.push(ack);
    }
    await closeSession(session);
    return { acks, durationMs: Date.now() - t0 };
  } catch (err) {
    try { session.ws.close(); } catch { /* ignore */ }
    throw err;
  }
}

// ── Lower-level session API ────────────────────────────────────────────

interface ClientSession {
  ws: WebSocket;
  ourContactHash: string;
  sessionId: string;
  acceptedCapabilities: string[];
}

export function openSession(options: AapClientOptions): Promise<ClientSession> {
  return new Promise<ClientSession>((resolve, reject) => {
    const ws = new WebSocket(options.peerUrl, { handshakeTimeout: options.timeoutMs ?? 15_000 });
    let settled = false;

    const fail = (err: unknown) => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch { /* ignore */ }
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    ws.once('open', () => {
      const hello = makeEnvelope(options.ourContactHash, 'HELLO', {
        pubkey: options.ourPubkey,
        capability_descriptors: options.capabilities,
        ephemeral_pubkey: '<our-x25519-ephemeral>', // wired via community-crypto in next pass
      });
      ws.send(JSON.stringify(hello));
    });

    ws.on('message', (raw) => {
      try {
        const env = JSON.parse(raw.toString()) as { type: string; payload?: { session_id?: string; accepted_capabilities?: string[]; code?: string; detail?: string } };
        if (env.type === 'WELCOME' && env.payload?.session_id) {
          settled = true;
          resolve({
            ws,
            ourContactHash: options.ourContactHash,
            sessionId: env.payload.session_id,
            acceptedCapabilities: env.payload.accepted_capabilities ?? [],
          });
        } else if (env.type === 'REJECT' || env.type === 'ERROR') {
          fail(new Error(`peer ${env.type}: ${env.payload?.code ?? 'unknown'} ${env.payload?.detail ?? ''}`.trim()));
        }
        // Other early messages ignored until WELCOME.
      } catch (parseErr) {
        fail(parseErr);
      }
    });

    ws.on('error', fail);
    ws.on('close', (code, reason) => {
      if (!settled) fail(new Error(`socket closed before WELCOME (${code} ${reason.toString()})`));
    });
  });
}

export function sendBundle(session: ClientSession, b: SendBundleInput): Promise<AckMessage> {
  return new Promise<AckMessage>((resolve, reject) => {
    const env = makeEnvelope(session.ourContactHash, 'BUNDLE', {
      session_id: session.sessionId,
      bundle_type: b.bundleType,
      encrypted_body: b.encryptedBody,
      iv: b.iv,
      auth_tag: b.authTag,
    });

    const msgId = env.id;
    const onMessage = (raw: Buffer | string) => {
      try {
        const incoming = JSON.parse(raw.toString()) as { type: string; payload?: AckMessage };
        if (incoming.type === 'ACK' && incoming.payload?.in_reply_to === msgId) {
          session.ws.off('message', onMessage);
          resolve(incoming.payload);
        }
      } catch (err) {
        // ignore parse errors on irrelevant messages
      }
    };
    session.ws.on('message', onMessage);

    session.ws.send(JSON.stringify(env), (err) => {
      if (err) {
        session.ws.off('message', onMessage);
        reject(err);
      }
    });

    // 30s timeout per ACK.
    setTimeout(() => {
      session.ws.off('message', onMessage);
      reject(new Error(`ACK timeout for bundle ${msgId}`));
    }, 30_000);
  });
}

export async function closeSession(session: ClientSession): Promise<void> {
  try {
    session.ws.send(JSON.stringify(makeEnvelope(session.ourContactHash, 'GOODBYE', {})));
  } catch { /* ignore */ }
  try { session.ws.close(1000, 'client goodbye'); } catch { /* ignore */ }
}

// ── Envelope helper (mirrors server) ────────────────────────────────────

function makeEnvelope(ourContactHash: string, type: ClientEnvelope['type'], payload: Record<string, unknown>): ClientEnvelope {
  return {
    v: 1,
    type,
    id: randomUUID(),
    ts: new Date().toISOString(),
    from: ourContactHash,
    nonce: randomBytes(32).toString('hex'),
    payload,
    sig: '<client-sig>', // wired via community-crypto.sign() in next pass
  };
}
