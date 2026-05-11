/**
 * chat.ts — Send/receive orchestration for the Comm App.
 *
 * Phase 1C-1: the transport is stubbed. sendMessage() encrypts the
 * plaintext + appends it to the local message store with status='queued'.
 * The actual relay delivery lands in Phase 1C-2 — a separate module
 * (relay-client.ts) will subscribe to the queue, push frames over
 * WebSocket, and flip status to 'sent' on ACK.
 *
 * Receive is wired symmetrically: the relay client will decode an
 * inbound ENVELOPE, call receiveEncryptedMessage(), and the message
 * appears in the thread automatically.
 */

import { getIdentity } from './identity';
import { getContact } from './contacts';
import { sealForPeer, openFromPeer, type EncryptedEnvelope } from './crypto';
import { appendMessage, type ChatMessage, type ContentKind } from './messages';
import { getRelayClient } from './relay-client';
import {
  applyInboundInvite,
  applyInboundRsvp,
  type EventInvitePayload,
  type EventRsvpPayload,
  type EventCancelPayload,
} from './events';

// ── Wire payload — JSON-tagged envelope inside the encrypted ciphertext ──
//
// Backward-compatible: if the decrypted JSON is malformed or missing `kind`,
// the receiver falls back to treating the whole plaintext as text.

export type WirePayload =
  | { kind: 'text'; text: string }
  | { kind: 'event_invite'; data: EventInvitePayload }
  | { kind: 'event_rsvp'; data: EventRsvpPayload }
  | { kind: 'event_cancel'; data: EventCancelPayload };

export class ChatError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'ChatError';
  }
}

/**
 * Send a plaintext text message to a peer. Convenience wrapper for the
 * default kind='text' case. Encrypts with the peer's X25519 key, stores
 * locally as status='queued', kicks the relay client to flush.
 */
export async function sendMessage(
  peerContactHash: string,
  plaintext: string,
): Promise<ChatMessage> {
  return sendStructuredMessage(peerContactHash, { kind: 'text', text: plaintext });
}

/**
 * General send path used by sendMessage + sendEventInvite + sendEventRsvp.
 * `wire` is the structured payload that will be JSON-encoded inside the
 * encrypted ciphertext. The ChatMessage stored locally carries `plaintext`
 * shaped per kind:
 *   - text: the text string
 *   - event_*: JSON.stringify of the data field
 */
export async function sendStructuredMessage(
  peerContactHash: string,
  wire: WirePayload,
): Promise<ChatMessage> {
  const me = getIdentity();
  if (!me) throw new ChatError('No identity', 'NO_IDENTITY');

  const contact = await getContact(peerContactHash);
  if (!contact) throw new ChatError('Contact not found', 'NO_CONTACT');
  if (!contact.publicKeyHex) {
    throw new ChatError(
      'No public key for this contact yet. Ask them to share their QR — manual codes need a key exchange before messaging.',
      'NO_PEER_KEY',
    );
  }

  // Encrypt eagerly to surface crypto errors at send time. Transport re-seals
  // at flush time (fresh salt = fresh per-message key).
  const wireJson = JSON.stringify(wire);
  const envelope = await sealForPeer(wireJson, contact.publicKeyHex, me.contactHash, peerContactHash);
  void envelope;

  const localPlaintext = wire.kind === 'text' ? wire.text : JSON.stringify(wire.data);
  const message = await appendMessage({
    threadHash: peerContactHash,
    fromHash: me.contactHash,
    toHash: peerContactHash,
    direction: 'out',
    plaintext: localPlaintext,
    status: 'queued',
    kind: wire.kind,
  });

  void getRelayClient()?.flushOutbox();

  return message;
}

/** Send an event_invite message to a single invitee. */
export async function sendEventInvite(invitee: string, payload: EventInvitePayload): Promise<ChatMessage> {
  return sendStructuredMessage(invitee, { kind: 'event_invite', data: payload });
}

/** Send an event_rsvp to the event creator. */
export async function sendEventRsvp(creatorHash: string, payload: EventRsvpPayload): Promise<ChatMessage> {
  return sendStructuredMessage(creatorHash, { kind: 'event_rsvp', data: payload });
}

/** Send an event_cancel to all original invitees. */
export async function sendEventCancel(toHash: string, payload: EventCancelPayload): Promise<ChatMessage> {
  return sendStructuredMessage(toHash, { kind: 'event_cancel', data: payload });
}

/**
 * Helper used by relay-client.ts to re-seal a queued message at flush time.
 * Rebuilds the wire JSON from the stored ChatMessage's kind + plaintext.
 * Returns null if the peer pubkey isn't available (manual-add contact whose
 * key hasn't arrived yet); the client should leave the message queued.
 */
