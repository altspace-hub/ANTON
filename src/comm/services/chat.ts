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
import { getContact, listContacts, updateContact } from './contacts';
import { sealForPeer, openFromPeer, type EncryptedEnvelope } from './crypto';
import { appendMessage, applyReaction, applyPollVote, markViewed, type ChatMessage, type ContentKind, type ReplyContext } from './messages';
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
  /** R6 — view-once media: recipient deletes the local copy after viewing
   *  once. Sender's local copy persists with `viewed` set when the peer
   *  confirms. */
  viewOnce?: boolean;
}

/** R2 — emoji reaction payload (does NOT carry messageId; doesn't itself
 *  produce a visible message — it just mutates the target message's
 *  reactions map). */
export interface ReactPayload {
  targetMsgId: string;
  emoji: string;
  op: 'add' | 'remove';
}

/** R4 — voice note payload. Audio bytes (base64), MIME, duration, and a
 *  small waveform array for the bubble player's bars. */
export interface VoicePayload {
  /** Base64 (no data-URL prefix) */
  audio: string;
  mimeType: string;
  durationSec: number;
  /** Per-bucket RMS amplitude in [0, 1], length ≤ 64 */
  waveform: number[];
  /** Bytes (decoded) */
  size: number;
}

/** R5 — peer-side notification that the disappearing-messages timer was
 *  changed by the other party. `timerSec === 0` means Off. */
export interface SystemTimerChangePayload {
  timerSec: number;
}

/** R6 — recipient → sender notification that a view-once media message
 *  has been viewed + dismissed. Sender flips that bubble to "Viewed". */
export interface ViewOnceViewedPayload {
  targetMsgId: string;
}

/** R7 — poll payload. `pollId` equals the wire-level messageId of the
 *  poll itself, so vote payloads can refer to it. The local poll
 *  ChatMessage also persists a `votes: Record<voterHash, optionIdx[]>`
 *  map inside its JSON plaintext, mutated by applyPollVote. */
export interface PollPayload {
  pollId: string;
  question: string;
  options: string[];
  multiSelect: boolean;
  /** Optional ISO expiry — past this time, the bubble disables voting. */
  expiresAt?: string;
}

/** R7 — vote payload. `optionIdx` is an array so multi-select polls can
 *  carry multiple choices; single-select sends a 1-element array.
 *  Empty array clears the voter's vote. */
export interface PollVotePayload {
  pollId: string;
  optionIdx: number[];
}

export type WirePayload =
  | { kind: 'text';          messageId: string; text: string;         replyTo?: ReplyContext; disappearsAt?: string }
  | { kind: 'image';         messageId: string; data: MediaPayload;   replyTo?: ReplyContext; disappearsAt?: string }
  | { kind: 'video';         messageId: string; data: MediaPayload;   replyTo?: ReplyContext; disappearsAt?: string }
  | { kind: 'voice';         messageId: string; data: VoicePayload;   replyTo?: ReplyContext; disappearsAt?: string }
  | { kind: 'react';         data: ReactPayload }
  | { kind: 'view_once_viewed'; data: ViewOnceViewedPayload }
  | { kind: 'poll';          messageId: string; data: PollPayload }
  | { kind: 'poll_vote';     data: PollVotePayload }
  | { kind: 'event_invite';  data: EventInvitePayload }
  | { kind: 'event_rsvp';    data: EventRsvpPayload }
  | { kind: 'event_cancel';  data: EventCancelPayload }
  | { kind: 'system_timer_change'; data: SystemTimerChangePayload }
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

  // R5 — auto-stamp disappearsAt on stampable kinds when the chat has a
  // timer set. Caller-supplied value wins. Stamping happens before sealing
  // so the recipient gets the same timestamp.
  const stampable = wire.kind === 'text' || wire.kind === 'image'
    || wire.kind === 'video' || wire.kind === 'voice';
  if (stampable && !wire.disappearsAt && contact.disappearingTimerSec && contact.disappearingTimerSec > 0) {
    wire.disappearsAt = new Date(Date.now() + contact.disappearingTimerSec * 1000).toISOString();
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
      || wire.kind === 'react' || wire.kind === 'view_once_viewed'
      || wire.kind === 'poll_vote') {
    throw new ChatError(`Wire kind ${wire.kind} should not be persisted as a ChatMessage`, 'INVALID_KIND');
  }

  const localPlaintext = wire.kind === 'text' ? wire.text : JSON.stringify((wire as { data: unknown }).data);
  // R1 — extract replyTo so the local store has it too (round-trip parity).
  const replyTo = stampable ? wire.replyTo : undefined;
  // R7 — polls carry their own messageId so both sides reference the
  // poll by the same id (votes target it). For other non-stampable
  // kinds, messageId comes from the stampable branch.
  const messageId = stampable ? wire.messageId : (wire.kind === 'poll' ? wire.messageId : undefined);
  const disappearsAt = stampable ? wire.disappearsAt : undefined;
  const kind: ContentKind = wire.kind === 'text' || wire.kind === 'image' || wire.kind === 'video' || wire.kind === 'voice'
    || wire.kind === 'event_invite' || wire.kind === 'event_rsvp' || wire.kind === 'event_cancel'
    || wire.kind === 'system_timer_change' || wire.kind === 'poll'
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
    disappearsAt,
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

