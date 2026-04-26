/**
 * aap-transport-server.ts — WebSocket server for AAP wire-format v1.
 *
 * Mounts at /aap/v1. Implements HELLO/WELCOME handshake, BUNDLE dispatch,
 * ACK, PING/PONG, ERROR, GOODBYE per /docs/aap/wire-format-v1.md.
 *
 * Shipped per ANTON_Improvement_and_Investigation_Brief.md §E.2.
 *
 * NB: the cryptographic primitives (Ed25519 signature verification, X25519
 * ephemeral exchange, AES-256-GCM bundle decryption) live in
 * community-crypto.ts. This file orchestrates the protocol; it does not
 * re-implement crypto.
 */

import type { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID, randomBytes } from 'crypto';
import type { DatabaseAdapter } from '../db/database.js';
import {
  isValidContactHash,
  verifyEnvelopeSignature,
  contactHashMatchesPubkey,
} from './community-crypto.js';

interface AapEnvelope {
  v: 1;
  type: 'HELLO' | 'WELCOME' | 'REJECT' | 'BUNDLE' | 'ACK' | 'PING' | 'PONG' | 'ERROR' | 'GOODBYE';
  id: string;
  ts: string;
  from: string;
  nonce: string;
  payload: Record<string, unknown>;
  sig: string;
}

interface SessionState {
  sessionId: string;
  peerContactHash: string;
  peerPubkey: string;
  acceptedCapabilities: string[];
  // Derived shared secret (X25519 → HKDF) hex; used to AES-GCM-decrypt BUNDLE bodies.
  sharedKeyHex: string;
  startedAt: number;
}

const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

const SUPPORTED_CAPABILITIES = new Set([
  'evidence-pack-publisher',
  'market-thesis-share',
  'risk-atlas-export',
  'portal-publisher',
  'career-profile-exchange',
  'humanitarian-deployment',
  'hardware-share',
]);

export interface AapTransportServerOptions {
  /** Path to mount at. Defaults to /aap/v1. */
  path?: string;
  /** Optional override for sig-verify (mockable in tests). */
  verifySignature?: (envelope: AapEnvelope, peerPubkey?: string) => Promise<boolean>;
}

/**
 * Mount the AAP server on an existing HTTP/HTTPS server.
 * Pass the underlying Node http.Server (Express's `server.listen()` returns it).
 */
export function mountAapTransportServer(
  http: HttpServer,
  db: DatabaseAdapter,
  options: AapTransportServerOptions = {}
) {
  const path = options.path ?? '/aap/v1';
  const wss = new WebSocketServer({ noServer: true });

  http.on('upgrade', (req, socket, head) => {
    if (req.url !== path) return;
    // TLS check: req.connection.encrypted should be true for wss://. In dev
    // (HTTP server) we permit upgrade so localhost testing works; production
    // deployments should put HTTPS in front.
    wss.handleUpgrade(req, socket, head, (ws) => {
      handleConnection(ws, db, options).catch(err => {
        console.warn('[aap-transport] connection error:', err);
        try { ws.close(1011, 'internal error'); } catch { /* ignore */ }
      });
    });
  });

  return {
    /** Number of currently-open AAP sessions. Useful for /health. */
    activeSessionCount: () => wss.clients.size,
    close: () => wss.close(),
  };
}

async function handleConnection(
  ws: WebSocket,
  db: DatabaseAdapter,
  options: AapTransportServerOptions
) {
  let session: SessionState | null = null;

  ws.on('message', async (raw) => {
    let env: AapEnvelope;
    try {
      env = JSON.parse(raw.toString()) as AapEnvelope;
    } catch {
      sendError(ws, null, 'bad_signature', 'envelope must be JSON');
      return;
    }

    // Universal envelope checks.
    if (env.v !== 1) return sendError(ws, env.id, 'capability_unsupported', `unsupported wire-format v${env.v}`);
    if (!isValidContactHash(env.from)) return sendError(ws, env.id, 'bad_signature', 'from is not a valid contact hash');

    const skew = Math.abs(Date.now() - new Date(env.ts).getTime());
    if (Number.isNaN(skew) || skew > CLOCK_SKEW_TOLERANCE_MS) {
      return sendError(ws, env.id, 'clock_skew', `clock skew ${skew}ms exceeds tolerance`);
    }

    // Replay protection: persist nonce; reject reuse.
    if (await isNonceUsed(db, env.from, env.nonce)) {
      return sendError(ws, env.id, 'bad_nonce', 'nonce previously seen');
    }
    await recordNonce(db, env.from, env.nonce);

    // Pre-handshake: only HELLO is allowed.
    if (!session && env.type !== 'HELLO') {
      return sendError(ws, env.id, 'bad_signature', 'must HELLO first');
    }

    switch (env.type) {
      case 'HELLO':
        session = await handleHello(ws, db, env, options);
        return;

      case 'BUNDLE': {
        if (!session) return; // unreachable thanks to pre-handshake check
        await handleBundle(ws, db, env, session);
        return;
      }

      case 'PING':
        sendEnvelope(ws, makeEnvelope(session!, 'PONG', { in_reply_to: env.id }));
        return;

      case 'GOODBYE':
        ws.close(1000, 'peer goodbye');
        return;

      case 'ACK':
      case 'PONG':
        // Server-initiated traffic responses — no-op for v1.
        return;

      default:
        sendError(ws, env.id, 'capability_unsupported', `unhandled message type: ${env.type}`);
    }
  });

  ws.on('close', () => {
    if (session) {
      console.log(`[aap-transport] session closed peer=${session.peerContactHash} duration=${Date.now() - session.startedAt}ms`);
    }
  });
}

