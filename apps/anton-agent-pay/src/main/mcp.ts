/**
 * mcp.ts — Model Context Protocol wrapper.
 *
 * Exposes the same surface as the JSON-RPC server (getStatus, getBalance,
 * listTransactions, proposePayment, getProposal, cancelProposal) as
 * MCP tools so MCP-aware agents (Claude Desktop, etc.) discover and
 * call them natively.
 *
 * Transport: stdio (the Claude Desktop convention) — main.ts forks
 * this module as a subprocess and pipes stdin/stdout. The JSON-RPC
 * HTTP server stays available for non-MCP agents.
 *
 * MVP scope: tool definitions + handler shims that re-use the same
 * ServerDeps as the JSON-RPC layer (single source of truth for
 * business logic; MCP is a thin transport adapter).
 *
 * See ANTON_AGENT_PAY_SPEC.md §6.3.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { ServerDeps } from './server.js';
import { ProposalValidationError } from './proposals.js';

/** MCP tool definitions — identical method names to the JSON-RPC
 *  layer so an agent that knows one knows the other. */
export const MCP_TOOLS = [
  {
    name: 'getStatus',
    description:
      'Get the active wallet\'s status: address, current balance in FTC, and chain tip.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'getBalance',
    description: 'Get the active wallet\'s spendable FTC balance.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'listTransactions',
    description:
      'List recent transactions for the active wallet. Returns at most `limit` (default 25).',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 200, default: 25 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'proposePayment',
    description:
      'Propose a payment for human confirmation. Returns a proposal_id immediately; '
      + 'a confirmation modal opens on the user\'s desktop. The payment is NOT sent '
      + 'until the human clicks Approve in that modal. Poll getProposal for the outcome. '
      + 'There is no way to bypass the modal.',
    inputSchema: {
      type: 'object',
      required: ['to', 'amountFtc'],
      properties: {
        to: { type: 'string', description: 'Recipient fc_ address.' },
        amountFtc: {
          type: 'number', exclusiveMinimum: 0,
          description: 'Amount in FTC (decimal, not satoshi).',
        },
        reference: {
          type: 'string',
          description: 'Optional structured payment reference (ISO 20022 remittance).',
        },
        agentNote: {
          type: 'string', maxLength: 280,
          description: 'Optional short note shown in the modal to give the human context. '
            + 'Marked as agent-supplied (not chain-validated).',
        },
        ttlMs: {
          type: 'integer', minimum: 10000, maximum: 300000,
          description: 'How long the modal stays open before auto-rejecting (default 60s).',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'getProposal',
    description:
      'Get the state of a previously-created proposal. States: pending, approved, '
      + 'rejected, sent, expired, cancelled. Once `sent`, includes the resulting tx_id.',
    inputSchema: {
      type: 'object',
      required: ['proposalId'],
      properties: { proposalId: { type: 'string' } },
      additionalProperties: false,
    },
  },
  {
    name: 'cancelProposal',
    description:
      'Cancel a proposal that\'s still pending (closes the modal). No-op if already '
      + 'in a terminal state.',
    inputSchema: {
      type: 'object',
      required: ['proposalId'],
      properties: { proposalId: { type: 'string' } },
      additionalProperties: false,
    },
  },
] as const;

/** Build an MCP server that routes tool calls through to the same
 *  ServerDeps the JSON-RPC server uses. Caller wires up the
 *  transport (StdioServerTransport for Claude Desktop). */
export function buildMcpServer(deps: ServerDeps): Server {
  const server = new Server(
    { name: 'anton-agent-pay', version: '0.0.1' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: MCP_TOOLS as unknown as Array<{
      name: string;
      description: string;
      inputSchema: object;
    }>,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    try {
      const result = await dispatchMcpTool(deps, name, args ?? {});
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
        isError: true,
      };
    }
  });

  return server;
}

/** Dispatch a single MCP tool call to the right ServerDeps method.
 *  Mirrors the switch in server.ts intentionally — both transports
 *  call into the same store/modal/wallet methods.
 *
 *  Note: MCP doesn't have a pairing concept. For the MVP every MCP
 *  client is treated as a built-in agent identity named "mcp-stdio".
 *  Phase 2 can plumb the MCP client info through if/when that
 *  becomes useful for the modal "AGENT:" line. */
async function dispatchMcpTool(
  deps: ServerDeps, name: string, args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case 'getStatus': {
      const snap = await deps.walletStatus();
      return { paired: true, ...snap };
    }
    case 'getBalance': {
      const snap = await deps.walletStatus();
      return { balanceFtc: snap.balanceFtc };
    }
    case 'listTransactions': {
      const limit = typeof args.limit === 'number' ? args.limit : 25;
      return deps.recentTransactions(limit);
    }
    case 'proposePayment': {
      const to = String(args.to ?? '');
      const amountFtc = Number(args.amountFtc);
      try {
        const proposal = deps.proposals.propose('mcp-stdio', {
          to,
          amountFtc,
          ...(typeof args.reference === 'string' ? { reference: args.reference } : {}),
          ...(typeof args.agentNote === 'string' ? { agentNote: args.agentNote } : {}),
          ...(typeof args.ttlMs === 'number' ? { ttlMs: args.ttlMs } : {}),
        });
        // The MCP transport doesn't have the JSON-RPC server's
        // background-modal-flow because there's no separate request
        // context — we kick the same fire-and-forget flow off here.
        const now = deps.now ?? Date.now;
        void runMcpModalFlow(deps, 'mcp-stdio', proposal.id, now);
        return { proposalId: proposal.id, expiresAt: proposal.expiresAt };
      } catch (e) {
        if (e instanceof ProposalValidationError) {
          throw new Error(`validation: ${e.message}`);
        }
        throw e;
      }
    }
    case 'getProposal': {
      const id = String(args.proposalId ?? '');
      const p = deps.proposals.get(id);
      if (!p) throw new Error('unknown proposal');
      return { state: p.state, txId: p.txId, rejectReason: p.rejectReason };
    }
    case 'cancelProposal': {
      const id = String(args.proposalId ?? '');
      const p = deps.proposals.cancel(id);
      if (!p) throw new Error('proposal not pending or unknown');
      return { state: 'cancelled' };
    }
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

/** MCP-side modal runner — same logic as server.ts::runModalFlow but
 *  duplicated rather than exported because the two transports may
 *  diverge on how they attribute the agent identity / pairing time. */
async function runMcpModalFlow(
  deps: ServerDeps, agentName: string, proposalId: string, now: () => number,
): Promise<void> {
  const proposal = deps.proposals.get(proposalId);
  if (!proposal || proposal.state !== 'pending') return;
  const snap = await deps.walletStatus();
  const hint = await deps.counterpartyHint(proposal.to);
  const hasPass = await deps.walletHasPassphrase();
  const estimatedFeeFtc = 0.001;

  let decision;
  try {
    decision = await deps.modal.promptForDecision({
      proposalId,
      agentName,
      agentPairedAgo: 'just now', // MCP clients don't have a pairing event
      to: proposal.to,
      ...(hint?.label ? { toLabel: hint.label } : {}),
      ...(hint?.seenTimes !== undefined ? { toSeenTimes: hint.seenTimes } : {}),
      amountFtc: proposal.amountFtc,
      feeFtc: estimatedFeeFtc,
      ...(proposal.agentNote ? { agentNote: proposal.agentNote } : {}),
      balanceAfterFtc: snap.balanceFtc - proposal.amountFtc - estimatedFeeFtc,
      walletHasPassphrase: hasPass,
      expiresAtMs: proposal.expiresAt,
    });
  } catch (e) {
    deps.proposals.reject(proposalId, `modal error: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }

  if (decision.kind === 'reject') {
    deps.proposals.reject(proposalId, decision.reason);
    return;
  }
  deps.proposals.approve(proposalId);
  try {
    const { txId } = await deps.submitPayment({
      to: proposal.to,
      amountFtc: proposal.amountFtc,
      ...(proposal.reference !== undefined ? { reference: proposal.reference } : {}),
    });
    deps.proposals.markSent(proposalId, txId);
  } catch (e) {
    deps.proposals.reject(proposalId, `submit failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  // `now` is unused here but kept in the signature for parity with
  // server.ts::runModalFlow.
  void now;
}
