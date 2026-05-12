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
import { getContact, listContacts } from './contacts';
import { sealForPeer, openFromPeer, type EncryptedEnvelope } from './crypto';
import { appendMessage, applyReaction, type ChatMessage, type ContentKind, type ReplyContext } from './messages';
import { getRelayClient } from './relay-client';
import {
  applyInboundInvite,
  applyInboundRsvp,
  type EventInvitePayload,
  type EventRsvpPayload,
  type EventCancelPayload,
} from './events';
import {
  applyInboundPost,
  applyInboundLike,
  applyInboundComment,
  applyInboundDelete,
  putPost,
  type WassupPostWire,
  type WassupLikeWire,
  type WassupCommentWire,
  type WassupDeleteWire,
  type WassupMedia,
  defaultExpiryFromNow,
  generatePostId,
  putInteraction,
  generateInteractionId,
  refreshPostCounters,
  removeLike,
  hasLiked,
} from './wassup';

// ── Wire payload — JSON-tagged envelope inside the encrypted ciphertext ──
//
// Backward-compatible: if the decrypted JSON is malformed or missing `kind`,
// the receiver falls back to treating the whole plaintext as text.

export interface MediaPayload {
  /** Base64 (no data-URL prefix) — image bytes or video bytes */
  data: string;
  mimeType: string;
  filename: string;
  /** Bytes (decoded size) */
  size: number;
  width?: number;
  height?: number;
  /** Video duration in seconds (best-effort) */
  durationSec?: number;
  /** Optional caption text alongside the media */
  caption?: string;
}

/** R2 — emoji reaction payload (does NOT carry messageId; doesn't itself
 *  produce a visible message — it just mutates the target message's
 *  reactions map). */
export interface ReactPayload {
  targetMsgId: string;
  emoji: string;
  op: 'add' | 'remove';
}

export type WirePayload =
  | { kind: 'text';          messageId: string; text: string;         replyTo?: ReplyContext }
  | { kind: 'image';         messageId: string; data: MediaPayload;   replyTo?: ReplyContext }
  | { kind: 'video';         messageId: string; data: MediaPayload;   replyTo?: ReplyContext }
  | { kind: 'react';         data: ReactPayload }
  | { kind: 'event_invite';  data: EventInvitePayload }
  | { kind: 'event_rsvp';    data: EventRsvpPayload }
  | { kind: 'event_cancel';  data: EventCancelPayload }
  | { kind: 'wassup_post';   data: WassupPostWire }
  | { kind: 'wassup_like';   data: WassupLikeWire }
  | { kind: 'wassup_comment'; data: WassupCommentWire }
  | { kind: 'wassup_delete'; data: WassupDeleteWire };

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
 *
 * R1: optional `replyTo` to send as a quoted reply to a prior message.
 */
export async function sendMessage(
  peerContactHash: string,
  plaintext: string,
  replyTo?: ReplyContext,
): Promise<ChatMessage> {
  const messageId = generateMsgId();
  return sendStructuredMessage(peerContactHash, { kind: 'text', messageId, text: plaintext, replyTo });
}

/** Generate an explicit message id that travels on the wire. Both sender
 *  and recipient use the same id to refer to the same message (required
 *  for R1 reply lookups and R2 reaction targeting). */
