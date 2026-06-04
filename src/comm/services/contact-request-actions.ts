/**
 * contact-request-actions.ts — approve / reject a pending contact request (#68).
 *
 * A leaf module (nothing imports it but the Requests UI) so it can pull in
 * both the contacts store and the chat layer without creating an import cycle.
 *
 * Approve:
 *   1. Add the sender as a mutual contact (confirmed = true — they messaged us,
 *      so they already have us; our replies go as normal messages).
 *   2. Replay the held first message(s) into the chat thread as inbound text,
 *      via the canonical applyInboundMessage path (dedup + threading for free).
 *   3. Delete the request.
 *
 * Reject: just delete the request (no block list in v0.2 — a re-request will
 * reappear in the tray).
 */
import { addContact } from './contacts';
import { applyInboundMessage } from './chat';
import { getContactRequest, deleteContactRequest } from './contact-requests';

export async function approveContactRequest(contactHash: string): Promise<void> {
  const req = await getContactRequest(contactHash);
  if (!req) return;

  await addContact({
    contactHash: req.contactHash,
    displayName: req.displayName,
    publicKeyHex: req.publicKeyHex,
    source: 'qr',
    confirmed: true,
    ...(req.avatarImage ? { avatarImage: req.avatarImage, avatarMime: req.avatarMime } : {}),
  });

  // Replay held messages oldest→newest so they thread in order.
  for (const m of req.heldMessages) {
    await applyInboundMessage(req.contactHash, {
      kind: 'text', messageId: m.messageId, text: m.text,
    });
  }

  await deleteContactRequest(contactHash);
}

export async function rejectContactRequest(contactHash: string): Promise<void> {
  await deleteContactRequest(contactHash);
}
