/**
 * mcp-agree.test.ts — the five committing AGREE verbs are reachable over the MCP
 * transport (2026-07-17) and route through the SAME human gate as JSON-RPC.
 *
 * Before this, MCP exposed 36 tools but none of proposeAgreement /
 * acceptAgreement / counterAgreement / getAgreementProposal /
 * cancelAgreementProposal, so a Claude-Desktop-over-MCP brain could run the
 * whole commerce loop EXCEPT sign an agreement — the flagship path was broken.
 */
import { describe, it, expect } from 'vitest';
import { MCP_TOOLS, dispatchMcpTool } from '../../src/main/mcp.js';
import type { ServerDeps } from '../../src/main/server.js';
import { AgreementEngine } from '../../src/main/agreement-engine.js';
import { AgreementStore } from '../../src/main/agreement-store.js';
import { AgreementIdentity } from '../../src/main/agreement-identity.js';
import { AgreementProposalStore } from '../../src/main/agreement-proposals.js';
import { InMemoryStorageBackend } from '../../src/main/storage.js';
import { StubModalDriver } from '../../src/main/modal.js';

function deps(opts: { withModal?: boolean } = {}): { deps: ServerDeps; modal: StubModalDriver } {
  const modal = new StubModalDriver();
  const d: ServerDeps = {
    pairings: undefined as never,
    engine: new AgreementEngine(new AgreementStore(new InMemoryStorageBackend()), new AgreementIdentity(new InMemoryStorageBackend())),
    approvals: new AgreementProposalStore(),
    ...(opts.withModal === false ? {} : { modal }),
  };
  return { deps: d, modal };
}

const TERMINAL = new Set(['done', 'rejected', 'expired', 'cancelled']);
async function settle(d: ServerDeps, proposalId: string): Promise<any> {
  for (let i = 0; i < 100; i++) {
    const r = (await dispatchMcpTool(d, 'getAgreementProposal', { proposalId })) as any;
    if (TERMINAL.has(r.state)) return r;
    await new Promise((res) => setTimeout(res, 5));
  }
  throw new Error('proposal never settled');
}

describe('MCP AGREE verbs', () => {
  it('exposes all five committing verbs as MCP tools', () => {
    const names = new Set<string>(MCP_TOOLS.map((t) => t.name));
    for (const v of ['proposeAgreement', 'acceptAgreement', 'counterAgreement', 'getAgreementProposal', 'cancelAgreementProposal']) {
      expect(names.has(v)).toBe(true);
    }
  });

  it('proposeAgreement → approve → signed agreement, via the same human gate', async () => {
    const { deps: d, modal } = deps();
    modal.queueApprove();
    const r = (await dispatchMcpTool(d, 'proposeAgreement', {
      decision: 'Air Jordans EU43 x1', terms: 'ship to SE, paid on chain',
      amountMicroFtc: '1800000', counterpartyAddress: 'fc_sellerADDR', counterpartyHash: 'seller-hash',
    })) as any;
    expect(r.proposalId).toMatch(/^apr_/);
    const done = await settle(d, r.proposalId);
    expect(done.state).toBe('done');
    expect(done.agreementId).toMatch(/^agr_/);
    expect(done.payload.proposerSig).toMatch(/^[0-9a-f]{128}$/);
  });

  it('proposeAgreement fails closed when no approval driver is wired', async () => {
    const { deps: d } = deps({ withModal: false });
    await expect(dispatchMcpTool(d, 'proposeAgreement', {
      decision: 'x', terms: 'y', amountMicroFtc: '1', counterpartyAddress: 'fc_a',
    })).rejects.toThrow(/approval driver/i);
  });

  it('reject at the modal leaves the agreement unsigned', async () => {
    const { deps: d, modal } = deps();
    modal.queueReject('owner said no');
    const r = (await dispatchMcpTool(d, 'proposeAgreement', {
      decision: 'x', terms: 'y', amountMicroFtc: '1', counterpartyAddress: 'fc_a',
    })) as any;
    const done = await settle(d, r.proposalId);
    expect(done.state).toBe('rejected');
    expect(done.rejectReason).toContain('owner said no');
  });

  it('cancelAgreementProposal cancels a pending proposal', async () => {
    const { deps: d, modal } = deps();
    modal.queueHang(); // never resolves — proposal stays pending
    const r = (await dispatchMcpTool(d, 'proposeAgreement', {
      decision: 'x', terms: 'y', amountMicroFtc: '1', counterpartyAddress: 'fc_a',
    })) as any;
    const c = (await dispatchMcpTool(d, 'cancelAgreementProposal', { proposalId: r.proposalId })) as any;
    expect(c.state).toBe('cancelled');
  });
});
