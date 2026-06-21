/**
 * negotiation-store.test.ts — the negotiation job lifecycle store: TTL clamping,
 * lazy expiry, the pending→running→done transitions, reject, cancel (pending OR
 * running, so a mid-flight cancel works), and the reap janitor.
 */
import { describe, it, expect } from 'vitest';
import {
  NegotiationStore, MIN_TTL_MS, MAX_TTL_MS, DEFAULT_TTL_MS,
} from '../../src/main/negotiation-store.js';
import type { NegotiationGoal } from '../../src/main/negotiation-brain.js';

const GOAL: NegotiationGoal = { objective: 'Jordans 43', maxAmountMicroFtc: '2000000' };

function clock(start = 1_000_000): { now: () => number; advance: (ms: number) => void } {
  let t = start;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

describe('NegotiationStore', () => {
  it('create returns pending with a clamped TTL', () => {
    const c = clock();
    const s = new NegotiationStore(c.now);
    expect(s.create('a', GOAL, 'kicks.sthlm.portal', 5_000).expiresAt).toBe(c.now() + MIN_TTL_MS);
    expect(s.create('a', GOAL, 'kicks.sthlm.portal', 9_999_999).expiresAt).toBe(c.now() + MAX_TTL_MS);
    expect(s.create('a', GOAL, 'kicks.sthlm.portal').expiresAt).toBe(c.now() + DEFAULT_TTL_MS);
    expect(s.create('a', GOAL, 'kicks.sthlm.portal').state).toBe('pending');
  });

  it('get lazily expires a stale pending job', () => {
    const c = clock();
    const s = new NegotiationStore(c.now);
    const j = s.create('a', GOAL, 'x', MIN_TTL_MS);
    c.advance(MIN_TTL_MS + 1);
    expect(s.get(j.id)!.state).toBe('expired');
  });

  it('markRunning flips pending→running once only', () => {
    const s = new NegotiationStore();
    const j = s.create('a', GOAL, 'x');
    expect(s.markRunning(j.id)!.state).toBe('running');
    expect(s.markRunning(j.id)).toBeNull(); // already running
  });

  it('appendTurn records the round + transcript; markDone stamps the outcome', () => {
    const c = clock();
    const s = new NegotiationStore(c.now);
    const j = s.create('a', GOAL, 'x');
    s.markRunning(j.id);
    s.appendTurn(j.id, { round: 1, at: c.now() });
    expect(s.get(j.id)!.round).toBe(1);
    expect(s.get(j.id)!.transcript).toHaveLength(1);
    s.markDone(j.id, { kind: 'walked_away', rationale: 'nope' });
    expect(s.get(j.id)!.state).toBe('done');
    expect(s.get(j.id)!.outcome).toEqual({ kind: 'walked_away', rationale: 'nope' });
  });

  it('markDone only fires from running', () => {
    const s = new NegotiationStore();
    const j = s.create('a', GOAL, 'x'); // still pending
    s.markDone(j.id, { kind: 'no_agreement', reason: 'x' });
    expect(s.get(j.id)!.state).toBe('pending'); // unchanged
  });

  it('reject sets the reason; cancel works for pending AND running, not terminal', () => {
    const s = new NegotiationStore();
    const a = s.create('a', GOAL, 'x');
    s.reject(a.id, 'boom');
    expect(s.get(a.id)!.state).toBe('rejected');
    expect(s.get(a.id)!.rejectReason).toBe('boom');

    const b = s.create('a', GOAL, 'x');
    expect(s.cancel(b.id)).toBe(true); // pending → cancelled
    expect(s.get(b.id)!.state).toBe('cancelled');

    const d = s.create('a', GOAL, 'x');
    s.markRunning(d.id);
    expect(s.cancel(d.id)).toBe(true); // running → cancelled (mid-flight)

    const e = s.create('a', GOAL, 'x');
    s.markRunning(e.id);
    s.markDone(e.id, { kind: 'walked_away', rationale: 'x' });
    expect(s.cancel(e.id)).toBe(false); // terminal — no cancel
  });

  it('reap removes terminal jobs older than the cutoff, keeps fresh + non-terminal', () => {
    const c = clock();
    const s = new NegotiationStore(c.now);
    const old = s.create('a', GOAL, 'x');
    s.markRunning(old.id); s.markDone(old.id, { kind: 'walked_away', rationale: 'x' });
    c.advance(60 * 60 * 1000); // 1h later
    const fresh = s.create('a', GOAL, 'x'); // still pending, just created
    expect(s.reap(30 * 60 * 1000)).toBe(1); // only the old terminal one
    expect(s.get(old.id)).toBeNull();
    expect(s.get(fresh.id)).toBeTruthy();
  });
});
