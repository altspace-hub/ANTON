// Unit tests for Beehive protocol dispatch + Queen relay policy.
//
// Covers the two pieces that are safe to test without a full DB:
//   1. shouldQueenRelay() — table is the source of truth for which
//      non-Queen message types propagate via star topology. A change
//      here without updating the test is almost certainly a bug.
//   2. handleInbound() validation paths (malformed envelope + sender
//      mismatch + unknown type) via a mock DatabaseAdapter.
//
// What this file deliberately does NOT cover:
//   • Full DB-backed applier behaviour — that needs a running Postgres
//     and is the domain of integration tests.
//   • Cross-instance AAP routing — requires two instances + a harness.
//
// D2 of the deferred-follow-up plan.

import { describe, it, expect, vi } from 'vitest';
import { shouldQueenRelay } from '../../../server/services/beehive/beehive-protocol.js';
import type { BeehiveMessageType } from '../../../server/services/beehive/types.js';

describe('shouldQueenRelay', () => {
  // Enum table — every type in the union must have an explicit expectation.
  // Adding a new message type forces a test update here (by design).
  const expectations: Array<[BeehiveMessageType, boolean]> = [
    ['hive:contribution', true],
    ['hive:join', true],
    ['hive:leave', true],
    ['hive:decline', true],
    ['hive:dissent', true],
    ['hive:approve', true],
    ['hive:invite', false],
    ['hive:round_advance', false],
    ['hive:round_summary', false],
    ['hive:converge', false],
    ['hive:conclude', false],
    ['hive:synthesis_draft', false],
    ['hive:state_sync', false],
    ['hive:heartbeat', false],
    ['hive:create', false],
  ];

  for (const [type, expected] of expectations) {
    it(`${type} → relay = ${expected}`, () => {
      expect(shouldQueenRelay(type)).toBe(expected);
    });
  }

  it('unknown message types default to no-relay (safe default)', () => {
    // Cast because the union is closed — we're testing the default-case
    // fallback which only fires when a future type arrives before the
    // switch is updated.
    expect(shouldQueenRelay('hive:nonexistent' as BeehiveMessageType)).toBe(false);
  });

  it('non-Queen originated types are all in the relay set', () => {
    // Stated as an invariant: any message a non-Queen participant can
    // *originate* must be relayed by the Queen, otherwise peers lose
    // state convergence. Queen-only messages must NOT relay (Queen is
    // already the origin).
    const nonQueenOriginated: BeehiveMessageType[] = [
      'hive:contribution', 'hive:join', 'hive:leave',
      'hive:decline', 'hive:dissent', 'hive:approve',
    ];
    for (const t of nonQueenOriginated) expect(shouldQueenRelay(t)).toBe(true);

    const queenOriginated: BeehiveMessageType[] = [
      'hive:invite', 'hive:round_advance', 'hive:round_summary',
      'hive:converge', 'hive:conclude', 'hive:synthesis_draft',
      'hive:create',
    ];
    for (const t of queenOriginated) expect(shouldQueenRelay(t)).toBe(false);
  });
});

// ── handleInbound validation paths ─────────────────────────────────────────
//
// Full applier behaviour needs DB; here we only test the pre-dispatch
// checks that reject malformed or impersonated envelopes. These paths are
// the security boundary — a regression that accepts a mismatched-sender
// envelope would let one participant forge messages from another.

