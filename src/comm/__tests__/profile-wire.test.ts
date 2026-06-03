/**
 * profile-wire.test.ts — inbound `profile` wire (#82). A peer broadcasting
 * their display name + avatar must mirror onto THEIR contact row (anti-spoof:
 * the relay-stamped fromHash decides whose row updates), without ever
 * blanking the required displayName, and clearing the avatar when omitted.
 */
import { describe, it, expect } from 'vitest';
import { applyInboundMessage, type WirePayload } from '../services/chat';
import { createIdentity } from '../services/identity';
import { addContact, getContact } from '../services/contacts';

let n = 0;
async function freshContact(): Promise<string> {
  await createIdentity('Me', 'en'); // idempotent — ensures getIdentity() is non-null
  n++;
  const hash = `ANTON-PEER-${String(n).padStart(4, '0')}-XXXX-XXXX`;
  await addContact({ contactHash: hash, displayName: 'Bob', publicKeyHex: 'ab'.repeat(32), source: 'qr' });
  return hash;
}

const wire = (data: Partial<{ displayName: string; avatarImage: string; avatarMime: string; ts: string }>): WirePayload =>
  ({ kind: 'profile', data: { displayName: 'Bob', ts: new Date().toISOString(), ...data } });

describe('profile wire inbound', () => {
  it('mirrors a peer avatar + name onto their contact', async () => {
    const hash = await freshContact();
    await applyInboundMessage(hash, wire({ displayName: 'Bobby', avatarImage: 'AAAA', avatarMime: 'image/jpeg' }));
    const c = await getContact(hash);
    expect(c?.avatarImage).toBe('AAAA');
    expect(c?.avatarMime).toBe('image/jpeg');
    expect(c?.displayName).toBe('Bobby');
  });

  it('never blanks displayName when the profile omits it', async () => {
    const hash = await freshContact();
    await applyInboundMessage(hash, wire({ displayName: '   ', avatarImage: 'BBBB', avatarMime: 'image/png' }));
    const c = await getContact(hash);
    expect(c?.displayName).toBe('Bob'); // preserved, not blanked
    expect(c?.avatarImage).toBe('BBBB');
  });

  it('clears the avatar when a later profile omits the image', async () => {
    const hash = await freshContact();
    await applyInboundMessage(hash, wire({ avatarImage: 'CCCC', avatarMime: 'image/jpeg' }));
    expect((await getContact(hash))?.avatarImage).toBe('CCCC');
    await applyInboundMessage(hash, wire({})); // no avatar → cleared
    expect((await getContact(hash))?.avatarImage).toBeUndefined();
  });

  it('is a no-op for an unknown sender (no contact row to update)', async () => {
    await createIdentity('Me', 'en');
    await applyInboundMessage('ANTON-NONE-NONE-NONE-NONE', wire({ avatarImage: 'ZZZZ' }));
    expect(await getContact('ANTON-NONE-NONE-NONE-NONE')).toBeNull();
  });
});
