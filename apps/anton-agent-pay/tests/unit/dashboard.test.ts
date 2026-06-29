/**
 * dashboard.test.ts — the Agent Pay read-only operator dashboard. Asserts the
 * new panels render (pending approvals, proposal lifecycle, wallet detail, 24h
 * usage), the loopback Host wall, that the page is strictly read-only (no
 * form/button/input), and that NO secret ever appears in the HTML. Plus the
 * ProposalStore.list()/committedLast24hPublic() snapshots.
 */
import { afterEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerAgentPayDashboard, type AgentPayDashboardOptions } from '../../src/standalone/dashboard.js';
import { ProposalStore } from '../../src/main/proposals.js';
import type { PaymentProposal } from '../../src/shared/ipc-types.js';

const PORT = 49250;
const HOST_OK = `127.0.0.1:${PORT}`;

const apps: FastifyInstance[] = [];
afterEach(async () => { for (const a of apps.splice(0)) await a.close(); });

function proposal(over: Partial<PaymentProposal>): PaymentProposal {
  return { id: 'p', to: 'fc_recipientAddr', amountFtc: 2, agentName: 'claude', createdAt: Date.now(), expiresAt: Date.now() + 60_000, state: 'pending', ...over };
}

async function mk(over: Partial<AgentPayDashboardOptions> = {}): Promise<FastifyInstance> {
  const app = Fastify();
  registerAgentPayDashboard(app, {
    port: PORT,
    config: { walletReady: true, perPaymentCap: 5, dailyCap: 25, uboName: 'Test Owner', uboCountry: 'SE', approvalMode: 'web', rpcEndpoint: 'https://rpc.x', attested: true, mcpStdio: false },
    walletStatus: async () => ({ walletAddress: 'fc_wallet', balanceFtc: 9.8, lastSeenBlock: 42 }),
    transactions: async () => [],
    proposals: () => [proposal({ id: 'p_pend', state: 'pending', agentNote: 'buy shoes' }), proposal({ id: 'p_sent', state: 'sent', txId: '0xCAFEF00DDEADBEEF' })],
    pendingConfirms: () => ({ count: 1, soonestExpiryMs: 30_000 }),
    committed24hFtc: () => 3.5,
    walletDetail: async () => ({ pubHex: 'a1'.repeat(16), falconPubHex: 'b2'.repeat(16), hasPassphrase: true }),
    ...over,
  });
  await app.ready();
  apps.push(app);
  return app;
}

describe('agent-pay dashboard — read-only operator view', () => {
  it('renders the new panels (pending approvals, lifecycle, wallet detail, 24h usage)', async () => {
    const app = await mk();
    const r = await app.inject({ method: 'GET', url: '/', headers: { host: HOST_OK } });
    expect(r.statusCode).toBe(200);
    expect(r.body).toContain('Pending approvals (1)');
    expect(r.body).toContain('buy shoes');
    expect(r.body).toContain('Proposal lifecycle (1)');
    expect(r.body).toContain('24h usage');
    expect(r.body).toContain('Awaiting approval');
    expect(r.body).toContain('a1a1a1a1'); // wallet pubkey rendered
    expect(r.body).toContain('Ultimate debtor');
  });

  it('is strictly read-only: no form/button/input', async () => {
    const app = await mk();
    const r = await app.inject({ method: 'GET', url: '/', headers: { host: HOST_OK } });
    expect(r.body).not.toMatch(/<form|<button|<input/i);
  });

  it('never leaks a secret-shaped token in the HTML', async () => {
    const app = await mk();
    const r = await app.inject({ method: 'GET', url: '/', headers: { host: HOST_OK } });
    for (const bad of ['confirmSecret', 'pageNonce', 'Bearer ', 'sk_', 'passphrase', 'privHex', 'privateKey']) {
      expect(r.body).not.toContain(bad);
    }
  });

  it('Host wall rejects a non-loopback host (403)', async () => {
    const app = await mk();
    const r = await app.inject({ method: 'GET', url: '/', headers: { host: 'evil.example.com' } });
    expect(r.statusCode).toBe(403);
  });

  it('ProposalStore.list() snapshots all states + committedLast24hPublic() matches', () => {
    let t = 1_000_000;
    const store = new ProposalStore(() => t, { maxDailyFtc: 100 });
    store.propose('a', { to: 'fc_x', amountFtc: 5 });
    store.propose('a', { to: 'fc_y', amountFtc: 3 });
    expect(store.list()).toHaveLength(2);
    expect(store.committedLast24hPublic()).toBe(8);
    // a pending past its deadline shows as expired in the snapshot
    t += 10 * 60 * 1000;
    expect(store.list().every((p) => p.state === 'expired')).toBe(true);
  });
});
