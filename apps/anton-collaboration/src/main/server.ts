/**
 * server.ts — local JSON-RPC 2.0 server for Anton Collaboration.
 *
 * Clones the agent-pay security shell (bound to 127.0.0.1, pairing-bearer auth,
 * origin allowlist) and exposes the COMMERCE-LOOP verbs to a paired external AI
 * agent. Ships the DISCOVER + IDENTIFY + TALK verbs:
 *
 *   getStatus       — am I paired? which relay + verbs are available
 *   searchSellers   — find businesses in the .anton registry (text + verb + category)
 *   resolveSeller   — resolve an exact name.namespace → its signed descriptor +
 *                     commerce verbs + originEndpoint (where TALK/INQUIRE/INVOKE go)
 *   inquireSeller   — TALK: invoke a seller capability (inquire/order) DIRECTLY on
 *                     the seller's ANTON; ask "Jordans size 43? price?". Commits to
 *                     nothing, so no human gate.
 *
 * Later phases add negotiate, proposeAgreement/acceptAgreement (AGREE, behind the
 * human-approval modal), and settle (bridge to Agent Pay).
 *
 * Discovery + inquiry commit to nothing, so these verbs need NO human gate — the
 * modal arrives with the spend/commit verbs.
 */
import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { PairingStore } from './pairing.js';
import { PairingError } from './pairing.js';
import {
  searchPortals, resolvePortal, portalVerbs, type DiscoveryConfig,
} from './discovery.js';
import { invokeCapability, capabilityForVerb } from './talk.js';
import type { AgreementEngine, ProposeInput, CounterInput } from './agreement-engine.js';
import type { AgreementProposalStore, PendingAction } from './agreement-proposals.js';
import type { ModalDriver, CollabModalPayload, CollabModalKind } from './modal.js';
import type {
  AgreementProposePayload, AgreementRespondPayload, AgreementWithdrawPayload, AgreementAckPayload,
} from './agreement-core.js';

export const DEFAULT_ALLOWED_ORIGINS: ReadonlyArray<string | RegExp> = [
  'null',
  /^https?:\/\/localhost(:\d+)?$/i,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/i,
];

export const ERR_AUTH_MISSING = -32001;
export const ERR_AUTH_INVALID = -32002;
export const ERR_ORIGIN_FORBIDDEN = -32003;
export const ERR_VALIDATION = -32004;
export const ERR_NOT_FOUND = -32005;
export const ERR_UPSTREAM = -32010;
/** A committing verb was called but no human-approval driver is wired (e.g.
 *  under --mcp-stdio before the web-confirm driver lands). FAIL CLOSED. */
export const ERR_NO_APPROVAL = -32011;
/** AGREE verbs called but the agreement engine isn't configured. */
export const ERR_NO_ENGINE = -32012;

/** The verbs this program currently exposes (surfaced by getStatus + MCP). */
export const COLLAB_VERBS = [
  'getStatus', 'searchSellers', 'resolveSeller', 'inquireSeller',
  // AGREE — committing (human-gated):
  'proposeAgreement', 'acceptAgreement', 'counterAgreement',
  // AGREE — non-committing / inbound / reads (ungated):
  'declineAgreement', 'withdrawAgreement', 'ingestAgreement',
  'getAgreement', 'listAgreements', 'getAgreementProposal', 'cancelAgreementProposal',
  // SETTLE bridge (to/from Agent Pay) — the spend itself is gated in Agent Pay:
  'getSettlementInstruction', 'markAgreementSettled', 'reconcileSettlement',
] as const;

export interface ServerDeps {
  pairings: PairingStore;
  /** Discovery config (relay base + fetch). Injected so tests stub the relay. */
  discovery?: DiscoveryConfig;
  /** The buyer's contact hash, attributed in the seller's inbox when inquiring +
   *  used as the proposer/acceptor counterpartyHash binding in agreements. */
  buyerContactHash?: string;
  /** The signed-agreement engine (store + identity + appliers). AGREE verbs
   *  require it; absent → ERR_NO_ENGINE. */
  engine?: AgreementEngine;
  /** Pending human-approval lifecycle for committing verbs. */
  approvals?: AgreementProposalStore;
  /** Human-approval driver. Absent → committing verbs FAIL CLOSED (ERR_NO_APPROVAL). */
  modal?: ModalDriver;
  now?: () => number;
}

