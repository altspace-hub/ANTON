/**
 * standalone-boot.test.ts — proves the standalone wiring boots and that the
 * terminal-approval + spend-cap path is reachable end-to-end WITHOUT a real
 * chain, wallet, or TTY. Uses Fastify `inject` (no socket) + injected streams.
 */
import { describe, expect, it } from 'vitest';
import { PassThrough } from 'node:stream';
import { buildServer, type ServerDeps } from '../../src/main/server.js';
import { PairingStore } from '../../src/main/pairing.js';
import { ProposalStore } from '../../src/main/proposals.js';
import { CliModalDriver } from '../../src/standalone/cli-modal.js';

function deps(modal: CliModalDriver, over: Partial<ServerDeps> = {}): ServerDeps {
  return {
    pairings: new PairingStore(),
    proposals: new ProposalStore(Date.now, { maxPerPaymentFtc: 5, maxDailyFtc: 25 }),
    modal,
    walletStatus: async () => ({ walletAddress: 'fc_TEST', balanceFtc: 100, lastSeenBlock: 1 }),
    walletHasPassphrase: async () => false,
    recentTransactions: async () => [],
    counterpartyHint: async () => null,
    submitPayment: async () => ({ txId: '0xsmoke', feeFtc: 0.001 }),
    ...over,
  };
}

async function pair(app: ReturnType<typeof buildServer>, pairings: PairingStore): Promise<string> {
  const code = pairings.newCode();
  const res = await app.inject({
    method: 'POST', url: '/pair',
    payload: { code, name: 'smoke-agent' },
  });
  expect(res.statusCode).toBe(200);
  return JSON.parse(res.body).sessionToken as string;
}

/** proposePayment is fire-and-forget — poll getProposal until it leaves pending. */
async function pollState(
  app: ReturnType<typeof buildServer>, token: string, proposalId: string,
): Promise<{ state: string; txId?: string; rejectReason?: string }> {
  for (let i = 0; i < 200; i++) {
    const res = await app.inject({
      method: 'POST', url: '/rpc',
      headers: { authorization: `Bearer ${token}` },
      payload: { jsonrpc: '2.0', id: 9, method: 'getProposal', params: { proposalId } },
    });
    const r = JSON.parse(res.body).result;
    if (r && r.state !== 'pending') return r;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error('proposal never left pending');
}

describe('standalone boot', () => {
  it('pairs, reads status, and APPROVES a payment via the terminal driver', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const modal = new CliModalDriver({ input, output, now: () => 0 });
    const d = deps(modal);
    const app = buildServer(d);
    try {
      const token = await pair(app, d.pairings);

      // read-only call works
      const status = await app.inject({
        method: 'POST', url: '/rpc',
        headers: { authorization: `Bearer ${token}` },
        payload: { jsonrpc: '2.0', id: 1, method: 'getStatus', params: {} },
      });
      expect(status.statusCode).toBe(200);
      expect(JSON.parse(status.body).result.walletAddress).toBe('fc_TEST');

      // propose → the terminal driver shows the prompt; we type "y".
      // proposePayment returns a proposalId immediately; the modal runs
      // concurrently, so we type "y" then poll getProposal for the outcome.
      input.write('y\n');
      const res = await app.inject({
        method: 'POST', url: '/rpc',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          jsonrpc: '2.0', id: 2, method: 'proposePayment',
          params: { to: 'fc_VEH4mJb5P9hKEaWkiuXRG6e6jooCnQZqKs', amountFtc: 2.5, agentNote: 'smoke' },
        },
      });
      expect(res.statusCode).toBe(200);
      const proposalId = JSON.parse(res.body).result.proposalId as string;
      expect(proposalId).toMatch(/^p_/);

      const outcome = await pollState(app, token, proposalId);
      expect(outcome.state).toBe('sent');
      expect(outcome.txId).toBe('0xsmoke');
    } finally {
      await app.close();
    }
  });

  it('rejects an over-cap payment BEFORE the terminal prompt', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    let prompted = false;
    output.on('data', () => { prompted = true; });
    const modal = new CliModalDriver({ input, output, now: () => 0 });
    const d = deps(modal);
    const app = buildServer(d);
    try {
      const token = await pair(app, d.pairings);
      const res = await app.inject({
        method: 'POST', url: '/rpc',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          jsonrpc: '2.0', id: 3, method: 'proposePayment',
          params: { to: 'fc_VEH4mJb5P9hKEaWkiuXRG6e6jooCnQZqKs', amountFtc: 9999 },
        },
      });
      const body = JSON.parse(res.body);
      expect(body.error).toBeTruthy();             // cap rejection surfaced as an error
      expect(body.error.message).toMatch(/cap/i);
      expect(prompted).toBe(false);                // never reached the human
    } finally {
      await app.close();
    }
  });
});
