/**
 * relay-task-router.test.ts — the human↔agent TASK INBOX over the relay
 * channel: post → list → (brain reply via local store) → thread → follow-up,
 * and the isolation check that commerce verbs are NOT exposed to the phone.
 */
import { describe, it, expect } from 'vitest';
import { generateAgreementKeypair } from '../../src/main/agreement-crypto.js';
import { relayIdentityFrom, type RelayIdentity } from '../../src/main/relay/identity.js';
import { sealForPeer, openFromPeer, type EncryptedEnvelope } from '../../src/main/relay/crypto.js';
import { RelayPeer, type RelayWire } from '../../src/main/relay/peer.js';
import { InMemoryMailbox } from '../../src/main/relay/mailbox-client.js';
import { InMemoryStorageBackend } from '../../src/main/storage.js';
import { TaskStore } from '../../src/main/task-store.js';
import { taskRouter } from '../../src/main/relay/task-router.js';

/** A minimal phone-side client over the mailbox (seal→store / collect→open). */
function phoneClient(phone: RelayIdentity, agent: RelayIdentity, mailbox: InMemoryMailbox) {
  let first = true;
  return {
    async send(wire: RelayWire): Promise<void> {
      const env = sealForPeer(JSON.stringify(wire), phone.x, agent.edPubHex, phone.contactHash, agent.contactHash);
      if (first) { env.senderPub = phone.edPubHex; first = false; }
      await mailbox.store({ recipientHash: agent.contactHash, senderHash: phone.contactHash, encryptedPayload: JSON.stringify(env), messageType: 'agent' });
    },
    async collect(): Promise<RelayWire[]> {
      const msgs = await mailbox.collect(phone.contactHash);
      return msgs.map((m) => JSON.parse(openFromPeer(JSON.parse(m.encrypted_payload) as EncryptedEnvelope, phone.x, agent.edPubHex, agent.contactHash, phone.contactHash)) as RelayWire);
    },
  };
}

async function setup() {
  const akp = await generateAgreementKeypair();
  const pkp = await generateAgreementKeypair();
  const agent = relayIdentityFrom(akp.privHex, akp.pubHex);
  const phone = relayIdentityFrom(pkp.privHex, pkp.pubHex);
  const mailbox = new InMemoryMailbox();
  const tasks = new TaskStore(new InMemoryStorageBackend());
  const peer = new RelayPeer(agent, mailbox, new InMemoryStorageBackend(), taskRouter(tasks));
  return { agent, phone, mailbox, tasks, peer, ph: phoneClient(phone, agent, mailbox) };
}

describe('task inbox over the relay channel', () => {
  it('post → list → brain reply → thread → follow-up', async () => {
    const { tasks, peer, ph } = await setup();

    await ph.send({ kind: 'task.post', id: 'r1', text: 'Book a table for two' });
    await peer.pollOnce();
    let r = await ph.collect();
    expect(r[0].kind).toBe('task.created');
    expect(r[0].id).toBe('r1');
    const taskId = r[0].taskId as string;

    await ph.send({ kind: 'task.list', id: 'r2' });
    await peer.pollOnce();
    r = await ph.collect();
    expect(r[0].kind).toBe('task.list');
    const list = r[0].tasks as Array<{ lastRole: string }>;
    expect(list).toHaveLength(1);
    expect(list[0].lastRole).toBe('human');

    // The agent's brain replies over the LOCAL store (role:'agent').
    await tasks.appendMessage(taskId, 'agent', 'Booked! 7pm.');

    await ph.send({ kind: 'task.messages', id: 'r3', taskId });
    await peer.pollOnce();
    r = await ph.collect();
    expect(r[0].kind).toBe('task.thread');
    const msgs = r[0].messages as Array<{ role: string; text: string }>;
    expect(msgs.map((m) => m.role)).toEqual(['human', 'agent']);
    expect(msgs[1].text).toBe('Booked! 7pm.');

    await ph.send({ kind: 'task.message', id: 'r4', taskId, text: 'also vegetarian' });
    await peer.pollOnce();
    r = await ph.collect();
    expect(r[0].kind).toBe('task.ack');
    const t = await tasks.getTask(taskId);
    const lastMsg = t!.messages[t!.messages.length - 1];
    expect(lastMsg.role).toBe('human');
    expect(lastMsg.text).toBe('also vegetarian');
  });

  it('the phone can cancel a task via setStatus', async () => {
    const { peer, ph, tasks } = await setup();
    await ph.send({ kind: 'task.post', id: 'a', text: 'a task' });
    await peer.pollOnce();
    const taskId = (await ph.collect())[0].taskId as string;
    await ph.send({ kind: 'task.setStatus', id: 'b', taskId, status: 'cancelled' });
    await peer.pollOnce();
    const r = await ph.collect();
    expect(r[0].kind).toBe('task.status');
    expect(r[0].status).toBe('cancelled');
    expect((await tasks.getTask(taskId))!.status).toBe('cancelled');
  });

  it('commerce verbs are NOT routed over the phone channel (no reply)', async () => {
    const { peer, ph } = await setup();
    await ph.send({ kind: 'searchSellers', id: 'x', text: 'shoes' });
    await peer.pollOnce();
    expect(await ph.collect()).toHaveLength(0); // unknown wire → ignored
  });
});
