/**
 * modal-flow.test.ts — the shared approve→submit→markSent path (server.ts
 * runModalFlow), reused by BOTH the JSON-RPC and MCP transports. These tests
 * lock the security fixes from the adversarial review:
 *   • a payment is NEVER submitted if the proposal was cancelled / expired
 *     between the modal opening and the operator's approve (no ghost payments);
 *   • the operator-typed wallet passphrase is forwarded to submitPayment;
 *   • the MCP transport goes through the SAME function (no drift).
 */
import { describe, expect, it } from 'vitest';
import { runModalFlow, type ServerDeps } from '../../src/main/server.js';
import { dispatchMcpTool } from '../../src/main/mcp.js';
import { ProposalStore } from '../../src/main/proposals.js';
import { PairingStore } from '../../src/main/pairing.js';
import type { ModalDecision, ModalPayload } from '../../src/shared/ipc-types.js';

const TO = 'fc_VEH4mJb5P9hKEaWkiuXRG6e6jooCnQZqKs';

/** A modal whose decision the test resolves on demand. */
class DeferredModal {
  payload?: ModalPayload;
  private resolveFn?: (d: ModalDecision) => void;
  promptForDecision(payload: ModalPayload): Promise<ModalDecision> {
    this.payload = payload;
    return new Promise((res) => { this.resolveFn = res; });
  }
  resolve(d: ModalDecision): void { this.resolveFn!(d); }
}

interface SubmitReq { to: string; amountFtc: number; passphrase?: string }

function makeDeps(modal: DeferredModal, proposals: ProposalStore, submitCalls: SubmitReq[], opts: { hasPass?: boolean; nowFn?: () => number } = {}): ServerDeps {
  return {
    pairings: new PairingStore(),
    proposals,
    modal,
    walletStatus: async () => ({ walletAddress: 'fc_T', balanceFtc: 100, lastSeenBlock: 1 }),
    submitPayment: async (req) => { submitCalls.push({ to: req.to, amountFtc: req.amountFtc, ...(req.passphrase !== undefined ? { passphrase: req.passphrase } : {}) }); return { txId: 'tx-1', feeFtc: 0.001 }; },
    recentTransactions: async () => [],
    counterpartyHint: async () => null,
    walletHasPassphrase: async () => opts.hasPass ?? false,
    ...(opts.nowFn ? { now: opts.nowFn } : {}),
  };
}

async function waitFor(pred: () => boolean, max = 50): Promise<void> {
  for (let i = 0; i < max && !pred(); i++) await new Promise((r) => setImmediate(r));
  if (!pred()) throw new Error('condition not met');
}

describe('runModalFlow — approve-race guard (no ghost payments)', () => {
  it('does NOT submit when the agent cancelled the proposal before approve', async () => {
    const proposals = new ProposalStore();
    const modal = new DeferredModal();
    const submitCalls: SubmitReq[] = [];
    const deps = makeDeps(modal, proposals, submitCalls);
    const p = proposals.propose('agent', { to: TO, amountFtc: 5, ttlMs: 60_000 });

    const flow = runModalFlow(deps, 'agent', Date.now(), p.id, Date.now);
    await waitFor(() => modal.payload !== undefined);

    proposals.cancel(p.id);                 // agent cancels mid-decision
    modal.resolve({ kind: 'approve' });     // operator approves anyway
    await flow;

    expect(submitCalls).toEqual([]);                       // NEVER broadcast
    expect(proposals.get(p.id)?.state).toBe('cancelled');  // stays cancelled
  });

  it('does NOT submit when the proposal expired before approve', async () => {
    let clock = 1_000;
    const proposals = new ProposalStore(() => clock);
    const modal = new DeferredModal();
    const submitCalls: SubmitReq[] = [];
    const deps = makeDeps(modal, proposals, submitCalls, { nowFn: () => clock });
    const p = proposals.propose('agent', { to: TO, amountFtc: 5, ttlMs: 10_000 });

    const flow = runModalFlow(deps, 'agent', clock, p.id, () => clock);
    await waitFor(() => modal.payload !== undefined);

    clock += 20_000;                        // past the TTL
    modal.resolve({ kind: 'approve' });
    await flow;

    expect(submitCalls).toEqual([]);
    expect(proposals.get(p.id)?.state).toBe('expired');
  });

  it('happy path: approve → submit → sent', async () => {
    const proposals = new ProposalStore();
    const modal = new DeferredModal();
    const submitCalls: SubmitReq[] = [];
    const deps = makeDeps(modal, proposals, submitCalls);
    const p = proposals.propose('agent', { to: TO, amountFtc: 7 });
    const flow = runModalFlow(deps, 'agent', Date.now(), p.id, Date.now);
    await waitFor(() => modal.payload !== undefined);
    modal.resolve({ kind: 'approve' });
    await flow;
    expect(submitCalls).toEqual([{ to: TO, amountFtc: 7 }]);
    expect(proposals.get(p.id)?.state).toBe('sent');
  });
});

describe('runModalFlow — passphrase forwarding', () => {
  it('forwards the operator passphrase to submitPayment', async () => {
    const proposals = new ProposalStore();
    const modal = new DeferredModal();
    const submitCalls: SubmitReq[] = [];
    const deps = makeDeps(modal, proposals, submitCalls, { hasPass: true });
    const p = proposals.propose('agent', { to: TO, amountFtc: 5 });
    const flow = runModalFlow(deps, 'agent', Date.now(), p.id, Date.now);
    await waitFor(() => modal.payload !== undefined);
    expect(modal.payload!.walletHasPassphrase).toBe(true);
    modal.resolve({ kind: 'approve', passphrase: 'hunter2' });
    await flow;
    expect(submitCalls[0]).toEqual({ to: TO, amountFtc: 5, passphrase: 'hunter2' });
    expect(proposals.get(p.id)?.state).toBe('sent');
  });
});

describe('MCP transport reuses runModalFlow (no drift)', () => {
  it('MCP proposePayment forwards the passphrase through the shared flow', async () => {
    const proposals = new ProposalStore();
    const modal = new DeferredModal();
    const submitCalls: SubmitReq[] = [];
    const deps = makeDeps(modal, proposals, submitCalls, { hasPass: true });

    const res = await dispatchMcpTool(deps, 'proposePayment', { to: TO, amountFtc: 4 }) as { proposalId: string };
    expect(res.proposalId).toMatch(/^p_/);

    await waitFor(() => modal.payload !== undefined);
    expect(modal.payload!.agentPairedAgo).toBe('just now');   // MCP has no pairing event
    modal.resolve({ kind: 'approve', passphrase: 'mcp-secret' });
    await waitFor(() => proposals.get(res.proposalId)?.state === 'sent');

    expect(submitCalls[0]).toEqual({ to: TO, amountFtc: 4, passphrase: 'mcp-secret' });
  });

  it('MCP cancel-race does not submit either', async () => {
    const proposals = new ProposalStore();
    const modal = new DeferredModal();
    const submitCalls: SubmitReq[] = [];
    const deps = makeDeps(modal, proposals, submitCalls);
    const res = await dispatchMcpTool(deps, 'proposePayment', { to: TO, amountFtc: 9 }) as { proposalId: string };
    await waitFor(() => modal.payload !== undefined);
    await dispatchMcpTool(deps, 'cancelProposal', { proposalId: res.proposalId });
    modal.resolve({ kind: 'approve' });
    // give the flow a chance to (not) submit
    for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
    expect(submitCalls).toEqual([]);
    expect(proposals.get(res.proposalId)?.state).toBe('cancelled');
  });
});