export async function sealForPeerFromQueued(msg: ChatMessage): Promise<EncryptedEnvelope | null> {
  const me = getIdentity();
  if (!me) return null;
  const peer = await getContact(msg.toHash);
  if (!peer?.publicKeyHex) return null;

  let wire: WirePayload;
  if (msg.kind === 'event_invite') {
    wire = { kind: 'event_invite', data: JSON.parse(msg.plaintext) as EventInvitePayload };
  } else if (msg.kind === 'event_rsvp') {
    wire = { kind: 'event_rsvp', data: JSON.parse(msg.plaintext) as EventRsvpPayload };
  } else if (msg.kind === 'event_cancel') {
    wire = { kind: 'event_cancel', data: JSON.parse(msg.plaintext) as EventCancelPayload };
  } else {
    wire = { kind: 'text', text: msg.plaintext };
  }
  const wireJson = JSON.stringify(wire);
  return sealForPeer(wireJson, peer.publicKeyHex, me.contactHash, msg.toHash);
}

/**
 * Parse an inbound decrypted wire payload. Returns a normalised shape the
 * transport layer hands off to applyInboundMessage().
 *
 * Backward-compatible: if the bytes aren't tagged JSON, treat the whole
 * string as text (matches Phase 1C-1 message bytes).
 */
export function parseWirePayload(raw: string): WirePayload {
  try {
    const obj = JSON.parse(raw) as Partial<WirePayload>;
    if (obj && typeof obj === 'object' && 'kind' in obj) {
      if (obj.kind === 'text' && typeof (obj as { text?: unknown }).text === 'string') {
        return { kind: 'text', text: (obj as { text: string }).text };
      }
      if (obj.kind === 'event_invite' && typeof (obj as { data?: unknown }).data === 'object') {
        return { kind: 'event_invite', data: (obj as { data: EventInvitePayload }).data };
      }
      if (obj.kind === 'event_rsvp' && typeof (obj as { data?: unknown }).data === 'object') {
        return { kind: 'event_rsvp', data: (obj as { data: EventRsvpPayload }).data };
      }
      if (obj.kind === 'event_cancel' && typeof (obj as { data?: unknown }).data === 'object') {
        return { kind: 'event_cancel', data: (obj as { data: EventCancelPayload }).data };
      }
    }
  } catch {
    /* fall through */
  }
  return { kind: 'text', text: raw };
}

/**
 * Apply an inbound wire payload: side-effects on events store + persist
 * the ChatMessage record. Called by relay-client.ts after decryption.
 * Returns the kind so the caller can route UI notifications appropriately.
 */
export async function applyInboundMessage(
  fromHash: string,
  wire: WirePayload,
): Promise<{ kind: ContentKind; threadHash: string }> {
  const me = getIdentity();
  if (!me) throw new ChatError('No identity', 'NO_IDENTITY');

  let plaintext: string;
  let kind: ContentKind;
  switch (wire.kind) {
    case 'text':
      plaintext = wire.text;
      kind = 'text';
      break;
    case 'event_invite':
      await applyInboundInvite(wire.data, fromHash);
      plaintext = JSON.stringify(wire.data);
      kind = 'event_invite';
      break;
    case 'event_rsvp':
      await applyInboundRsvp(wire.data, fromHash);
      plaintext = JSON.stringify(wire.data);
      kind = 'event_rsvp';
      break;
    case 'event_cancel':
      plaintext = JSON.stringify(wire.data);
      kind = 'event_cancel';
      break;
  }
  await appendMessage({
    threadHash: fromHash,
    fromHash,
    toHash: me.contactHash,
    direction: 'in',
    plaintext,
    status: 'received',
    kind,
  });
  return { kind, threadHash: fromHash };
}

/**
 * Receive an encrypted envelope from the transport. Decrypts using the
 * peer's known X25519 (derived from their Ed25519 pubkey), parses the
 * wire payload, applies side-effects (event store updates), persists the
 * ChatMessage record.
 */
export async function receiveEncryptedMessage(
  fromHash: string,
  envelope: EncryptedEnvelope,
  peerEd25519PubkeyHex: string,
): Promise<{ kind: ContentKind; threadHash: string }> {
  const me = getIdentity();
  if (!me) throw new ChatError('No identity', 'NO_IDENTITY');
  const wireJson = await openFromPeer(envelope, peerEd25519PubkeyHex, fromHash, me.contactHash);
  const wire = parseWirePayload(wireJson);
  return applyInboundMessage(fromHash, wire);
}
