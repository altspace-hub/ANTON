/**
 * negotiation-orchestrator.test.ts — the bounded buyer loop, driven by a
 * StubNegotiationBrain + a stub invoke (no network, no real LLM). Proves the
 * happy paths AND every guard: ceiling clamp, accept-over-ceiling refusal,
 * round cap, anti-stall dedupe, monotonic progress, malformed-decision
 * fail-closed, walk-away, seller-offline, and mid-flight cancel.
 */
import { describe, it, expect } from 'vitest';
import { runNegotiation } from '../../src/main/negotiation-orchestrator.js';
import { NegotiationStore } from '../../src/main/negotiation-store.js';
import { StubNegotiationBrain, type NegotiationGoal } from '../../src/main/negotiation-brain.js';
import type { ResolvedPortal } from '../../src/main/discovery.js';
import type { InvokeResult } from '../../src/main/talk.js';

function seller(): ResolvedPortal {
  return {
    portalAddress: 'kicks.sthlm.portal',
    contactHash: 'seller-hash',
    descriptor: {
      portal: { name: 'kicks', namespace: 'sthlm', displayTitle: 'Kicks', originEndpoint: 'https://kicks.example' },
      capabilities: [{ id: 'cap-inq', verb: 'inquire', title: 'Ask' }],
      payment: { ftcAddress: 'fc_sellerPAY' },
    },
  };
}

/** A stub invoke that returns scripted responses (last repeats) + records inputs. */
function invoker(responses: InvokeResult[]): {
  fn: (capId: string, input: Record<string, unknown>) => Promise<InvokeResult>;
  calls: Array<{ capId: string; input: Record<string, unknown> }>;
} {
  const calls: Array<{ capId: string; input: Record<string, unknown> }> = [];
  const fn = async (capId: string, input: Record<string, unknown>): Promise<InvokeResult> => {
    calls.push({ capId, input });
    return responses[Math.min(calls.length - 1, responses.length - 1)]!;
  };
  return { fn, calls };
}

const quote = (priceFtc: number, available = true): InvokeResult =>
  ({ kind: 'response', responseId: 'r', output: { priceFtc, available } });

async function run(opts: {
  brain: StubNegotiationBrain;
  invoke: (capId: string, input: Record<string, unknown>) => Promise<InvokeResult>;
  goal: NegotiationGoal;
  maxRounds?: number;
}): Promise<{ store: NegotiationStore; job: ReturnType<NegotiationStore['get']> }> {
  let t = 1_000_000;
  const now = (): number => (t += 1);
  const store = new NegotiationStore(now);
  const job = store.create('agent', opts.goal, 'kicks.sthlm.portal');
  await runNegotiation({
    job, goal: opts.goal, seller: seller(), capabilityId: 'cap-inq',
    invoke: opts.invoke, brain: opts.brain, store, maxRounds: opts.maxRounds ?? 4, now,
  });
  return { store, job: store.get(job.id) };
}

const GOAL = (maxMicro = '2000000', over: Partial<NegotiationGoal> = {}): NegotiationGoal =>
  ({ objective: 'Air Jordans EU43', maxAmountMicroFtc: maxMicro, ...over });