/** R4 — Send a voice note (base64 audio + waveform in the payload). */
export async function sendVoice(peerContactHash: string, payload: VoicePayload, replyTo?: ReplyContext): Promise<ChatMessage> {
  return sendStructuredMessage(peerContactHash, { kind: 'voice', messageId: generateMsgId(), data: payload, replyTo });
}

/**
 * R7 — Create + send a poll. Generates the pollId locally; both sides
 * use it as the bubble's ChatMessage.id so votes target the same record.
 */
export async function sendPoll(
  peerContactHash: string,
  payload: Omit<PollPayload, 'pollId'>,
): Promise<ChatMessage> {
  const pollId = generateMsgId();
  const full: PollPayload = { ...payload, pollId };
  return sendStructuredMessage(peerContactHash, { kind: 'poll', messageId: pollId, data: full });
}

/**
 * R7 — Cast a vote on a peer's poll (or our own — both sides apply
 * locally + send the wire to keep the other tally in sync).
 *
 * `optionIdx` is the FULL current selection (not a delta). An empty
 * array clears this voter's vote.
 */
export async function sendPollVote(
  peerContactHash: string,
  pollId: string,
  optionIdx: number[],
): Promise<void> {
  const me = getIdentity();
  if (!me) throw new ChatError('No identity', 'NO_IDENTITY');
  const contact = await getContact(peerContactHash);
  if (!contact?.publicKeyHex) return; // best-effort

  // Apply locally first for instant UI
  await applyPollVote(pollId, me.contactHash, optionIdx);

  const wire: WirePayload = { kind: 'poll_vote', data: { pollId, optionIdx } };
  const wireJson = JSON.stringify(wire);
  const client = getRelayClient();
  if (client) await client.sendInlinePayload(peerContactHash, wireJson);
}

/**
 * R6 — confirm to the sender that we've viewed + dismissed a view-once
 * media. The sender's bubble flips to "Viewed". Inline send via the
 * relay client (same pattern as reactions); does not produce a visible
 * message on either side.
 */
export async function sendViewOnceViewed(peerContactHash: string, targetMsgId: string): Promise<void> {
  const me = getIdentity();
  if (!me) throw new ChatError('No identity', 'NO_IDENTITY');
  const contact = await getContact(peerContactHash);
  if (!contact?.publicKeyHex) return; // best-effort; no key means no peer to notify
  const wire: WirePayload = { kind: 'view_once_viewed', data: { targetMsgId } };
  const wireJson = JSON.stringify(wire);
  const client = getRelayClient();
  if (client) await client.sendInlinePayload(peerContactHash, wireJson);
}

/**
 * R5 — Update this chat's disappearing-messages timer.
 *
 * Updates the Contact's `disappearingTimerSec` locally and sends a
 * system_timer_change envelope to the peer so they update their own
 * Contact. A system chip is persisted on both sides so the change is
 * visible in the thread history (Signal-style).
 *
 * `timerSec` of 0 means "Off". Subsequent messages stop being stamped.
 */