function generateMsgId(): string {
  const ts = Date.now();
  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let prefix = '';
  let n = ts;
  for (let i = 0; i < 10; i++) { prefix = CHARS[n & 31] + prefix; n = Math.floor(n / 32); }
  const rnd = crypto.getRandomValues(new Uint8Array(10));
  let suffix = '';
  for (let i = 0; i < 10; i++) suffix += CHARS[rnd[i] & 31];
  return prefix + suffix;
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

  // Wassup wire payloads don't create visible chat messages and don't go
  // through this path. publishWassupPost / toggleWassupLike / postWassupComment
  // bypass sendStructuredMessage and send inline via the relay client.
  if (wire.kind === 'wassup_post' || wire.kind === 'wassup_like'
      || wire.kind === 'wassup_comment' || wire.kind === 'wassup_delete'
      || wire.kind === 'react') {
    throw new ChatError(`Wire kind ${wire.kind} should not be persisted as a ChatMessage`, 'INVALID_KIND');
  }

  const localPlaintext = wire.kind === 'text' ? wire.text : JSON.stringify((wire as { data: unknown }).data);
  // R1 — extract replyTo so the local store has it too (round-trip parity).
  const replyTo = (wire.kind === 'text' || wire.kind === 'image' || wire.kind === 'video') ? wire.replyTo : undefined;
  const messageId = (wire.kind === 'text' || wire.kind === 'image' || wire.kind === 'video')
    ? wire.messageId : undefined;
  const kind: ContentKind = wire.kind === 'text' || wire.kind === 'image' || wire.kind === 'video'
    || wire.kind === 'event_invite' || wire.kind === 'event_rsvp' || wire.kind === 'event_cancel'
    ? wire.kind
    : 'text';
  const message = await appendMessage({
    id: messageId,
    threadHash: peerContactHash,
    fromHash: me.contactHash,
    toHash: peerContactHash,
    direction: 'out',
    plaintext: localPlaintext,
    status: 'queued',
    kind,
    replyTo,
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

/** Send an image attachment (base64 already in the payload). */
export async function sendImage(peerContactHash: string, payload: MediaPayload, replyTo?: ReplyContext): Promise<ChatMessage> {
  return sendStructuredMessage(peerContactHash, { kind: 'image', messageId: generateMsgId(), data: payload, replyTo });
}

/** Send a video attachment (base64 already in the payload). */
export async function sendVideo(peerContactHash: string, payload: MediaPayload, replyTo?: ReplyContext): Promise<ChatMessage> {
  return sendStructuredMessage(peerContactHash, { kind: 'video', messageId: generateMsgId(), data: payload, replyTo });
}

// ── R3 — Wassup feed: client-fanout send paths ────────────────────────

const WASSUP_MAX_RECIPIENTS = 256;

/**
 * Publish a Wassup post: persist locally, then fan out a wassup_post
 * payload to every contact that has a public key. Audience defaults to
 * all contacts (v1 — circles deferred).
 */
export async function publishWassupPost(input: { text: string; image?: WassupMedia }): Promise<void> {
  const me = getIdentity();
  if (!me) throw new ChatError('No identity', 'NO_IDENTITY');

  const postId = generatePostId();
  const createdAt = new Date().toISOString();
  const expiresAt = defaultExpiryFromNow();
  const wire: WassupPostWire = {
    postId,
    authorHash: me.contactHash,
    authorName: me.displayName,
    text: input.text,
    image: input.image,
    createdAt,
    expiresAt,
  };

  // Persist locally first so the feed updates instantly
  await putPost({
    id: postId,
    authorHash: me.contactHash,
    authorName: me.displayName,
    text: input.text,
    image: input.image,
    createdAt,
    expiresAt,
    likeCount: 0,
    commentCount: 0,
  });

  // Fan out to all contacts with a known publicKey
  const contacts = (await listContacts()).filter(c => !!c.publicKeyHex).slice(0, WASSUP_MAX_RECIPIENTS);
  const wireJson = JSON.stringify({ kind: 'wassup_post', data: wire });

  await Promise.all(contacts.map(async (c) => {
    try {
      const client = getRelayClient();
      if (client) await client.sendInlinePayload(c.contactHash, wireJson);
    } catch (err) {
      console.warn('[wassup] post fanout failed for', c.contactHash, err);
    }
  }));
}

/** Toggle like on a post: write locally + notify the post's author (only). */
export async function toggleWassupLike(post: { id: string; authorHash: string }): Promise<void> {
  const me = getIdentity();
  if (!me) throw new ChatError('No identity', 'NO_IDENTITY');

  const already = await hasLiked(post.id, me.contactHash);
  const op: 'add' | 'remove' = already ? 'remove' : 'add';

  // Apply locally for instant feedback
  if (op === 'add') {
    await putInteraction({
      id: generateInteractionId(),
      postId: post.id,
      kind: 'like',
      fromHash: me.contactHash,
      fromName: me.displayName,
      ts: new Date().toISOString(),
    });
  } else {
    await removeLike(post.id, me.contactHash);
  }
  await refreshPostCounters(post.id);

  // Notify the author only (likes don't fan out to the whole audience —
  // per the design spec, author re-broadcasts counts periodically). v1
  // skips the meta re-broadcast.
  if (post.authorHash === me.contactHash) return; // own post
  const wire: WassupLikeWire = {
    postId: post.id,
    reactorHash: me.contactHash,
    reactorName: me.displayName,
    op,
  };
  const wireJson = JSON.stringify({ kind: 'wassup_like', data: wire });
  const client = getRelayClient();
  if (client) await client.sendInlinePayload(post.authorHash, wireJson);
}

/** Post a comment on a post: write locally + notify the post's author. */
export async function postWassupComment(post: { id: string; authorHash: string }, text: string): Promise<void> {
  const me = getIdentity();
  if (!me) throw new ChatError('No identity', 'NO_IDENTITY');

  const ts = new Date().toISOString();
  await putInteraction({
    id: generateInteractionId(),
    postId: post.id,
    kind: 'comment',
    fromHash: me.contactHash,
    fromName: me.displayName,
    text,
    ts,
  });
  await refreshPostCounters(post.id);

  if (post.authorHash === me.contactHash) return;
  const wire: WassupCommentWire = {
    postId: post.id,
    commenterHash: me.contactHash,
    commenterName: me.displayName,
    text,
    ts,
  };
  const wireJson = JSON.stringify({ kind: 'wassup_comment', data: wire });
  const client = getRelayClient();
  if (client) await client.sendInlinePayload(post.authorHash, wireJson);
}

/**
 * R2 — send an emoji reaction to a target message. The reaction does NOT
 * appear as a visible message on either side; it mutates the target
 * message's `reactions` map locally and is sent to the peer so they can
 * mutate their copy too.
 */
export async function sendReaction(
  peerContactHash: string,
  targetMsgId: string,
  emoji: string,
  op: 'add' | 'remove',
): Promise<void> {
  const me = getIdentity();
  if (!me) throw new ChatError('No identity', 'NO_IDENTITY');
  const contact = await getContact(peerContactHash);
  if (!contact?.publicKeyHex) throw new ChatError('No peer key', 'NO_PEER_KEY');

  // Apply locally first so the UI updates instantly
  await applyReaction(targetMsgId, emoji, me.contactHash, op);

  const wire: WirePayload = { kind: 'react', data: { targetMsgId, emoji, op } };
  const wireJson = JSON.stringify(wire);
  const envelope = await sealForPeer(wireJson, contact.publicKeyHex, me.contactHash, peerContactHash);
  // Reactions go over the wire but we don't persist them as visible
  // messages. The relay-client transport flushes outbound envelopes,
  // not ChatMessage records — so we need an alternative path here: send
  // it inline via the relay client (the transport will deliver from its
  // queue if open, otherwise drop). For v1, send through the live
  // connection only — reactions don't queue if offline.
  void envelope;
  const client = getRelayClient();
  if (client) await client.sendInlinePayload(peerContactHash, wireJson);
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
  } else if (msg.kind === 'image') {
    wire = { kind: 'image', messageId: msg.id, data: JSON.parse(msg.plaintext) as MediaPayload, replyTo: msg.replyTo };
  } else if (msg.kind === 'video') {
    wire = { kind: 'video', messageId: msg.id, data: JSON.parse(msg.plaintext) as MediaPayload, replyTo: msg.replyTo };
  } else {
    wire = { kind: 'text', messageId: msg.id, text: msg.plaintext, replyTo: msg.replyTo };
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
    const obj = JSON.parse(raw) as { kind?: string; text?: string; data?: unknown; messageId?: string; replyTo?: ReplyContext };
    if (obj && typeof obj === 'object' && obj.kind) {
      const id = obj.messageId ?? '';
      if (obj.kind === 'text' && typeof obj.text === 'string') {
        return { kind: 'text', messageId: id, text: obj.text, replyTo: obj.replyTo };
      }
      if (obj.kind === 'image' && typeof obj.data === 'object' && obj.data) {
        return { kind: 'image', messageId: id, data: obj.data as MediaPayload, replyTo: obj.replyTo };
      }
      if (obj.kind === 'video' && typeof obj.data === 'object' && obj.data) {
        return { kind: 'video', messageId: id, data: obj.data as MediaPayload, replyTo: obj.replyTo };
      }
      if (obj.kind === 'react' && typeof obj.data === 'object' && obj.data) {
        return { kind: 'react', data: obj.data as ReactPayload };
      }
      if (obj.kind === 'event_invite' && typeof obj.data === 'object' && obj.data) {
        return { kind: 'event_invite', data: obj.data as EventInvitePayload };
      }
      if (obj.kind === 'event_rsvp' && typeof obj.data === 'object' && obj.data) {
        return { kind: 'event_rsvp', data: obj.data as EventRsvpPayload };
      }
      if (obj.kind === 'event_cancel' && typeof obj.data === 'object' && obj.data) {
        return { kind: 'event_cancel', data: obj.data as EventCancelPayload };
      }
      if (obj.kind === 'wassup_post' && typeof obj.data === 'object' && obj.data) {
        return { kind: 'wassup_post', data: obj.data as WassupPostWire };
      }
      if (obj.kind === 'wassup_like' && typeof obj.data === 'object' && obj.data) {
        return { kind: 'wassup_like', data: obj.data as WassupLikeWire };
      }
      if (obj.kind === 'wassup_comment' && typeof obj.data === 'object' && obj.data) {
        return { kind: 'wassup_comment', data: obj.data as WassupCommentWire };
      }
      if (obj.kind === 'wassup_delete' && typeof obj.data === 'object' && obj.data) {
        return { kind: 'wassup_delete', data: obj.data as WassupDeleteWire };
      }
    }
  } catch {
    /* fall through */
  }
  return { kind: 'text', messageId: '', text: raw };
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

  // R2 — reactions don't create a visible message; just mutate the target.
  if (wire.kind === 'react') {
    await applyReaction(wire.data.targetMsgId, wire.data.emoji, fromHash, wire.data.op);
    return { kind: 'text', threadHash: fromHash };
  }

  // R3 — Wassup feed messages don't appear in the chat thread; they
  // update the feed store + interactions.
  if (wire.kind === 'wassup_post')    { await applyInboundPost(wire.data);    return { kind: 'text', threadHash: fromHash }; }
  if (wire.kind === 'wassup_like')    { await applyInboundLike(wire.data);    return { kind: 'text', threadHash: fromHash }; }
  if (wire.kind === 'wassup_comment') { await applyInboundComment(wire.data); return { kind: 'text', threadHash: fromHash }; }
  if (wire.kind === 'wassup_delete')  { await applyInboundDelete(wire.data);  return { kind: 'text', threadHash: fromHash }; }

  let plaintext: string;
  let kind: ContentKind;
  let messageId: string | undefined;
  let replyTo: ReplyContext | undefined;
  switch (wire.kind) {
    case 'text':
      plaintext = wire.text;
      kind = 'text';
      messageId = wire.messageId || undefined;
      replyTo = wire.replyTo;
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
    case 'image':
      plaintext = JSON.stringify(wire.data);
      kind = 'image';
      messageId = wire.messageId || undefined;
      replyTo = wire.replyTo;
      break;
    case 'video':
      plaintext = JSON.stringify(wire.data);
      kind = 'video';
      messageId = wire.messageId || undefined;
      replyTo = wire.replyTo;
      break;
  }
  await appendMessage({
    id: messageId,
    threadHash: fromHash,
    fromHash,
    toHash: me.contactHash,
    direction: 'in',
    plaintext,
    status: 'received',
    kind,
    replyTo,
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