export interface BuildServerOptions {
  allowedOrigins?: ReadonlyArray<string | RegExp>;
  /** Disable origin check entirely. ONLY for tests. */
  bypassOriginCheck?: boolean;
}

// ── JSON-RPC param schemas ────────────────────────────────────────
export const SearchSellersParams = z.object({
  text: z.string().max(500).optional(),
  verbs: z.array(z.string().max(64)).max(20).optional(),
  categories: z.array(z.string().max(64)).max(20).optional(),
  limit: z.number().int().positive().max(100).optional(),
  offset: z.number().int().nonnegative().optional(),
}).optional();

export const ResolveSellerParams = z.object({
  address: z.string().min(1).max(256),
});

export const InquireSellerParams = z.object({
  address: z.string().min(1).max(256),
  /** Pick the capability by its commerce verb (e.g. 'inquire' / 'order')... */
  verb: z.string().min(1).max(64).optional(),
  /** ...or by its exact capability id (takes precedence over verb). */
  capabilityId: z.string().min(1).max(128).optional(),
  /** Structured question/payload for the seller's capability (its own schema). */
  input: z.record(z.unknown()).default({}),
}).refine((p) => Boolean(p.verb) || Boolean(p.capabilityId), {
  message: 'one of "verb" or "capabilityId" is required',
});

// ── AGREE params ──────────────────────────────────────────────────
/** Base-10 non-negative integer in µFTC (1 FTC = 1_000_000 µFTC). String to be
 *  BigInt-safe across the wire. */
const MicroFtc = z.string().regex(/^\d{1,30}$/, 'amountMicroFtc must be a base-10 µFTC integer');

export const ProposeAgreementParams = z.object({
  decision: z.string().min(1).max(2000),
  terms: z.string().max(8000).default(''),
  amountMicroFtc: MicroFtc,
  counterpartyAddress: z.string().min(1).max(256),
  counterpartyHash: z.string().max(256).optional(),
  agentNote: z.string().max(2000).optional(),
  ttlMs: z.number().int().positive().optional(),
});

export const AcceptAgreementParams = z.object({
  agreementId: z.string().min(1).max(128),
  ttlMs: z.number().int().positive().optional(),
});

export const CounterAgreementParams = z.object({
  agreementId: z.string().min(1).max(128),
  decision: z.string().min(1).max(2000),
  terms: z.string().max(8000).default(''),
  amountMicroFtc: MicroFtc,
  agentNote: z.string().max(2000).optional(),
  ttlMs: z.number().int().positive().optional(),
});

export const AgreementIdParams = z.object({ agreementId: z.string().min(1).max(128) });
export const ProposalIdParams = z.object({ proposalId: z.string().min(1).max(128) });

export const IngestAgreementParams = z.object({
  type: z.enum(['propose', 'respond', 'withdraw', 'ack']),
  fromHash: z.string().min(1).max(256),
  payload: z.record(z.unknown()),
});

export const MarkSettledParams = z.object({
  agreementId: z.string().min(1).max(128),
  txHash: z.string().min(1).max(256),
});

export const ReconcileSettlementParams = z.object({
  proposalHash: z.string().min(1).max(128),
  txHash: z.string().min(1).max(256),
});

