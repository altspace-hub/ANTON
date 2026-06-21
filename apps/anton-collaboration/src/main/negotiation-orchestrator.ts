/**
 * negotiation-orchestrator.ts — the bounded buyer negotiation loop. Ties
 * together DISCOVER/TALK (already resolved + a bound invoke fn) and the
 * injectable NegotiationBrain, and drives toward a PREPARED proposeAgreement.
 *
 * THE LOAD-BEARING INVARIANT (guard G8): this module imports NEITHER the modal
 * NOR the AgreementEngine. negotiate is UNGATED TALK. Its best possible terminal
 * is `propose_ready`, which only PREPARES proposeAgreement params — the agent
 * must still run those through the existing, non-bypassable, human-gated
 * proposeAgreement verb. The loop signs nothing and spends nothing.
 *
 * The brain is ADVISORY and UNTRUSTED: every amount is clamped to the goal's
 * hard ceiling here (BigInt on the µFTC string), invalid decisions fail closed,
 * and the loop is bounded (rounds + dedupe + monotonic-progress + the job TTL).
 */
import type {
  NegotiationBrain, NegotiationGoal, NegotiationDecision, SellerQuote,
} from './negotiation-brain.js';
import type { NegotiationStore, NegotiationJob, PreparedProposal } from './negotiation-store.js';
import type { ResolvedPortal } from './discovery.js';
import type { InvokeResult } from './talk.js';

/** Hard ceiling on TALK rounds — decoupled from the AGREE layer's MAX_COUNTERS
 *  (a buyer may want more haggling rounds than signed counters). */
export const MAX_NEGOTIATION_ROUNDS = 8;
export const DEFAULT_NEGOTIATION_ROUNDS = 4;

export interface RunNegotiationArgs {
  job: NegotiationJob;
  goal: NegotiationGoal;
  /** Pre-resolved seller (the loop never re-resolves). */
  seller: ResolvedPortal;
  /** The capability id to inquire/negotiate against. */
  capabilityId: string;
  /** Bound TALK call — invokeCapability(seller, capId, input, opts) with fetch +
   *  buyerContactHash already wired by the caller (keeps this module HTTP-free). */
  invoke: (capabilityId: string, input: Record<string, unknown>) => Promise<InvokeResult>;
  brain: NegotiationBrain;
  store: NegotiationStore;
  maxRounds: number;
  now?: () => number;
  signal?: AbortSignal;
}

/** Drive the negotiation to a terminal outcome on the job. Fire-and-forget;
 *  never throws (every failure routes to a terminal job state). */