export async function sendTimerChange(peerContactHash: string, timerSec: number): Promise<void> {
  await updateContact(peerContactHash, { disappearingTimerSec: timerSec });
  await sendStructuredMessage(peerContactHash, { kind: 'system_timer_change', data: { timerSec } });
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
  } else if (msg.kind === 'system_timer_change') {
    wire = { kind: 'system_timer_change', data: JSON.parse(msg.plaintext) as SystemTimerChangePayload };
  } else if (msg.kind === 'image') {
    wire = { kind: 'image', messageId: msg.id, data: JSON.parse(msg.plaintext) as MediaPayload, replyTo: msg.replyTo, disappearsAt: msg.disappearsAt };
  } else if (msg.kind === 'video') {
    wire = { kind: 'video', messageId: msg.id, data: JSON.parse(msg.plaintext) as MediaPayload, replyTo: msg.replyTo, disappearsAt: msg.disappearsAt };
  } else if (msg.kind === 'voice') {
    wire = { kind: 'voice', messageId: msg.id, data: JSON.parse(msg.plaintext) as VoicePayload, replyTo: msg.replyTo, disappearsAt: msg.disappearsAt };
  } else if (msg.kind === 'poll') {
    // R7 — when re-sealing a queued poll, strip the local `votes` map so
    // the recipient gets a clean PollPayload. Votes are applied via the
    // separate poll_vote wire kind.
    const stored = JSON.parse(msg.plaintext) as PollPayload & { votes?: Record<string, number[]> };
    const clean: PollPayload = {
      pollId: stored.pollId,
      question: stored.question,
      options: stored.options,
      multiSelect: stored.multiSelect,
      expiresAt: stored.expiresAt,
    };
    wire = { kind: 'poll', messageId: msg.id, data: clean };
  } else {
    wire = { kind: 'text', messageId: msg.id, text: msg.plaintext, replyTo: msg.replyTo, disappearsAt: msg.disappearsAt };
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
    const obj = JSON.parse(raw) as { kind?: string; text?: string; data?: unknown; messageId?: string; replyTo?: ReplyContext; disappearsAt?: string };
    if (obj && typeof obj === 'object' && obj.kind) {
      const id = obj.messageId ?? '';
      if (obj.kind === 'text' && typeof obj.text === 'string') {
        return { kind: 'text', messageId: id, text: obj.text, replyTo: obj.replyTo, disappearsAt: obj.disappearsAt };
      }
      if (obj.kind === 'image' && typeof obj.data === 'object' && obj.data) {
        return { kind: 'image', messageId: id, data: obj.data as MediaPayload, replyTo: obj.replyTo, disappearsAt: obj.disappearsAt };
      }
      if (obj.kind === 'video' && typeof obj.data === 'object' && obj.data) {
        return { kind: 'video', messageId: id, data: obj.data as MediaPayload, replyTo: obj.replyTo, disappearsAt: obj.disappearsAt };
      }
      if (obj.kind === 'voice' && typeof obj.data === 'object' && obj.data) {
        return { kind: 'voice', messageId: id, data: obj.data as VoicePayload, replyTo: obj.replyTo, disappearsAt: obj.disappearsAt };
      }
      if (obj.kind === 'react' && typeof obj.data === 'object' && obj.data) {
        return { kind: 'react', data: obj.data as ReactPayload };
      }
      if (obj.kind === 'view_once_viewed' && typeof obj.data === 'object' && obj.data) {
        return { kind: 'view_once_viewed', data: obj.data as ViewOnceViewedPayload };
      }
      if (obj.kind === 'poll' && typeof obj.data === 'object' && obj.data) {
        return { kind: 'poll', messageId: id, data: obj.data as PollPayload };
      }
      if (obj.kind === 'poll_vote' && typeof obj.data === 'object' && obj.data) {
        return { kind: 'poll_vote', data: obj.data as PollVotePayload };
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
      if (obj.kind === 'system_timer_change' && typeof obj.data === 'object' && obj.data) {
        return { kind: 'system_timer_change', data: obj.data as SystemTimerChangePayload };
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

  // R6 — sender-side: the recipient just viewed our view-once media. Flip
  // the bubble to "Viewed" and drop the payload bytes.
  if (wire.kind === 'view_once_viewed') {
    await markViewed(wire.data.targetMsgId);
    return { kind: 'text', threadHash: fromHash };
  }

  // R7 — peer voted on a poll. Update the poll's votes map; no visible
  // bubble of its own (the existing poll bubble re-renders with the new tally).
  if (wire.kind === 'poll_vote') {
    await applyPollVote(wire.data.pollId, fromHash, wire.data.optionIdx);
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
  let disappearsAt: string | undefined;
  switch (wire.kind) {
    case 'text':
      plaintext = wire.text;
      kind = 'text';
      messageId = wire.messageId || undefined;
      replyTo = wire.replyTo;
      disappearsAt = wire.disappearsAt;
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
      disappearsAt = wire.disappearsAt;
      break;
    case 'video':
      plaintext = JSON.stringify(wire.data);
      kind = 'video';
      messageId = wire.messageId || undefined;
      replyTo = wire.replyTo;
      disappearsAt = wire.disappearsAt;
      break;
    case 'voice':
      plaintext = JSON.stringify(wire.data);
      kind = 'voice';
      messageId = wire.messageId || undefined;
      replyTo = wire.replyTo;
      disappearsAt = wire.disappearsAt;
      break;
    case 'system_timer_change':
      // R5 — update our Contact to mirror the peer's setting + persist a chip
      await updateContact(fromHash, { disappearingTimerSec: wire.data.timerSec });
      plaintext = JSON.stringify(wire.data);
      kind = 'system_timer_change';
      break;
    case 'poll':
      // R7 — persist with an empty votes map; subsequent poll_vote
      // wires from either side mutate it via applyPollVote.
      plaintext = JSON.stringify({ ...wire.data, votes: {} });
      kind = 'poll';
      messageId = wire.messageId || wire.data.pollId || undefined;
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
    disappearsAt,
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