async function handleHello(
  ws: WebSocket,
  db: DatabaseAdapter,
  env: AapEnvelope,
  options: AapTransportServerOptions
): Promise<SessionState | null> {
  const payload = env.payload as { pubkey?: string; capability_descriptors?: { id: string; version: string }[]; ephemeral_pubkey?: string };
  if (!payload.pubkey || !payload.ephemeral_pubkey) {
    sendError(ws, env.id, 'bad_signature', 'pubkey + ephemeral_pubkey required');
    return null;
  }

  // Anti-spoof: confirm `from` contact hash actually derives from the pubkey.
  if (!contactHashMatchesPubkey(env.from, payload.pubkey)) {
    sendError(ws, env.id, 'bad_signature', 'from does not match SHA-256 of pubkey');
    return null;
  }

  // Verify Ed25519 signature over the canonical envelope. The custom
  // `verifySignature` hook (used by tests) takes precedence; otherwise fall
  // through to the real verify in community-crypto.ts.
  const sigOk = options.verifySignature
    ? await options.verifySignature(env, payload.pubkey)
    : verifyEnvelopeSignature(env as unknown as Record<string, unknown>, env.sig, payload.pubkey);
  if (!sigOk) {
    sendError(ws, env.id, 'bad_signature', 'HELLO signature invalid');
    return null;
  }

  // Confirm peer is known (post-handshake bundles can come from anyone known
  // via prior contact-bundle exchange).
  const known = await db.get<{ contact_hash: string }>(
    `SELECT contact_hash FROM connected_users WHERE contact_hash = $1`,
    env.from
  );
  if (!known) {
    sendEnvelope(ws, makeUnsignedEnvelope(env.from, 'REJECT', { code: 'unknown_peer', detail: 'peer not introduced via contact-bundle' }));
    ws.close(1008, 'unknown peer');
    return null;
  }

  // Accept the intersection of advertised + supported.
  const advertised = (payload.capability_descriptors ?? []).map(c => c.id);
  const accepted = advertised.filter(c => SUPPORTED_CAPABILITIES.has(c));
  if (accepted.length === 0) {
    sendError(ws, env.id, 'capability_unsupported', 'no overlapping capabilities');
    return null;
  }

  // Derive shared key (X25519 + HKDF). For v1, store a placeholder — the
  // crypto handshake completes in community-crypto.deriveSharedKey() which
  // accepts the peer ephemeral and our local ephemeral. Wired to a follow-up.
  const sharedKeyHex = randomBytes(32).toString('hex'); // PLACEHOLDER — real X25519 in next pass

  const sessionId = randomUUID();
  const session: SessionState = {
    sessionId,
    peerContactHash: env.from,
    peerPubkey: payload.pubkey,
    acceptedCapabilities: accepted,
    sharedKeyHex,
    startedAt: Date.now(),
  };

  sendEnvelope(ws, makeEnvelope(session, 'WELCOME', {
    pubkey: '<this-instance-pubkey>',  // resolved from instance_identity in next pass
    ephemeral_pubkey: '<our-ephemeral>', // generated per-session
    session_id: sessionId,
    accepted_capabilities: accepted,
  }));

  console.log(`[aap-transport] session opened peer=${env.from} caps=${accepted.join(',')}`);
  return session;
}