describe('runNegotiation', () => {
  it('accept_terms on the first in-ceiling quote → propose_ready with the seller pay address', async () => {
    const brain = new StubNegotiationBrain().queue1({ action: 'accept_terms', rationale: 'good price' });
    const inv = invoker([quote(1.8)]);
    const { job } = await run({ brain, invoke: inv.fn, goal: GOAL('2000000') });
    expect(job!.state).toBe('done');
    expect(job!.outcome).toMatchObject({ kind: 'propose_ready', rationale: 'good price' });
    const prepared = (job!.outcome as { prepared: { amountMicroFtc: string; counterpartyAddress: string } }).prepared;
    expect(prepared.amountMicroFtc).toBe('1800000');
    expect(prepared.counterpartyAddress).toBe('fc_sellerPAY');
  });

  it('counter then accept → two seller round-trips, prepared reflects the accepted quote', async () => {
    const brain = new StubNegotiationBrain()
      .queue1({ action: 'counter', counter: { amountMicroFtc: '1800000', terms: 'firm' }, rationale: 'too high' })
      .queue1({ action: 'accept_terms', rationale: 'now fair' });
    const inv = invoker([quote(2.5), quote(1.8)]);
    const { job } = await run({ brain, invoke: inv.fn, goal: GOAL('2000000') });
    expect((job!.outcome as { kind: string }).kind).toBe('propose_ready');
    // The 2nd inquiry carried the counter offer.
    expect(inv.calls[1]!.input.counterOfferMicroFtc).toBe('1800000');
    // transcript: 2 quote turns + 2 decision turns = 4.
    expect(job!.transcript).toHaveLength(4);
  });

  it('round cap reached without acceptance → no_agreement; brain called exactly maxRounds times', async () => {
    const brain = new StubNegotiationBrain()
      .queue1({ action: 'counter', counter: { amountMicroFtc: '1900000' }, rationale: 'r1' })
      .queue1({ action: 'counter', counter: { amountMicroFtc: '1800000' }, rationale: 'r2' });
    const inv = invoker([quote(2.5)]);
    const { job } = await run({ brain, invoke: inv.fn, goal: GOAL('2000000'), maxRounds: 2 });
    expect(job!.outcome).toEqual({ kind: 'no_agreement', reason: 'round cap (2) reached' });
    expect(brain.invocations()).toHaveLength(2);
  });

  it('G2: a counter ABOVE the ceiling is clamped DOWN before being sent', async () => {
    const brain = new StubNegotiationBrain()
      .queue1({ action: 'counter', counter: { amountMicroFtc: '5000000' }, rationale: 'lowball' })
      .queue1({ action: 'accept_terms', rationale: 'ok' });
    const inv = invoker([quote(2.5), quote(2.0)]);
    const { job } = await run({ brain, invoke: inv.fn, goal: GOAL('2000000') });
    expect(inv.calls[1]!.input.counterOfferMicroFtc).toBe('2000000'); // clamped to ceiling, never 5M
    expect((job!.outcome as { kind: string }).kind).toBe('propose_ready');
  });

  it('G2: accept_terms when the final quote price > ceiling → no_agreement (never prepare over-budget)', async () => {
    const brain = new StubNegotiationBrain().queue1({ action: 'accept_terms', rationale: 'oops' });
    const inv = invoker([quote(2.0)]); // 2.0 FTC = 2_000_000 µFTC > 1_000_000 ceiling
    const { job } = await run({ brain, invoke: inv.fn, goal: GOAL('1000000') });
    expect(job!.outcome).toEqual({ kind: 'no_agreement', reason: 'final quote over ceiling or unpriced' });
  });

  it('G6: a malformed brain decision → job rejected (fail-closed), no further seller calls', async () => {
    const brain = new StubNegotiationBrain().queue1({ action: 'frobnicate' as never, rationale: 'x' });
    const inv = invoker([quote(1.5)]);
    const { job } = await run({ brain, invoke: inv.fn, goal: GOAL('2000000') });
    expect(job!.state).toBe('rejected');
    expect(job!.rejectReason).toMatch(/invalid decision/);
    expect(inv.calls).toHaveLength(1);
  });

  it('walk_away on round 1 → walked_away, exactly one inquiry', async () => {
    const brain = new StubNegotiationBrain().queue1({ action: 'walk_away', rationale: 'unavailable' });
    const inv = invoker([quote(1.5, false)]);
    const { job } = await run({ brain, invoke: inv.fn, goal: GOAL('2000000') });
    expect(job!.outcome).toEqual({ kind: 'walked_away', rationale: 'unavailable' });
    expect(inv.calls).toHaveLength(1);
  });

  it('seller offline mid-loop → graceful no_agreement, brain never consulted', async () => {
    const brain = new StubNegotiationBrain(); // nothing queued — must NOT be called
    const inv = invoker([{ kind: 'seller_offline', message: 'down' }]);
    const { job } = await run({ brain, invoke: inv.fn, goal: GOAL('2000000') });
    expect(job!.outcome).toEqual({ kind: 'no_agreement', reason: 'seller seller_offline' });
    expect(brain.invocations()).toHaveLength(0);
  });

  it('G5 anti-stall: the brain repeats the same inquire_more → no_agreement (no progress)', async () => {
    const brain = new StubNegotiationBrain()
      .queue1({ action: 'inquire_more', inquiryInput: { q: 1 }, rationale: 'ask again' })
      .queue1({ action: 'inquire_more', inquiryInput: { q: 1 }, rationale: 'same again' });
    const inv = invoker([quote(2.5)]);
    const { job } = await run({ brain, invoke: inv.fn, goal: GOAL('2000000') });
    expect((job!.outcome as { kind: string; reason: string })).toEqual({ kind: 'no_agreement', reason: 'no progress (repeated inquiry)' });
  });

  it('G3 monotonic: a counter that does not improve our own ask → no_agreement', async () => {
    const brain = new StubNegotiationBrain()
      .queue1({ action: 'counter', counter: { amountMicroFtc: '1800000' }, rationale: 'r1' })
      .queue1({ action: 'counter', counter: { amountMicroFtc: '1900000' }, rationale: 'r2 raises our ask' });
    const inv = invoker([quote(2.5)]);
    const { job } = await run({ brain, invoke: inv.fn, goal: GOAL('2000000') });
    expect(job!.outcome).toEqual({ kind: 'no_agreement', reason: 'counter not improving' });
  });

  it('a huge / unparseable seller priceFtc is dropped (not stored as a malformed amount)', async () => {
    const brain = new StubNegotiationBrain().queue1({ action: 'accept_terms', rationale: 'looks cheap' });
    const inv = invoker([{ kind: 'response', responseId: 'r', output: { priceFtc: 1e290, available: true } }]);
    const { job } = await run({ brain, invoke: inv.fn, goal: GOAL('2000000') });
    // No valid price parsed → accept can't prepare → no_agreement, NOT propose_ready.
    expect(job!.outcome).toEqual({ kind: 'no_agreement', reason: 'final quote over ceiling or unpriced' });
  });

  it('the exported loop rejects a malformed goal ceiling instead of throwing', async () => {
    let t = 1_000_000;
    const now = (): number => (t += 1);
    const store = new NegotiationStore(now);
    const goal: NegotiationGoal = { objective: 'x', maxAmountMicroFtc: '1.5' }; // not a µFTC integer
    const job = store.create('agent', goal, 'kicks.sthlm.portal');
    const inv = invoker([quote(1.0)]);
    const brain = new StubNegotiationBrain().queue1({ action: 'accept_terms', rationale: 'x' });
    await runNegotiation({ job, goal, seller: seller(), capabilityId: 'cap-inq', invoke: inv.fn, brain, store, maxRounds: 4, now });
    expect(store.get(job.id)!.state).toBe('rejected');
    expect(inv.calls).toHaveLength(0); // never even inquired
  });

  it('anti-stall dedupes NESTED-key-permuted inquiries', async () => {
    const brain = new StubNegotiationBrain()
      .queue1({ action: 'inquire_more', inquiryInput: { a: { x: 1, y: 2 } }, rationale: 'r1' })
      .queue1({ action: 'inquire_more', inquiryInput: { a: { y: 2, x: 1 } }, rationale: 'permuted' });
    const inv = invoker([quote(2.5)]);
    const { job } = await run({ brain, invoke: inv.fn, goal: GOAL('2000000') });
    expect(job!.outcome).toEqual({ kind: 'no_agreement', reason: 'no progress (repeated inquiry)' });
  });

  it('cancel before start: a cancelled job never runs the loop', async () => {
    let t = 1_000_000;
    const now = (): number => (t += 1);
    const store = new NegotiationStore(now);
    const goal = GOAL('2000000');
    const job = store.create('agent', goal, 'kicks.sthlm.portal');
    store.cancel(job.id); // pending → cancelled BEFORE runNegotiation
    const inv = invoker([quote(1.8)]);
    const brain = new StubNegotiationBrain().queue1({ action: 'accept_terms', rationale: 'x' });
    await runNegotiation({ job, goal, seller: seller(), capabilityId: 'cap-inq', invoke: inv.fn, brain, store, maxRounds: 4, now });
    expect(store.get(job.id)!.state).toBe('cancelled');
    expect(inv.calls).toHaveLength(0); // never inquired
  });
});
