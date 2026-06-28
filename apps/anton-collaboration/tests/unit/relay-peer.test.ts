/**
 * relay-peer.test.ts — the agent standalone as a relay peer: a full
 * phone→agent→phone round-trip over a (mocked) Comm-style mailbox, plus the
 * first-contact pubkey-binding guard.
 */
import { describe, it, expect } from 'vitest';
import { generateAgreementKeypair } from '../../src/main/agreement-crypto.js';
import { relayIdentityFrom } from '../../src/main/relay/identity.js';
import { sealForPeer, openFromPeer, type EncryptedEnvelope } from '../../src/main/relay/crypto.js';
import { RelayPeer, defaultRouter } from '../../src/main/relay/peer.js';
import { InMemoryMailbox } from '../../src/main/relay/mailbox-client.js';
import { InMemoryStorageBackend } from '../../src/main/storage.js';

async function pair() {
  const akp = await generateAgreementKeypair();
  const pkp = await generateAgreementKeypair();
  return {
    agent: relayIdentityFrom(akp.privHex, akp.pubHex),
    phone: relayIdentityFrom(pkp.privHex, pkp.pubHex),
  };
}

describe('relay peer round-trip', () => {
  it('phone pings, agent replies pong over the mailbox; the agent learns the phone', async () => {
    const { agent, phone } = await pair();
    const mailbox = new InMemoryMailbox();
    const agentPeer = new RelayPeer(agent, mailbox, new InMemoryStorageBackend(), defaultRouter());

    // Phone (which scanned the agent's QR → has the agent's pubkey) sends the
    // first message, attaching its own pubkey so the agent can open it.
    const env: EncryptedEnvelope = sealForPeer(
      JSON.stringify({ kind: 'ping', text: 'hi' }), phone.x, agent.edPubHex, phone.contactHash, agent.contactHash,
    );
    env.senderPub = phone.edPubHex;
    await mailbox.store({ recipientHash: agent.contactHash, senderHash: phone.contactHash, encryptedPayload: JSON.stringify(env), messageType: 'agent' });

    expect(await agentPeer.pollOnce()).toBe(1);

    const contacts = await agentPeer.listContacts();
    expect(contacts.find((c) => c.hash === phone.contactHash)?.confirmed).toBe(true);

    const replies = await mailbox.collect(phone.contactHash);
    expect(replies).toHaveLength(1);
    const replyEnv = JSON.parse(replies[0].encrypted_payload) as EncryptedEnvelope;
    const pong = JSON.parse(openFromPeer(replyEnv, phone.x, agent.edPubHex, agent.contactHash, phone.contactHash));
    expect(pong.kind).toBe('pong');
    expect(pong.echo).toBe('hi');
  });

  it('drops a first message whose senderPub does not bind to the claimed hash', async () => {
    const { agent, phone } = await pair();
    const mailbox = new InMemoryMailbox();
    const agentPeer = new RelayPeer(agent, mailbox, new InMemoryStorageBackend(), defaultRouter());

    const env: EncryptedEnvelope = sealForPeer(
      JSON.stringify({ kind: 'ping' }), phone.x, agent.edPubHex, phone.contactHash, agent.contactHash,
    );
    env.senderPub = phone.edPubHex;
    // Forge the sender_hash so deriveContactHash(senderPub) !== sender_hash.
    await mailbox.store({ recipientHash: agent.contactHash, senderHash: 'ANTON-FAKE-FAKE-FAKE-FAKE', encryptedPayload: JSON.stringify(env), messageType: 'agent' });

    expect(await agentPeer.pollOnce()).toBe(0);
    expect(await agentPeer.listContacts()).toHaveLength(0);
  });

  it('a returning (known) contact is handled without needing senderPub again', async () => {
    const { agent, phone } = await pair();
    const mailbox = new InMemoryMailbox();
    const storage = new InMemoryStorageBackend();
    const agentPeer = new RelayPeer(agent, mailbox, storage, defaultRouter());

    // First message establishes the contact.
    const first = sealForPeer(JSON.stringify({ kind: 'ping' }), phone.x, agent.edPubHex, phone.contactHash, agent.contactHash);
    first.senderPub = phone.edPubHex;
    await mailbox.store({ recipientHash: agent.contactHash, senderHash: phone.contactHash, encryptedPayload: JSON.stringify(first), messageType: 'agent' });
    await agentPeer.pollOnce();

    // Second message has NO senderPub — the agent uses the stored pubkey.
    const second = sealForPeer(JSON.stringify({ kind: 'ping', text: 'again' }), phone.x, agent.edPubHex, phone.contactHash, agent.contactHash);
    await mailbox.store({ recipientHash: agent.contactHash, senderHash: phone.contactHash, encryptedPayload: JSON.stringify(second), messageType: 'agent' });
    expect(await agentPeer.pollOnce()).toBe(1);

    const replies = await mailbox.collect(phone.contactHash);
    const last = replies[replies.length - 1];
    const pong = JSON.parse(openFromPeer(JSON.parse(last.encrypted_payload) as EncryptedEnvelope, phone.x, agent.edPubHex, agent.contactHash, phone.contactHash));
    expect(pong.echo).toBe('again');
  });
});