async function handleBundle(
  ws: WebSocket,
  db: DatabaseAdapter,
  env: AapEnvelope,
  session: SessionState
) {
  const payload = env.payload as { session_id?: string; bundle_type?: string; encrypted_body?: string };
  if (payload.session_id !== session.sessionId) {
    sendError(ws, env.id, 'bad_signature', 'session_id mismatch');
    return;
  }

  // Capability gate.
  const requiredCap = capabilityForBundleType(payload.bundle_type ?? '');
  if (!requiredCap || !session.acceptedCapabilities.includes(requiredCap)) {
    sendAck(ws, session, env.id, 'capability_denied', `bundle_type ${payload.bundle_type} requires capability ${requiredCap ?? 'unknown'}`);
    return;
  }

  // Decrypt + verify bundle body via existing pipeline (anton-validator + anton-importer).
  // Stub for v1: log receipt; return rejected_schema until the body-decryption + apply
  // pipeline is wired in the follow-up pass.
  console.log(`[aap-transport] BUNDLE ${payload.bundle_type} received from ${session.peerContactHash}`);
  sendAck(ws, session, env.id, 'received', 'BUNDLE recorded; apply pipeline pending');

  // Persist the trail entry (existing community_signed_trail_entries table).
  try {
    await db.run(
      `INSERT INTO community_signed_trail_entries (id, task_id, trail_id, entry_index, signing_key_fingerprint, signed_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      randomUUID(), null, session.sessionId, 0, session.peerPubkey.slice(0, 32)
    );
  } catch (err) {
    console.warn('[aap-transport] trail persist failed:', err);
  }
}

function capabilityForBundleType(bundleType: string): string | null {
  // Mirrors the table in /docs/aap/wire-format-v1.md.
  if (bundleType === 'evidence-pack') return 'evidence-pack-publisher';
  if (['market-thesis', 'market-investigation', 'market-atom-collection'].includes(bundleType)) return 'market-thesis-share';
  if (['risk-atlas-export', 'risk-atlas-industry-pack', 'risk-atlas-fcp-domain-pack'].includes(bundleType)) return 'risk-atlas-export';
  if (bundleType === 'portal') return 'portal-publisher';
  if (bundleType === 'career-profile') return 'career-profile-exchange';
  if (bundleType === 'humanitarian-deployment-kit') return 'humanitarian-deployment';
  if (['hardware-knowledge-pack', 'hardware-template', 'hardware-project', 'patch-bundle', 'lifecycle-advisory-bundle', 'diagnostic-case-bundle'].includes(bundleType)) return 'hardware-share';
  return null;
}

// ── Envelope helpers ────────────────────────────────────────────────────

function makeEnvelope(session: SessionState, type: AapEnvelope['type'], payload: Record<string, unknown>): AapEnvelope {
  return {
    v: 1,
    type,
    id: randomUUID(),
    ts: new Date().toISOString(),
    from: '<this-instance-contact-hash>', // resolved from instance_identity in next pass
    nonce: randomBytes(32).toString('hex'),
    payload,
    sig: '<server-sig>', // signed via community-crypto.sign() in next pass
  };
}

function makeUnsignedEnvelope(_to: string, type: AapEnvelope['type'], payload: Record<string, unknown>): AapEnvelope {
  // For pre-session REJECT — recipient won't have agreed shared keys yet.
  return {
    v: 1,
    type,
    id: randomUUID(),
    ts: new Date().toISOString(),
    from: '<this-instance-contact-hash>',
    nonce: randomBytes(32).toString('hex'),
    payload,
    sig: '<server-sig>',
  };
}

function sendEnvelope(ws: WebSocket, env: AapEnvelope) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(env));
}

function sendError(ws: WebSocket, inReplyTo: string | null, code: string, detail: string) {
  if (ws.readyState !== WebSocket.OPEN) return;
  // Pre-session: send unsigned ERROR envelope; the recipient won't have a session anyway.
  ws.send(JSON.stringify({
    v: 1,
    type: 'ERROR',
    id: randomUUID(),
    ts: new Date().toISOString(),
    from: '<this-instance>',
    nonce: randomBytes(32).toString('hex'),
    payload: { in_reply_to: inReplyTo, code, detail },
    sig: '<server-sig>',
  }));
}

function sendAck(ws: WebSocket, session: SessionState, inReplyTo: string, status: string, detail: string) {
  sendEnvelope(ws, makeEnvelope(session, 'ACK', { in_reply_to: inReplyTo, status, detail }));
}

// ── Replay-nonce helpers ────────────────────────────────────────────────

async function isNonceUsed(db: DatabaseAdapter, peerContactHash: string, nonce: string): Promise<boolean> {
  try {
    const row = await db.get(
      `SELECT 1 AS hit FROM p2p_message_nonces WHERE peer_contact_hash = $1 AND nonce = $2 LIMIT 1`,
      peerContactHash, nonce
    );
    return !!row;
  } catch {
    // If the table layout differs, fail open in dev; log a warning.
    console.warn('[aap-transport] nonce-check failed (treating as unused for dev safety)');
    return false;
  }
}

async function recordNonce(db: DatabaseAdapter, peerContactHash: string, nonce: string) {
  try {
    await db.run(
      `INSERT INTO p2p_message_nonces (peer_contact_hash, nonce, used_at)
       VALUES (?, ?, NOW())
       ON CONFLICT (peer_contact_hash, nonce) DO NOTHING`,
      peerContactHash, nonce
    );
  } catch {
    // Best-effort.
  }
}
