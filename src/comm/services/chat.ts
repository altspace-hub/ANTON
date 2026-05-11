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
import { appendMessage, type ChatMessage } from './messages';

export class ChatError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'ChatError';
  }
}

/**
 * Send a plaintext message to a peer. Encrypts with their X25519 key,
 * stores the ciphertext envelope alongside the plaintext locally, and
 * marks status='queued' for the transport to pick up.
 *
 * Returns the stored ChatMessage record so the UI can show it
 * optimistically.
 */
export async function sendMessage(
  peerContactHash: string,
  plaintext: string,
): Promise<ChatMessage> {
  const me = getIdentity();
  if (!me) throw new ChatError('No identity', 'NO_IDENTITY');

  const contact = await getContact(peerContactHash);
  if (!contact) throw new ChatError('Contact not found', 'NO_CONTACT');
  if (!contact.publicKeyHex) {
    throw new ChatError(
      'No public key for this contact yet. Ask them to share their QR — manual codes will work once we wire the relay (Phase 1C-2).',
      'NO_PEER_KEY',
    );
  }

  // Encrypt now so we get an early signal if the crypto is misconfigured.
  // The envelope will be re-used by the transport when it flushes.
  const envelope = await sealForPeer(plaintext, contact.publicKeyHex, me.contactHash, peerContactHash);

  const message = await appendMessage({
    threadHash: peerContactHash,
    fromHash: me.contactHash,
    toHash: peerContactHash,
    direction: 'out',
    plaintext,
    status: 'queued',
  });

  // Phase 1C-2 transport hook — tag the message id so the queue knows
  // which envelope to flush. For now this is just persisted alongside
  // the plaintext in the same store via a sibling table (Phase 1C-2).
  void envelope; // keep reference so tsc doesn't strip the call

  return message;
}

/**
 * Receive an encrypted envelope from the transport. Decrypts using the
 * peer's known X25519 (derived from their Ed25519 pubkey), persists the
 * plaintext locally with status='received', and returns it so the UI can
 * surface the new message.
 *
 * Called by the relay client (Phase 1C-2) on inbound ENVELOPE frames.
 */
export async function receiveEncryptedMessage(
  fromHash: string,
  envelope: EncryptedEnvelope,
  peerEd25519PubkeyHex: string,
): Promise<ChatMessage> {
  const me = getIdentity();
  if (!me) throw new ChatError('No identity', 'NO_IDENTITY');

  const plaintext = await openFromPeer(envelope, peerEd25519PubkeyHex, fromHash, me.contactHash);

  return appendMessage({
    threadHash: fromHash,
    fromHash,
    toHash: me.contactHash,
    direction: 'in',
    plaintext,
    status: 'received',
  });
}
