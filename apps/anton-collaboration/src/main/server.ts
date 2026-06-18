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

/** The verbs this program currently exposes (surfaced by getStatus + MCP). */
export const COLLAB_VERBS = ['getStatus', 'searchSellers', 'resolveSeller', 'inquireSeller'] as const;

export interface ServerDeps {
  pairings: PairingStore;
  /** Discovery config (relay base + fetch). Injected so tests stub the relay. */
  discovery?: DiscoveryConfig;
  /** The buyer's contact hash, attributed in the seller's inbox when inquiring.
   *  Optional — when absent the seller sees an anonymous visitor. */
  buyerContactHash?: string;
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
