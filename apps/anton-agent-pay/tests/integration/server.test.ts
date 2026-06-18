/**
 * server.test.ts — end-to-end JSON-RPC + modal flow with stubs.
 *
 * Proves the full pair → propose → modal-decide → submit pipeline
 * works without Electron + without the chain. The modal driver is
 * the StubModalDriver from src/main/modal.ts; the chain is a tiny
 * record-and-replay stub injected via ServerDeps.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer, ERR_VALIDATION, type ServerDeps } from '../../src/main/server.js';
import { ProposalStore } from '../../src/main/proposals.js';
import { PairingStore } from '../../src/main/pairing.js';
import { StubModalDriver } from '../../src/main/modal.js';

const TO = 'fc_VEH4mJb5P9hKEaWkiuXRG6e6jooCnQZqKs';

interface Harness {
  app: FastifyInstance;
  pairings: PairingStore;
  proposals: ProposalStore;
  modal: StubModalDriver;
  submitCalls: Array<{ to: string; amountFtc: number; reference?: string; remittance?: unknown }>;
  /** Inject a different "now" without mocking Date. */
  setNow: (fn: () => number) => void;
  /** Tick the chain — used to drive lastSeenBlock. */
  tick: () => void;
  /** Hand a paired bearer back so tests can authenticate. */
  pair: (name?: string) => Promise<{ sessionToken: string; agentId: string }>;
  /** POST to /rpc with a Bearer + an Origin and JSON-RPC envelope. */
  call: (
    sessionToken: string, method: string, params?: unknown, id?: string | number,
  ) => Promise<{ status: number; body: unknown }>;
}

function buildHarness(): Harness {
  const pairings = new PairingStore();
  const proposals = new ProposalStore();
  const modal = new StubModalDriver();
  const submitCalls: Harness['submitCalls'] = [];
  let nowFn = () => Date.now();
  let lastSeen = 805_000;
  const deps: ServerDeps = {
    pairings, proposals, modal,
    walletStatus: async () => ({
      walletAddress: 'fc_TESTWALLET',
      balanceFtc: 100,
      lastSeenBlock: lastSeen,
    }),
    submitPayment: async (req) => {
      submitCalls.push({
        to: req.to,
        amountFtc: req.amountFtc,
        ...(req.reference !== undefined ? { reference: req.reference } : {}),
        ...(req.remittance !== undefined ? { remittance: req.remittance } : {}),
      });
      return { txId: `tx-${submitCalls.length}`, feeFtc: 0.001 };
    },
    recentTransactions: async () => [],
    counterpartyHint: async (addr) => addr === TO
      ? { label: 'Test Counterparty', seenTimes: 3 } : null,
    walletHasPassphrase: async () => false,
    now: () => nowFn(),
  };
  const app = buildServer(deps, { bypassOriginCheck: true });

  async function pair(name = 'test-agent') {
    const code = pairings.newCode();
    const issued = pairings.redeemCode({ name, code });
    return { sessionToken: issued.sessionToken, agentId: issued.agent.id };
  }

  async function call(
    sessionToken: string, method: string, params?: unknown,
    id: string | number = 1,
  ) {
    const res = await app.inject({
      method: 'POST', url: '/rpc',
      headers: {
        'Authorization': `Bearer ${sessionToken}`,
        'Content-Type': 'application/json',
        'Origin': 'http://localhost',
      },
      payload: JSON.stringify({ jsonrpc: '2.0', method, params, id }),
    });
    return { status: res.statusCode, body: res.json() };
  }

  return {
    app, pairings, proposals, modal, submitCalls,
    setNow: (fn) => { nowFn = fn; },
    tick: () => { lastSeen += 1; },
    pair, call,
  };
}

/** Drain queued microtasks so the fire-and-forget modal flow gets
 *  to run between the proposePayment response and our state check. */
async function flushAsync(times = 4): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve();
  // Plus one event-loop tick so any setTimeout(...,0) drains.
  await new Promise(r => setImmediate(r));
}

