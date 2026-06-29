/**
 * relay-wallet-router.test.ts — the wallet view over the relay channel: the
 * phone reads wallet.status / wallet.transactions through the collab standalone,
 * which proxies Agent Pay read-only. Covers reachable, offline, expired-bearer,
 * and unconfigured paths, plus composition with the task router (both work; ping
 * still pongs; commerce verbs stay isolated; spends are never proxied).
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
import { walletRouter } from '../../src/main/relay/wallet-router.js';
import { composeRouters } from '../../src/main/relay/compose-router.js';
import {
  AgentPayUnreachableError, AgentPayRpcError,
  type AgentPayReader, type AgentPayTx,
} from '../../src/main/relay/agent-pay-client.js';

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

const TXS: AgentPayTx[] = [
  { txId: 't1', amount: 1.5, direction: 'in', counterparty: 'fc_abc', ts: 1000, confirmed: true },
  { txId: 't2', amount: 0.2, direction: 'out', counterparty: 'fc_def', ts: 2000, confirmed: false },
];

const okReader: AgentPayReader = {
  async getStatus() { return { walletAddress: 'fc_wallet9', balanceFtc: 9.8, lastSeenBlock: 42 }; },
  async listTransactions(limit = 25) { return TXS.slice(0, limit); },
};

async function setup(reader: AgentPayReader | undefined) {
  const akp = await generateAgreementKeypair();
  const pkp = await generateAgreementKeypair();
  const agent = relayIdentityFrom(akp.privHex, akp.pubHex);
  const phone = relayIdentityFrom(pkp.privHex, pkp.pubHex);
  const mailbox = new InMemoryMailbox();
  const tasks = new TaskStore(new InMemoryStorageBackend());
  const router = composeRouters(taskRouter(tasks), walletRouter(() => reader));
  const peer = new RelayPeer(agent, mailbox, new InMemoryStorageBackend(), router);
  return { agent, phone, mailbox, tasks, peer, ph: phoneClient(phone, agent, mailbox) };
}

describe('wallet view over the relay channel', () => {
  it('wallet.status returns the agent-pay snapshot (id echoed)', async () => {
    const { peer, ph } = await setup(okReader);
    await ph.send({ kind: 'wallet.status', id: 'w1' });
    await peer.pollOnce();
    const r = await ph.collect();
    expect(r[0].kind).toBe('wallet.status');
    expect(r[0].id).toBe('w1');
    expect(r[0].reachable).toBe(true);
    expect(r[0].address).toBe('fc_wallet9');
    expect(r[0].balanceFtc).toBe(9.8);
    expect(r[0].lastSeenBlock).toBe(42);
  });

  it('wallet.transactions returns the ledger (clamped limit)', async () => {
    const { peer, ph } = await setup(okReader);
    await ph.send({ kind: 'wallet.transactions', id: 'w2', limit: 1 });
    await peer.pollOnce();
    const r = await ph.collect();
    expect(r[0].kind).toBe('wallet.transactions');
    expect(r[0].reachable).toBe(true);
    const txs = r[0].transactions as AgentPayTx[];
    expect(txs).toHaveLength(1);
    expect(txs[0].txId).toBe('t1');
  });

  it('unconfigured (no agent-pay bearer) → wallet.unconfigured', async () => {
    const { peer, ph } = await setup(undefined);
    await ph.send({ kind: 'wallet.status', id: 'w3' });
    await peer.pollOnce();
    const r = await ph.collect();
    expect(r[0].kind).toBe('wallet.unconfigured');
    expect(r[0].id).toBe('w3');
  });

  it('agent-pay process down → reachable:false, offline message', async () => {
    const down: AgentPayReader = {
      async getStatus() { throw new AgentPayUnreachableError('ECONNREFUSED'); },
      async listTransactions() { throw new AgentPayUnreachableError('ECONNREFUSED'); },
    };
    const { peer, ph } = await setup(down);
    await ph.send({ kind: 'wallet.status', id: 'w4' });
    await peer.pollOnce();
    const r = await ph.collect();
    expect(r[0].kind).toBe('wallet.status');
    expect(r[0].reachable).toBe(false);
    expect(r[0].error).toBe('Agent wallet offline');
  });

  it('expired/invalid bearer (-32002) → re-pairing message', async () => {
    const expired: AgentPayReader = {
      async getStatus() { throw new AgentPayRpcError('invalid or expired session token', -32002); },
      async listTransactions() { throw new AgentPayRpcError('invalid or expired session token', -32002); },
    };
    const { peer, ph } = await setup(expired);
    await ph.send({ kind: 'wallet.status', id: 'w5' });
    await peer.pollOnce();
    const r = await ph.collect();
    expect(r[0].reachable).toBe(false);
    expect(r[0].error).toBe('Agent wallet needs re-pairing');
  });

  it('composes with task-router: tasks + ping + wallet coexist; commerce stays isolated', async () => {
    const { peer, ph } = await setup(okReader);

    await ph.send({ kind: 'task.post', id: 'a', text: 'a task' });
    await peer.pollOnce();
    expect((await ph.collect())[0].kind).toBe('task.created');

    await ph.send({ kind: 'ping', id: 'b' });
    await peer.pollOnce();
    expect((await ph.collect())[0].kind).toBe('pong');

    await ph.send({ kind: 'wallet.status', id: 'c' });
    await peer.pollOnce();
    expect((await ph.collect())[0].kind).toBe('wallet.status');

    // commerce verbs are not on the phone channel — neither router replies.
    await ph.send({ kind: 'searchSellers', id: 'd', text: 'shoes' });
    await peer.pollOnce();
    expect(await ph.collect()).toHaveLength(0);

    // there is no spend wire — a wallet.pay attempt is ignored (never proxied).
    await ph.send({ kind: 'wallet.pay', id: 'e', to: 'fc_x', amountFtc: 1 });
    await peer.pollOnce();
    expect(await ph.collect()).toHaveLength(0);
  });
});