export async function runNegotiation(args: RunNegotiationArgs): Promise<void> {
  const { job, goal, seller, capabilityId, invoke, brain, store, signal } = args;
  const now = args.now ?? (() => Date.now());
  const maxRounds = clampRounds(args.maxRounds);

  // pending → running. Abort if the flip didn't land (cancelled/expired/not pending).
  if (!store.markRunning(job.id)) return;

  // Defense-in-depth: runNegotiation is exported. The RPC path validates the
  // ceiling (zod MicroFtc), but never trust a direct caller — a malformed
  // ceiling would make BigInt() throw inside this fire-and-forget loop and leave
  // the job stuck at 'running'. Fail it terminally instead.
  if (!isMicro(goal.maxAmountMicroFtc)) {
    store.reject(job.id, 'goal.maxAmountMicroFtc is not a valid µFTC integer');
    return;
  }

  let lastAmount: bigint | null = null; // monotonic-progress guard (our own ask)
  let nextInquiry: Record<string, unknown> = goal.inquiryInput ? { ...goal.inquiryInput } : {};
  const seen = new Set<string>();

  for (let round = 1; round <= maxRounds; round++) {
    // G1/G7: honour cancel + the job TTL (store.get lazily expires a stale job).
    const cur = store.get(job.id);
    if (!cur || cur.state !== 'running') return;

    // ── TALK (ungated) ──
    let res: InvokeResult;
    try {
      res = await invoke(capabilityId, nextInquiry);
    } catch (e) {
      store.markDone(job.id, { kind: 'no_agreement', reason: `inquiry failed: ${msg(e)}` });
      return;
    }
    if (res.kind !== 'response') {
      store.markDone(job.id, { kind: 'no_agreement', reason: `seller ${res.kind}` });
      return;
    }
    const quote = parseQuote(res);
    store.appendTurn(job.id, { round, quote, at: now() });

    // ── THINK (injectable, untrusted, advisory) ──
    let decision: NegotiationDecision;
    try {
      decision = await brain.decide({
        goal, quote, round, maxRounds, transcript: cur.transcript, ...(signal ? { signal } : {}),
      });
    } catch (e) {
      store.reject(job.id, `brain error: ${msg(e)}`);
      return;
    }
    if (!validateDecision(decision)) { // G6 fail-closed
      store.reject(job.id, 'brain returned an invalid decision');
      return;
    }
    store.appendTurn(job.id, { round, decision, at: now() });

    switch (decision.action) {
      case 'accept_terms': {
        // The brain is satisfied with the seller's CURRENT quote — we PREPARE,
        // we do NOT sign. G2: never prepare an over-ceiling / unpriced commitment.
        const amt = quote.amountMicroFtc;
        if (!amt || !isMicro(amt) || bGt(amt, goal.maxAmountMicroFtc)) {
          store.markDone(job.id, { kind: 'no_agreement', reason: 'final quote over ceiling or unpriced' });
          return;
        }
        const prepared = buildPrepared(seller, goal, amt, decision);
        store.markDone(job.id, { kind: 'propose_ready', prepared, rationale: decision.rationale });
        return;
      }

      case 'walk_away':
        store.markDone(job.id, { kind: 'walked_away', rationale: decision.rationale });
        return;

      case 'inquire_more': {
        const input = (decision.inquiryInput && typeof decision.inquiryInput === 'object')
          ? decision.inquiryInput : {};
        const key = `inq:${stableKey(input)}`;
        if (seen.has(key)) { // G5 anti-stall
          store.markDone(job.id, { kind: 'no_agreement', reason: 'no progress (repeated inquiry)' });
          return;
        }
        seen.add(key);
        nextInquiry = input;
        continue;
      }

      case 'counter': {
        // G2: clamp the counter DOWN to the ceiling (never up into a commitment).
        let amt = decision.counter!.amountMicroFtc;
        if (bGt(amt, goal.maxAmountMicroFtc)) amt = goal.maxAmountMicroFtc;
        const amtBig = BigInt(amt);
        // G3 monotonic progress: a buyer counter must strictly LOWER our own ask.
        if (lastAmount !== null && amtBig >= lastAmount) {
          store.markDone(job.id, { kind: 'no_agreement', reason: 'counter not improving' });
          return;
        }
        const key = `cnt:${amt}`;
        if (seen.has(key)) { // G5 anti-stall
          store.markDone(job.id, { kind: 'no_agreement', reason: 'no progress (repeated counter)' });
          return;
        }
        seen.add(key);
        lastAmount = amtBig;
        // Send the counter to the SAME seller capability as the next inquiry — it
        // is still TALK (no signature). v1 carries it as structured fields.
        nextInquiry = {
          ...(goal.inquiryInput ?? {}),
          counterOfferMicroFtc: amt,
          ...(decision.counter!.terms ? { counterTerms: decision.counter!.terms } : {}),
        };
        continue;
      }
    }
  }

  // G4: fell off the loop = round cap hit without acceptance.
  store.markDone(job.id, { kind: 'no_agreement', reason: `round cap (${maxRounds}) reached` });
}

// ── Quote parsing (G9: untrusted seller output) ──────────────────────────────

/** Normalise a seller invoke response into a SellerQuote. Only a µFTC-shaped
 *  amount is accepted as a price; anything else leaves amount undefined and the
 *  brain reasons on `raw`. A price can NEVER silently become a signed amount. */