describe('handleInbound validation', () => {
  /**
   * Build a minimal-working DatabaseAdapter mock that records every run()
   * call and returns canned results for get/all. handleInbound's
   * validation path calls auditLog first (which does an INSERT) — our
   * mock swallows it.
   */
  function buildMockDb() {
    const runCalls: Array<{ sql: string; args: unknown[] }> = [];
    const mock = {
      dialect: 'pg' as const,
      run: vi.fn(async (sql: string, ...args: unknown[]) => {
        runCalls.push({ sql, args });
        return { changes: 1, lastInsertRowid: 0 };
      }),
      get: vi.fn(async () => null),
      all: vi.fn(async () => []),
      exec: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
      transaction: vi.fn(async <T>(fn: (tx: unknown) => Promise<T>) => fn(mock)),
    };
    return { mock, runCalls };
  }

  it('rejects envelopes missing type', async () => {
    const { mock } = buildMockDb();
    const { createBeehiveProtocol } = await import('../../../server/services/beehive/beehive-protocol.js');
    const proto = await createBeehiveProtocol(mock as never);

    const result = await proto.handleInbound('ANTON-AAAA-BBBB-CCCC-DDDD', {
      // no `type` field
      hive_id: 'hive_123',
      sender: 'ANTON-AAAA-BBBB-CCCC-DDDD',
      payload: {},
      signature: 'x',
      timestamp: new Date().toISOString(),
      sequence: 1,
    });

    expect(result.ok).toBe(false);
    expect(result.applied).toBe(false);
    expect(result.reason).toContain('Malformed');
  });

  it('rejects envelopes missing hive_id', async () => {
    const { mock } = buildMockDb();
    const { createBeehiveProtocol } = await import('../../../server/services/beehive/beehive-protocol.js');
    const proto = await createBeehiveProtocol(mock as never);

    const result = await proto.handleInbound('ANTON-AAAA-BBBB-CCCC-DDDD', {
      type: 'hive:heartbeat',
      // no `hive_id`
      sender: 'ANTON-AAAA-BBBB-CCCC-DDDD',
      payload: { sent_at: new Date().toISOString() },
      signature: 'x',
      timestamp: new Date().toISOString(),
      sequence: 1,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('Malformed');
  });

  it('rejects envelopes with a sender mismatch', async () => {
    const { mock } = buildMockDb();
    const { createBeehiveProtocol } = await import('../../../server/services/beehive/beehive-protocol.js');
    const proto = await createBeehiveProtocol(mock as never);

    // fromHash is the AAP-layer validated sender. envelope.sender is the
    // self-claimed one inside the envelope. Mismatch = impersonation attempt.
    const result = await proto.handleInbound('ANTON-REAL-SENDER-HASH-ABCD', {
      type: 'hive:heartbeat',
      hive_id: 'hive_123',
      sender: 'ANTON-FORGED-OTHER-HASH-EFGH',
      payload: { sent_at: new Date().toISOString() },
      signature: 'x',
      timestamp: new Date().toISOString(),
      sequence: 1,
    });

    expect(result.ok).toBe(false);
    expect(result.applied).toBe(false);
    expect(result.reason).toContain('sender mismatch');
  });

  it('rejects null / undefined envelope', async () => {
    const { mock } = buildMockDb();
    const { createBeehiveProtocol } = await import('../../../server/services/beehive/beehive-protocol.js');
    const proto = await createBeehiveProtocol(mock as never);

    const r1 = await proto.handleInbound('ANTON-AAAA-BBBB-CCCC-DDDD', null);
    expect(r1.ok).toBe(false);
    expect(r1.reason).toContain('Malformed');

    const r2 = await proto.handleInbound('ANTON-AAAA-BBBB-CCCC-DDDD', 'not-an-object');
    expect(r2.ok).toBe(false);
    expect(r2.reason).toContain('Malformed');
  });

  it('records every inbound envelope to the audit log (even rejected dispatch)', async () => {
    const { mock, runCalls } = buildMockDb();
    const { createBeehiveProtocol } = await import('../../../server/services/beehive/beehive-protocol.js');
    const proto = await createBeehiveProtocol(mock as never);

    // Unknown (to the switch) message type — handler should still audit.
    await proto.handleInbound('ANTON-AAAA-BBBB-CCCC-DDDD', {
      type: 'hive:synthesis_draft',
      hive_id: 'hive_123',
      sender: 'ANTON-AAAA-BBBB-CCCC-DDDD',
      payload: { id: 'o_1', output_type: 'synthesis_report', draft_text: 'foo' },
      signature: 'sig',
      timestamp: new Date().toISOString(),
      sequence: 1,
    });

    const auditCalls = runCalls.filter(c => c.sql.includes('beehive_message_log'));
    expect(auditCalls.length).toBeGreaterThanOrEqual(1);
  });
});