export function buildServer(deps: ServerDeps, opts: BuildServerOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false, disableRequestLogging: true });
  const allowedOrigins = opts.allowedOrigins ?? DEFAULT_ALLOWED_ORIGINS;

  app.post('/rpc', async (req, reply) => {
    // 1. Origin check (MCP stdio clients send no Origin — allowed).
    if (!opts.bypassOriginCheck) {
      const origin = req.headers.origin;
      if (origin !== undefined) {
        const ok = allowedOrigins.some((rule) =>
          typeof rule === 'string' ? rule === origin : rule.test(origin));
        if (!ok) return reply.code(403).send(jsonRpcError(ERR_ORIGIN_FORBIDDEN, 'origin not allowed', null));
      }
    }

    // 2. Parse envelope.
    const parsed = JsonRpcRequest.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(jsonRpcError(-32600, 'invalid request', null));
    const { method, params, id } = parsed.data;

    // 3. Auth — every method requires a paired bearer.
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return reply.code(401).send(jsonRpcError(ERR_AUTH_MISSING, 'Authorization: Bearer required', id));
    }
    const agent = deps.pairings.resolveBearer(auth.slice('Bearer '.length).trim());
    if (!agent) return reply.code(401).send(jsonRpcError(ERR_AUTH_INVALID, 'invalid or expired session token', id));

    // 4. Dispatch.
    try {
      switch (method) {
        case 'getStatus':
          return reply.send(jsonRpcResult(id, {
            paired: true,
            agentName: agent.name,
            relayBase: (deps.discovery?.base ?? process.env.ANTON_COLLAB_RELAY_BASE ?? 'https://relay.futurechain.eu'),
            verbs: [...COLLAB_VERBS],
          }));

        case 'searchSellers': {
          const p = SearchSellersParams.safeParse(params);
          if (!p.success) return reply.send(jsonRpcError(ERR_VALIDATION, formatZodError(p.error), id));
          try {
            const r = await searchPortals(p.data ?? {}, deps.discovery);
            return reply.send(jsonRpcResult(id, r));
          } catch (e) {
            return reply.send(jsonRpcError(ERR_UPSTREAM, `registry search failed: ${msgOf(e)}`, id));
          }
        }

        case 'resolveSeller': {
          const p = ResolveSellerParams.safeParse(params);
          if (!p.success) return reply.send(jsonRpcError(ERR_VALIDATION, formatZodError(p.error), id));
          let resolved;
          try {
            resolved = await resolvePortal(p.data.address, deps.discovery);
          } catch (e) {
            return reply.send(jsonRpcError(ERR_UPSTREAM, `registry resolve failed: ${msgOf(e)}`, id));
          }
          if (!resolved) return reply.send(jsonRpcResult(id, { found: false }));
          return reply.send(jsonRpcResult(id, {
            found: true,
            address: resolved.portalAddress,
            ...(resolved.contactHash !== undefined ? { contactHash: resolved.contactHash } : {}),
            ...(resolved.signingPubkeyHex !== undefined ? { signingPubkeyHex: resolved.signingPubkeyHex } : {}),
            verbs: portalVerbs(resolved),
            descriptor: resolved.descriptor,
          }));
        }

        case 'inquireSeller': {
          const p = InquireSellerParams.safeParse(params);
          if (!p.success) return reply.send(jsonRpcError(ERR_VALIDATION, formatZodError(p.error), id));

          // 1. Resolve the seller (need the descriptor + originEndpoint to TALK).
          let resolved;
          try {
            resolved = await resolvePortal(p.data.address, deps.discovery);
          } catch (e) {
            return reply.send(jsonRpcError(ERR_UPSTREAM, `registry resolve failed: ${msgOf(e)}`, id));
          }
          if (!resolved) return reply.send(jsonRpcError(ERR_NOT_FOUND, `seller not found: ${p.data.address}`, id));

          // 2. Pick the capability — explicit id wins, else map the verb.
          let capabilityId = p.data.capabilityId;
          if (!capabilityId && p.data.verb) {
            const cap = capabilityForVerb(resolved, p.data.verb);
            if (!cap) return reply.send(jsonRpcError(ERR_NOT_FOUND, `seller has no "${p.data.verb}" capability`, id));
            capabilityId = cap.id;
          }
          if (!capabilityId) return reply.send(jsonRpcError(ERR_VALIDATION, 'verb or capabilityId is required', id));

          // 3. TALK — POST directly to the seller's originEndpoint (not the relay).
          const invokeOpts: { fetch?: typeof fetch; visitorContactHash?: string } = {};
          if (deps.discovery?.fetch) invokeOpts.fetch = deps.discovery.fetch;
          if (deps.buyerContactHash) invokeOpts.visitorContactHash = deps.buyerContactHash;
          const result = await invokeCapability(resolved, capabilityId, p.data.input, invokeOpts);
          return reply.send(jsonRpcResult(id, { capabilityId, ...result }));
        }

        // ── AGREE: committing verbs (human-gated) ────────────────────────────
        case 'proposeAgreement': {
          const gate = requireGate(deps);
          if ('err' in gate) return reply.send(jsonRpcError(gate.err, gate.message, id));
          const p = ProposeAgreementParams.safeParse(params);
          if (!p.success) return reply.send(jsonRpcError(ERR_VALIDATION, formatZodError(p.error), id));
          const input: ProposeInput = {
            decision: p.data.decision, terms: p.data.terms, amountMicroFtc: p.data.amountMicroFtc,
            counterpartyAddress: p.data.counterpartyAddress,
            ...(p.data.counterpartyHash !== undefined ? { counterpartyHash: p.data.counterpartyHash } : {}),
          };
          const rec = gate.approvals.create(agent.name, { kind: 'propose', input }, p.data.ttlMs);
          void runAgreementModalFlow(gate, agent.name, agent, rec.id, nowOf(deps),
            p.data.agentNote);
          return reply.send(jsonRpcResult(id, { proposalId: rec.id, expiresAt: rec.expiresAt }));
        }

        case 'acceptAgreement': {
          const gate = requireGate(deps);
          if ('err' in gate) return reply.send(jsonRpcError(gate.err, gate.message, id));
          const p = AcceptAgreementParams.safeParse(params);
          if (!p.success) return reply.send(jsonRpcError(ERR_VALIDATION, formatZodError(p.error), id));
          const existing = await gate.engine.get(p.data.agreementId);
          if (!existing) return reply.send(jsonRpcError(ERR_NOT_FOUND, `unknown agreement: ${p.data.agreementId}`, id));
          const rec = gate.approvals.create(agent.name, { kind: 'accept', agreementId: p.data.agreementId }, p.data.ttlMs);
          void runAgreementModalFlow(gate, agent.name, agent, rec.id, nowOf(deps));
          return reply.send(jsonRpcResult(id, { proposalId: rec.id, expiresAt: rec.expiresAt }));
        }

        case 'counterAgreement': {
          const gate = requireGate(deps);
          if ('err' in gate) return reply.send(jsonRpcError(gate.err, gate.message, id));
          const p = CounterAgreementParams.safeParse(params);
          if (!p.success) return reply.send(jsonRpcError(ERR_VALIDATION, formatZodError(p.error), id));
          const existing = await gate.engine.get(p.data.agreementId);
          if (!existing) return reply.send(jsonRpcError(ERR_NOT_FOUND, `unknown agreement: ${p.data.agreementId}`, id));
          const counter: CounterInput = { decision: p.data.decision, terms: p.data.terms, amountMicroFtc: p.data.amountMicroFtc };
          const rec = gate.approvals.create(agent.name, { kind: 'counter', agreementId: p.data.agreementId, counter }, p.data.ttlMs);
          void runAgreementModalFlow(gate, agent.name, agent, rec.id, nowOf(deps), p.data.agentNote);
          return reply.send(jsonRpcResult(id, { proposalId: rec.id, expiresAt: rec.expiresAt }));
        }

        // ── AGREE: non-committing / inbound / reads (ungated) ────────────────
        case 'declineAgreement': {
          const engine = requireEngine(deps);
          if (!engine) return reply.send(jsonRpcError(ERR_NO_ENGINE, 'agreement engine not configured', id));
          const p = AgreementIdParams.safeParse(params);
          if (!p.success) return reply.send(jsonRpcError(ERR_VALIDATION, formatZodError(p.error), id));
          try {
            const { agreement, payload } = await engine.respond(p.data.agreementId, 'decline');
            return reply.send(jsonRpcResult(id, { agreement, payload }));
          } catch (e) {
            return reply.send(jsonRpcError(ERR_VALIDATION, msgOf(e), id));
          }
        }

        case 'withdrawAgreement': {
          const engine = requireEngine(deps);
          if (!engine) return reply.send(jsonRpcError(ERR_NO_ENGINE, 'agreement engine not configured', id));
          const p = AgreementIdParams.safeParse(params);
          if (!p.success) return reply.send(jsonRpcError(ERR_VALIDATION, formatZodError(p.error), id));
          try {
            const { agreement, payload } = await engine.withdraw(p.data.agreementId);
            return reply.send(jsonRpcResult(id, { agreement, payload }));
          } catch (e) {
            return reply.send(jsonRpcError(ERR_VALIDATION, msgOf(e), id));
          }
        }

        case 'ingestAgreement': {
          const engine = requireEngine(deps);
          if (!engine) return reply.send(jsonRpcError(ERR_NO_ENGINE, 'agreement engine not configured', id));
          const p = IngestAgreementParams.safeParse(params);
          if (!p.success) return reply.send(jsonRpcError(ERR_VALIDATION, formatZodError(p.error), id));
          const applied = await dispatchIngest(engine, p.data.type, p.data.payload, p.data.fromHash);
          return reply.send(jsonRpcResult(id, { applied: applied !== null, agreement: applied }));
        }

        case 'getAgreement': {
          const engine = requireEngine(deps);
          if (!engine) return reply.send(jsonRpcError(ERR_NO_ENGINE, 'agreement engine not configured', id));
          const p = AgreementIdParams.safeParse(params);
          if (!p.success) return reply.send(jsonRpcError(ERR_VALIDATION, formatZodError(p.error), id));
          const a = await engine.get(p.data.agreementId);
          return reply.send(jsonRpcResult(id, a ? { found: true, agreement: a } : { found: false }));
        }

        case 'listAgreements': {
          const engine = requireEngine(deps);
          if (!engine) return reply.send(jsonRpcError(ERR_NO_ENGINE, 'agreement engine not configured', id));
          return reply.send(jsonRpcResult(id, { agreements: await engine.list() }));
        }

        case 'getAgreementProposal': {
          if (!deps.approvals) return reply.send(jsonRpcError(ERR_NO_ENGINE, 'approvals not configured', id));
          const p = ProposalIdParams.safeParse(params);
          if (!p.success) return reply.send(jsonRpcError(ERR_VALIDATION, formatZodError(p.error), id));
          const rec = deps.approvals.get(p.data.proposalId);
          if (!rec) return reply.send(jsonRpcError(ERR_NOT_FOUND, 'unknown proposal', id));
          return reply.send(jsonRpcResult(id, {
            state: rec.state,
            ...(rec.agreementId !== undefined ? { agreementId: rec.agreementId } : {}),
            ...(rec.payloadJson !== undefined ? { payload: JSON.parse(rec.payloadJson) } : {}),
            ...(rec.rejectReason !== undefined ? { rejectReason: rec.rejectReason } : {}),
          }));
        }

        case 'cancelAgreementProposal': {
          if (!deps.approvals) return reply.send(jsonRpcError(ERR_NO_ENGINE, 'approvals not configured', id));
          const p = ProposalIdParams.safeParse(params);
          if (!p.success) return reply.send(jsonRpcError(ERR_VALIDATION, formatZodError(p.error), id));
          const ok = deps.approvals.cancel(p.data.proposalId);
          if (!ok) return reply.send(jsonRpcError(ERR_NOT_FOUND, 'proposal not pending or unknown', id));
          return reply.send(jsonRpcResult(id, { state: 'cancelled' }));
        }

        // ── SETTLE bridge ────────────────────────────────────────────────────
        case 'getSettlementInstruction': {
          const engine = requireEngine(deps);
          if (!engine) return reply.send(jsonRpcError(ERR_NO_ENGINE, 'agreement engine not configured', id));
          const p = AgreementIdParams.safeParse(params);
          if (!p.success) return reply.send(jsonRpcError(ERR_VALIDATION, formatZodError(p.error), id));
          try {
            const instruction = await engine.getSettlementInstruction(p.data.agreementId);
            return reply.send(jsonRpcResult(id, { instruction }));
          } catch (e) {
            return reply.send(jsonRpcError(ERR_VALIDATION, msgOf(e), id));
          }
        }

        case 'markAgreementSettled': {
          const engine = requireEngine(deps);
          if (!engine) return reply.send(jsonRpcError(ERR_NO_ENGINE, 'agreement engine not configured', id));
          const p = MarkSettledParams.safeParse(params);
          if (!p.success) return reply.send(jsonRpcError(ERR_VALIDATION, formatZodError(p.error), id));
          const a = await engine.markSettled(p.data.agreementId, p.data.txHash);
          if (!a) return reply.send(jsonRpcError(ERR_VALIDATION, 'agreement not found or not in an agreed/accepted state', id));
          return reply.send(jsonRpcResult(id, { agreement: a }));
        }

        case 'reconcileSettlement': {
          const engine = requireEngine(deps);
          if (!engine) return reply.send(jsonRpcError(ERR_NO_ENGINE, 'agreement engine not configured', id));
          const p = ReconcileSettlementParams.safeParse(params);
          if (!p.success) return reply.send(jsonRpcError(ERR_VALIDATION, formatZodError(p.error), id));
          const a = await engine.reconcileInboundSettlement({ proposalHash: p.data.proposalHash, txHash: p.data.txHash });
          return reply.send(jsonRpcResult(id, { matched: a !== null, agreement: a }));
        }

        default:
          return reply.send(jsonRpcError(-32601, `method not found: ${method}`, id));
      }
    } catch (e) {
      if (e instanceof PairingError) return reply.send(jsonRpcError(ERR_AUTH_INVALID, e.message, id));
      return reply.send(jsonRpcError(-32603, `internal error: ${msgOf(e)}`, id));
    }
  });

  // Pairing bootstrap (issues the bearer used by /rpc).
  app.post('/pair', async (req, reply) => {
    const Body = z.object({
      name: z.string().min(1).max(64),
      code: z.string().length(6).regex(/^\d{6}$/),
      ttlMs: z.number().int().positive().optional(),
    });
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: formatZodError(parsed.error) });
    try {
      const args: { name: string; code: string; ttlMs?: number } = { name: parsed.data.name, code: parsed.data.code };
      if (parsed.data.ttlMs !== undefined) args.ttlMs = parsed.data.ttlMs;
      const issued = deps.pairings.redeemCode(args);
      return reply.send({ agentId: issued.agent.id, sessionToken: issued.sessionToken, expiresAt: issued.agent.expiresAt });
    } catch (e) {
      if (e instanceof PairingError) return reply.code(401).send({ error: e.message });
      throw e;
    }
  });

  return app;
}