export function parseQuote(res: InvokeResult): SellerQuote {
  const out = (res.output ?? {}) as Record<string, unknown>;
  let amountMicroFtc: string | undefined;
  if (typeof out.amountMicroFtc === 'string' && isMicro(out.amountMicroFtc)) {
    amountMicroFtc = out.amountMicroFtc;
  } else if (typeof out.priceFtc === 'number' && Number.isFinite(out.priceFtc) && out.priceFtc >= 0) {
    // Re-validate the conversion: a huge priceFtc → exponential-notation string
    // (e.g. "1e+296") which is NOT a valid µFTC integer — drop it rather than
    // store a malformed "amount" (defense in depth; consumers also re-guard).
    const m = ftcToMicro(out.priceFtc);
    if (isMicro(m)) amountMicroFtc = m;
  }
  const available = typeof out.available === 'boolean' ? out.available
    : typeof out.inStock === 'boolean' ? out.inStock : undefined;
  return {
    raw: out,
    ...(amountMicroFtc !== undefined ? { amountMicroFtc } : {}),
    ...(available !== undefined ? { available } : {}),
    ...(res.responseId !== undefined ? { responseId: res.responseId } : {}),
    ...(typeof out.note === 'string' ? { note: out.note } : {}),
  };
}

function buildPrepared(
  seller: ResolvedPortal, goal: NegotiationGoal, amountMicroFtc: string, decision: NegotiationDecision,
): PreparedProposal {
  return {
    counterpartyAddress: sellerPaymentAddress(seller),
    ...(seller.contactHash ? { counterpartyHash: seller.contactHash } : {}),
    decision: decision.counter?.decision ?? goal.objective,
    terms: decision.counter?.terms ?? goal.constraints ?? '',
    amountMicroFtc,
    agentNote: `Negotiated via ANTON Collaboration with ${seller.portalAddress}. ${decision.rationale}`,
  };
}

/** Best available seller payment identifier for the agreement's counterparty.
 *  Prefers an fc_ address declared in the descriptor's payment block; falls back
 *  to the contactHash, then the portal address. (A richer address-resolution is
 *  a follow-on — the human reviews this in the proposeAgreement gate, and the
 *  spend is separately gated in Agent Pay.) */
export function sellerPaymentAddress(seller: ResolvedPortal): string {
  const pay = seller.descriptor.payment as Record<string, unknown> | undefined;
  for (const k of ['ftcAddress', 'address', 'payTo']) {
    const v = pay?.[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return seller.contactHash?.trim() || seller.portalAddress;
}

// ── Validation + numeric helpers ─────────────────────────────────────────────

const MICRO_RE = /^\d{1,30}$/;
function isMicro(s: string): boolean { return MICRO_RE.test(s); }
function ftcToMicro(ftc: number): string { return String(Math.round(ftc * 1_000_000)); }

/** BigInt > on two µFTC strings (both must be isMicro-valid). */
function bGt(a: string, b: string): boolean { return BigInt(a) > BigInt(b); }

export function validateDecision(d: unknown): d is NegotiationDecision {
  if (!d || typeof d !== 'object') return false;
  const x = d as Record<string, unknown>;
  if (!['accept_terms', 'counter', 'inquire_more', 'walk_away'].includes(x.action as string)) return false;
  if (typeof x.rationale !== 'string') return false;
  if (x.action === 'counter') {
    const c = x.counter as Record<string, unknown> | undefined;
    if (!c || typeof c.amountMicroFtc !== 'string' || !isMicro(c.amountMicroFtc)) return false;
  }
  if (x.action === 'inquire_more' && x.inquiryInput !== undefined) {
    if (typeof x.inquiryInput !== 'object' || x.inquiryInput === null) return false;
  }
  return true;
}

function clampRounds(n: number): number {
  if (!Number.isFinite(n) || n < 1) return DEFAULT_NEGOTIATION_ROUNDS;
  return Math.min(MAX_NEGOTIATION_ROUNDS, Math.floor(n));
}

/** Order-independent key for an inquiry/counter payload (dedupe) — recursively
 *  canonicalises so a brain can't defeat the anti-stall guard by permuting
 *  NESTED keys each round. (The round cap is the hard backstop regardless.) */
function stableKey(o: Record<string, unknown>): string {
  try {
    return JSON.stringify(canonical(o));
  } catch {
    return String(o);
  }
}

function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      out[k] = canonical((v as Record<string, unknown>)[k]);
    }
    return out;
  }
  return v;
}

function msg(e: unknown): string { return e instanceof Error ? e.message : String(e); }