describe('JSON-RPC server (integration with stubs)', () => {
  let h: Harness;
  beforeEach(() => { h = buildHarness(); });

  // ── Auth ────────────────────────────────────────────────────

  it('rejects request with no Authorization header', async () => {
    const res = await h.app.inject({
      method: 'POST', url: '/rpc',
      headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost' },
      payload: JSON.stringify({
        jsonrpc: '2.0', method: 'getStatus', id: 1,
      }),
    });
    expect(res.statusCode).toBe(401);
    const body = res.json() as { error?: { code?: number } };
    expect(body.error?.code).toBe(-32001);
  });

  it('rejects request with an unknown bearer', async () => {
    const r = await h.call('sk_unknown', 'getStatus');
    expect(r.status).toBe(401);
    const body = r.body as { error?: { code?: number } };
    expect(body.error?.code).toBe(-32002);
  });

  // ── Methods ─────────────────────────────────────────────────

  it('getStatus returns wallet snapshot for a paired agent', async () => {
    const { sessionToken } = await h.pair();
    const r = await h.call(sessionToken, 'getStatus');
    expect(r.status).toBe(200);
    const body = r.body as { result?: { walletAddress?: string; balanceFtc?: number } };
    expect(body.result?.walletAddress).toBe('fc_TESTWALLET');
    expect(body.result?.balanceFtc).toBe(100);
  });

  it('getBalance returns balance', async () => {
    const { sessionToken } = await h.pair();
    const r = await h.call(sessionToken, 'getBalance');
    const body = r.body as { result?: { balanceFtc?: number } };
    expect(body.result?.balanceFtc).toBe(100);
  });

  it('listTransactions returns array (empty in stub)', async () => {
    const { sessionToken } = await h.pair();
    const r = await h.call(sessionToken, 'listTransactions');
    const body = r.body as { result?: unknown[] };
    expect(Array.isArray(body.result)).toBe(true);
  });

  it('unknown method returns -32601', async () => {
    const { sessionToken } = await h.pair();
    const r = await h.call(sessionToken, 'doesNotExist');
    const body = r.body as { error?: { code?: number } };
    expect(body.error?.code).toBe(-32601);
  });

  // ── proposePayment flow: APPROVE ────────────────────────────

  it('proposePayment with a structured remittance → modal summary + submit carries it', async () => {
    const { sessionToken } = await h.pair();
    h.modal.queueDecision({ kind: 'approve' });

    const propose = await h.call(sessionToken, 'proposePayment', {
      to: TO, amountFtc: 3,
      remittance: { kind: 'invoice', ref: 'INV-42', items: [{ name: 'Audit', qty: 1, lineTotalSek: 300 }], message: 'q3 work' },
    });
    expect(propose.status).toBe(200);
    await flushAsync();

    // The modal saw a human-readable summary of the remittance.
    const inv = h.modal.invocations();
    expect(inv).toHaveLength(1);
    expect(inv[0]!.remittanceSummary).toBeTruthy();
    expect(inv[0]!.remittanceSummary!.some((l: string) => /INV-42/.test(l))).toBe(true);
    expect(inv[0]!.remittanceSummary!.some((l: string) => /Audit/.test(l))).toBe(true);

    // The submit carried the built v=1 remittance (kind inferred 'invoice').
    expect(h.submitCalls).toHaveLength(1);
    const rmt = h.submitCalls[0]!.remittance as { v: number; kind: string; ref?: string } | undefined;
    expect(rmt).toMatchObject({ v: 1, kind: 'invoice', ref: 'INV-42' });
  });

  it('rejects an over-long remittance field at propose time (-32004)', async () => {
    const { sessionToken } = await h.pair();
    const r = await h.call(sessionToken, 'proposePayment', {
      to: TO, amountFtc: 1, remittance: { message: 'x'.repeat(5000) }, // > 2000 cap
    });
    const body = r.body as { error?: { code?: number } };
    expect(body.error?.code).toBe(ERR_VALIDATION);
  });

  it('rejects a remittance with too many meta keys (keeps it under the SDK encode cap)', async () => {
    const { sessionToken } = await h.pair();
    const meta: Record<string, string> = {};
    for (let i = 0; i < 100; i++) meta[`k${i}`] = 'v'; // > 24-key cap
    const r = await h.call(sessionToken, 'proposePayment', {
      to: TO, amountFtc: 1, remittance: { kind: 'message', message: 'hi', meta },
    });
    const body = r.body as { error?: { code?: number } };
    expect(body.error?.code).toBe(ERR_VALIDATION);
  });

  it('proposePayment + modal Approve → submit + state=sent', async () => {
    const { sessionToken } = await h.pair();
    h.modal.queueDecision({ kind: 'approve' });

    const propose = await h.call(sessionToken, 'proposePayment', {
      to: TO, amountFtc: 5, agentNote: 'two espressos',
    });
    const proposeBody = propose.body as {
      result?: { proposalId?: string; expiresAt?: number };
    };
    expect(propose.status).toBe(200);
    const proposalId = proposeBody.result?.proposalId;
    expect(typeof proposalId).toBe('string');

    // Modal runs in the background — flush microtasks.
    await flushAsync();

    // Modal was asked about exactly this payload.
    const calls = h.modal.invocations();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.to).toBe(TO);
    expect(calls[0]!.amountFtc).toBe(5);
    expect(calls[0]!.agentNote).toBe('two espressos');
    expect(calls[0]!.toLabel).toBe('Test Counterparty');
    expect(calls[0]!.toSeenTimes).toBe(3);
    expect(calls[0]!.agentName).toBe('test-agent');

    // Submit was called with the right payload.
    expect(h.submitCalls).toEqual([{ to: TO, amountFtc: 5 }]);

    // getProposal reports sent + tx_id.
    const got = await h.call(sessionToken, 'getProposal', { proposalId });
    const gotBody = got.body as {
      result?: { state?: string; txId?: string };
    };
    expect(gotBody.result?.state).toBe('sent');
    expect(gotBody.result?.txId).toBe('tx-1');
  });

  // ── proposePayment flow: REJECT ─────────────────────────────

  it('proposePayment + modal Reject → no submit + state=rejected', async () => {
    const { sessionToken } = await h.pair();
    h.modal.queueDecision({ kind: 'reject', reason: 'user clicked Reject' });

    const propose = await h.call(sessionToken, 'proposePayment', {
      to: TO, amountFtc: 2,
    });
    const proposalId = (propose.body as {
      result?: { proposalId?: string };
    }).result?.proposalId;
    await flushAsync();

    expect(h.submitCalls).toEqual([]);
    const got = await h.call(sessionToken, 'getProposal', { proposalId });
    const gotBody = got.body as {
      result?: { state?: string; rejectReason?: string };
    };
    expect(gotBody.result?.state).toBe('rejected');
    expect(gotBody.result?.rejectReason).toBe('user clicked Reject');
  });

  // ── Validation ──────────────────────────────────────────────

  it('proposePayment with bad address returns validation error', async () => {
    const { sessionToken } = await h.pair();
    const r = await h.call(sessionToken, 'proposePayment', {
      to: '0xdeadbeef', amountFtc: 1,
    });
    const body = r.body as { error?: { code?: number } };
    expect(body.error?.code).toBe(-32004);
  });

  it('proposePayment with non-positive amount returns validation error', async () => {
    const { sessionToken } = await h.pair();
    const r = await h.call(sessionToken, 'proposePayment', {
      to: TO, amountFtc: 0,
    });
    const body = r.body as { error?: { code?: number } };
    expect(body.error?.code).toBe(-32004);
  });

  // ── cancelProposal ──────────────────────────────────────────

  it('cancelProposal flips pending → cancelled', async () => {
    const { sessionToken } = await h.pair();
    // Queue a hang so the modal flow stays open while we call cancel.
    // Without this the modal's missing-decision-queue throw would
    // race us and the proposal would already be rejected on cancel.
    h.modal.queueHang();
    const propose = await h.call(sessionToken, 'proposePayment', {
      to: TO, amountFtc: 1, ttlMs: 60_000,
    });
    const proposalId = (propose.body as {
      result?: { proposalId?: string };
    }).result?.proposalId;
    await flushAsync(); // let the modal open + hang
    const cancel = await h.call(sessionToken, 'cancelProposal', { proposalId });
    const cancelBody = cancel.body as { result?: { state?: string } };
    expect(cancelBody.result?.state).toBe('cancelled');
    const got = await h.call(sessionToken, 'getProposal', { proposalId });
    const gotBody = got.body as { result?: { state?: string } };
    expect(gotBody.result?.state).toBe('cancelled');
  });

  // ── /pair endpoint ──────────────────────────────────────────

  it('/pair issues a bearer when the code matches', async () => {
    const code = h.pairings.newCode();
    const res = await h.app.inject({
      method: 'POST', url: '/pair',
      headers: { 'Content-Type': 'application/json' },
      payload: JSON.stringify({ name: 'curl-test', code }),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { sessionToken?: string; agentId?: string };
    expect(body.sessionToken).toMatch(/^sk_/);
    expect(body.agentId).toMatch(/^a_/);
  });

  it('/pair returns 400 on bad-format input', async () => {
    h.pairings.newCode();
    const res = await h.app.inject({
      method: 'POST', url: '/pair',
      headers: { 'Content-Type': 'application/json' },
      payload: JSON.stringify({ name: '', code: 'abcdef' }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('/pair returns 401 on wrong code', async () => {
    const right = h.pairings.newCode();
    const wrong = String((parseInt(right, 10) + 1) % 1_000_000).padStart(6, '0');
    const res = await h.app.inject({
      method: 'POST', url: '/pair',
      headers: { 'Content-Type': 'application/json' },
      payload: JSON.stringify({ name: 'x', code: wrong }),
    });
    expect(res.statusCode).toBe(401);
  });
});