// ── AGREE gate + modal flow ──────────────────────────────────────

/** All three deps a committing verb needs, present. */
interface Gate { engine: AgreementEngine; approvals: AgreementProposalStore; modal: ModalDriver; }

function requireGate(deps: ServerDeps): Gate | { err: number; message: string } {
  if (!deps.engine || !deps.approvals) return { err: ERR_NO_ENGINE, message: 'agreement engine not configured' };
  if (!deps.modal) return { err: ERR_NO_APPROVAL, message: 'human-approval driver not available (committing verbs fail closed)' };
  return { engine: deps.engine, approvals: deps.approvals, modal: deps.modal };
}

function requireEngine(deps: ServerDeps): AgreementEngine | null {
  return deps.engine ?? null;
}

function nowOf(deps: ServerDeps): () => number {
  return deps.now ?? (() => Date.now());
}

/**
 * Run the human-approval modal + engine action for a freshly-created approval
 * ticket. Caller does NOT await this (fire-and-forget; the agent polls
 * getAgreementProposal). Mirrors Agent Pay's runModalFlow: build a self-
 * describing payload → prompt → on approve, ONLY proceed if the approve() flip
 * landed (a cancel/expire between open + approve aborts the action).
 */
export async function runAgreementModalFlow(
  gate: Gate, agentName: string, agent: { pairedAt: number }, approvalId: string,
  now: () => number, agentNote?: string,
): Promise<void> {
  const rec = gate.approvals.get(approvalId);
  if (!rec || rec.state !== 'pending') return;

  const payload = await buildModalPayload(gate, rec.action, approvalId, agentName, agent, now, agentNote);
  if (!payload) { gate.approvals.reject(approvalId, 'could not resolve agreement for approval'); return; }

  let decision;
  try {
    decision = await gate.modal.promptForDecision(payload);
  } catch (e) {
    gate.approvals.reject(approvalId, `modal error: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }
  if (decision.kind === 'reject') { gate.approvals.reject(approvalId, decision.reason); return; }

  // Approved — but only run if the flip actually landed (not cancelled/expired).
  const approved = gate.approvals.approve(approvalId);
  if (!approved || approved.state !== 'approved') return;

  try {
    const result = await runAction(gate.engine, rec.action);
    gate.approvals.markDone(approvalId, result.agreement.id, JSON.stringify(result.payload));
  } catch (e) {
    gate.approvals.reject(approvalId, `engine error: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function buildModalPayload(
  gate: Gate, action: PendingAction, proposalId: string, agentName: string,
  agent: { pairedAt: number }, now: () => number, agentNote?: string,
): Promise<CollabModalPayload | null> {
  const rec = gate.approvals.get(proposalId);
  const expiresAtMs = rec?.expiresAt ?? now();
  const base = {
    proposalId, agentName, agentPairedAgo: humanAgo(now() - agent.pairedAt), expiresAtMs,
    ...(agentNote ? { agentNote } : {}),
  };
  if (action.kind === 'propose') {
    return {
      ...base, kind: 'agreement_propose' as CollabModalKind,
      counterparty: action.input.counterpartyAddress,
      ...(action.input.counterpartyHash ? { counterpartyLabel: action.input.counterpartyHash } : {}),
      decision: action.input.decision, terms: action.input.terms,
      amountFtc: microToFtc(action.input.amountMicroFtc), amountMicroFtc: action.input.amountMicroFtc,
    };
  }
  // accept / counter — load the live agreement for the human-readable terms.
  const a = await gate.engine.get(action.agreementId);
  if (!a) return null;
  if (action.kind === 'accept') {
    return {
      ...base, kind: 'agreement_accept', counterparty: a.counterpartyAddress,
      ...(a.counterpartyHash ? { counterpartyLabel: a.counterpartyHash } : {}),
      decision: a.decision, terms: a.terms, amountFtc: microToFtc(a.amountMicroFtc), amountMicroFtc: a.amountMicroFtc,
    };
  }
  return {
    ...base, kind: 'agreement_counter', counterparty: a.counterpartyAddress,
    ...(a.counterpartyHash ? { counterpartyLabel: a.counterpartyHash } : {}),
    decision: action.counter.decision, terms: action.counter.terms,
    amountFtc: microToFtc(action.counter.amountMicroFtc), amountMicroFtc: action.counter.amountMicroFtc,
  };
}

function runAction(engine: AgreementEngine, action: PendingAction): Promise<{ agreement: { id: string }; payload: unknown }> {
  if (action.kind === 'propose') return engine.propose(action.input);
  if (action.kind === 'accept') return engine.respond(action.agreementId, 'accept');
  return engine.respond(action.agreementId, 'counter', action.counter);
}

/** Dispatch an inbound signed agreement message to the right applier. */
async function dispatchIngest(
  engine: AgreementEngine, type: 'propose' | 'respond' | 'withdraw' | 'ack',
  payload: Record<string, unknown>, fromHash: string,
): Promise<unknown> {
  switch (type) {
    case 'propose': return engine.applyInboundPropose(payload as unknown as AgreementProposePayload, fromHash);
    case 'respond': return engine.applyInboundRespond(payload as unknown as AgreementRespondPayload, fromHash);
    case 'withdraw': return engine.applyInboundWithdraw(payload as unknown as AgreementWithdrawPayload, fromHash);
    case 'ack': return engine.applyInboundAck(payload as unknown as AgreementAckPayload, fromHash);
  }
}

function microToFtc(microFtc: string): number {
  // Display only — never the signed value. Safe for typical amounts.
  return Number(microFtc) / 1_000_000;
}

function humanAgo(ms: number): string {
  if (ms < 60_000) return 'just now';
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

// ── Helpers ──────────────────────────────────────────────────────
const JsonRpcRequest = z.object({
  jsonrpc: z.literal('2.0'),
  method: z.string(),
  params: z.unknown().optional(),
  id: z.union([z.string(), z.number(), z.null()]),
});

function jsonRpcResult(id: string | number | null, result: unknown): object {
  return { jsonrpc: '2.0', id, result };
}
function jsonRpcError(code: number, message: string, id: string | number | null): object {
  return { jsonrpc: '2.0', id, error: { code, message } };
}
function formatZodError(e: z.ZodError): string {
  return e.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
}
function msgOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
