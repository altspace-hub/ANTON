/**
 * dashboard.test.ts — the Collaboration read-only operator dashboard. Asserts the
 * new panels render (pending agreement approvals, negotiations, richer settings),
 * the loopback Host wall, strict read-only (no form/button/input), and that NO
 * secret appears in the HTML.
 */
import { afterEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerCollabDashboard, type CollabDashboardOptions } from '../../src/standalone/dashboard.js';
import type { AgreementApproval } from '../../src/main/agreement-proposals.js';
import type { NegotiationJob } from '../../src/main/negotiation-store.js';

const PORT = 49260;
const HOST_OK = `127.0.0.1:${PORT}`;
const apps: FastifyInstance[] = [];
afterEach(async () => { for (const a of apps.splice(0)) await a.close(); });

const approval: AgreementApproval = {
  id: 'ap1',
  action: { kind: 'propose', input: { decision: 'Buy 1x shoes', terms: 'deliver 5d', amountMicroFtc: '13990000', counterpartyAddress: 'kicks.sthlm.portal' } },
  agentName: 'claude', createdAt: Date.now(), expiresAt: Date.now() + 60_000, state: 'pending',
};
const negotiation = {
  id: 'n1', agentName: 'claude', goal: { objective: 'shoes under 1500' }, sellerAddress: 'kicks.sthlm.portal',
  state: 'running', createdAt: Date.now(), expiresAt: Date.now() + 60_000, round: 2, transcript: [],
} as unknown as NegotiationJob;

async function mk(over: Partial<CollabDashboardOptions> = {}): Promise<FastifyInstance> {
  const app = Fastify();
  registerCollabDashboard(app, {
    port: PORT,
    settings: { signingPubkey: 'abcd'.repeat(8), contactHash: 'ANTON-AAAA-BBBB-CCCC-DDDD', relayBase: 'r', registryBase: 'reg', approvalMode: 'web', reviewModel: 'mistral-large-latest', reviewStrict: true, phoneChannel: false, walletView: false, storeDir: '/tmp/store' },
    agreements: async () => [],
    tasks: async () => [],
    fulfilments: async () => [],
    escrows: async () => [],
    agreementApprovals: () => [approval],
    negotiations: () => [negotiation],
    pendingConfirms: () => ({ count: 1, soonestExpiryMs: 30_000 }),
    ...over,
  });
  await app.ready(); apps.push(app); return app;
}

describe('collab dashboard — read-only operator view', () => {
  it('renders pending agreement approvals + negotiations + review settings', async () => {
    const app = await mk();
    const r = await app.inject({ method: 'GET', url: '/', headers: { host: HOST_OK } });
    expect(r.statusCode).toBe(200);
    expect(r.body).toContain('Pending agreement approvals (1)');
    expect(r.body).toContain('kicks.sthlm.po'); // short counterparty
    expect(r.body).toContain('Negotiations (1)');
    expect(r.body).toContain('Review strict');
    expect(r.body).toContain('Awaiting approval');
  });

  it('is strictly read-only: no form/button/input', async () => {
    const app = await mk();
    const r = await app.inject({ method: 'GET', url: '/', headers: { host: HOST_OK } });
    expect(r.body).not.toMatch(/<form|<button|<input/i);
  });

  it('never leaks a secret-shaped token in the HTML', async () => {
    const app = await mk();
    const r = await app.inject({ method: 'GET', url: '/', headers: { host: HOST_OK } });
    for (const bad of ['confirmSecret', 'pageNonce', 'Bearer ', 'sk_', 'privHex', 'privateKey']) {
      expect(r.body).not.toContain(bad);
    }
  });

  it('Host wall rejects a non-loopback host (403)', async () => {
    const app = await mk();
    const r = await app.inject({ method: 'GET', url: '/', headers: { host: 'evil.example.com' } });
    expect(r.statusCode).toBe(403);
  });
});
