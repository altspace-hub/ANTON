/**
 * orchestrator-heartbeat-ledger.test.ts — a paused no-op is not a decision.
 *
 * Live numbers on 2026-09-16: 7,031 audit_log rows with module 'orchestrator',
 * every one with model NULL and zero tokens; 3,753 heartbeats the spend gate
 * had skipped, each of which still wrote a reasoning trail (two entries — the
 * second numbered 11, because COUNT(*) came back as the string "1" and
 * "1" + 1 is "11") plus an audit row saying 'completed'. Meanwhile the cycles
 * that DID call the model never recorded which model, or what it cost.
 *
 * These tests pin the ledger to the truth: a skipped or rule-settled cycle
 * leaves only its heartbeat row (and, when paused, a skipped-cycle counter);
 * a cycle that calls the model leaves one audit row per call carrying the
 * dispatched model, its provider, the token counts and the cost, and a trail
 * whose entries carry the same.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';

const mocks = vi.hoisted(() => ({
  callChat: vi.fn(),
  enqueueAudit: vi.fn(),
  createNotification: vi.fn(async () => undefined),
}));

vi.mock('../../server/services/provider-router.js', () => ({
  callChat: (opts: { model: string; maxTokens?: number }) => mocks.callChat(opts),
  // The live default is the subscription engine: every bare claude-* id the
  // orchestrator hardcodes resolves to the engine's medium/small tier.
  mapModelToProvider: (m: string) => (m.startsWith('claude-') ? 'sdk:claude-sonnet-5' : m),
}));
vi.mock('../../server/services/model-adapter.js', () => ({
  getProviderFromModelId: (m: string) => (m.startsWith('sdk:') ? 'anthropic_sdk' : 'anthropic'),
}));
vi.mock('../../server/services/audit-queue.js', () => ({
  enqueueAudit: (entry: unknown) => mocks.enqueueAudit(entry),
}));
vi.mock('../../server/services/notification-service.js', () => ({
  createNotification: mocks.createNotification,
}));
vi.mock('../../server/services/orchestrator-pattern-engine.js', () => ({
  detectPatterns: async () => [],
  recordPatternDetection: async () => ({ ok: true }),
  shouldAutoPause: async () => ({ pause: false, reason: '' }),
}));
vi.mock('fs-extra', () => ({
  default: { ensureDir: vi.fn(async () => undefined), writeFile: vi.fn(async () => undefined) },
}));

import { runHeartbeatCycle } from '../../server/services/orchestrator-engine.js';
import { SPEND_GATE_STATE_KEY } from '../../server/services/orchestrator-spend-gate.js';

// ── Fake adapter ─────────────────────────────────────────────────────────────

interface Run { sql: string; params: unknown[] }

interface DeadlineRow { id: string; title: string; due_date: string; days_remaining: number }

interface FakeDbOptions {
  /** human_rating of the most recent proposals, newest first (10 nulls = gate closed) */
  proposalRatingsNewestFirst?: Array<string | null>;
  /** seeded app_settings value for the gate state */
  gateState?: Record<string, unknown>;
  /** rows the deadline signal reader returns */
  deadlines?: DeadlineRow[];
}

const CONFIG = {
  id: 'default',
  heartbeat_enabled: 1,
  heartbeat_interval_minutes: 30,
  briefing_schedule: 'daily',
  radar_urgency_threshold: 0.7,
  quality_decline_threshold: 1.5,
  deadline_alert_days: 14,
  heartbeat_model: 'claude-haiku-4-5-20251001',
  briefing_model: 'claude-sonnet-4-6',
  orchestrator_paused: 0,
  fully_disabled: 0,
  reasoning_transparency_level: 1,
};

function makeFakeDb(opts: FakeDbOptions) {
  const runs: Run[] = [];
  const entriesPerTrail = new Map<string, number>();
  let gateState: string | undefined = opts.gateState ? JSON.stringify(opts.gateState) : undefined;

  const db: DatabaseAdapter = {
    dialect: 'postgresql' as DatabaseAdapter['dialect'],
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      if (sql.includes('FROM orchestrator_config')) return CONFIG as T;
      if (sql.includes('FROM app_settings')) {
        if (params[0] === SPEND_GATE_STATE_KEY && gateState !== undefined) return { value: gateState } as T;
        return undefined;
      }
      if (sql.includes('COUNT(*) as c FROM orchestrator_reasoning_entries')) {
        // node-postgres returns COUNT(*) (a bigint) as a string — the live shape.
        return { c: String(entriesPerTrail.get(String(params[0])) ?? 0) } as T;
      }
      return undefined;
    },
    async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
      if (sql.includes('FROM orchestrator_proposals')) {
        return (opts.proposalRatingsNewestFirst ?? [])
          .slice(0, Number(params[0] ?? 10))
          .map((r) => ({ human_rating: r })) as T[];
      }
      if (sql.includes('FROM deadlines')) {
        return (opts.deadlines ?? []).map((d) => ({ ...d, category: null, priority: null, status: 'open' })) as T[];
      }
      return [];
    },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      runs.push({ sql, params });
      if (sql.includes('INSERT INTO orchestrator_reasoning_entries')) {
        const trailId = String(params[1]);
        entriesPerTrail.set(trailId, (entriesPerTrail.get(trailId) ?? 0) + 1);
      }
      if (sql.includes('INSERT INTO app_settings') && params[0] === SPEND_GATE_STATE_KEY) {
        gateState = String(params[1]);
      }
      return { changes: 1, lastInsertRowid: 0 } as RunResult;
    },
    async exec() { /* noop */ },
    async transaction<T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
    async close() { /* noop */ },
  };

  const runsMatching = (re: RegExp) => runs.filter((r) => re.test(r.sql));
  const entryInserts = () => runsMatching(/INSERT INTO orchestrator_reasoning_entries/).map((r) => ({
    trailId: String(r.params[1]),
    entryType: String(r.params[2]),
    sequence: r.params[3],
    content: String(r.params[5]),
    thinking: r.params[6],
    modelUsed: r.params[10],
    tokensUsed: r.params[11],
    costUsd: r.params[12],
  }));
  const heartbeatInserts = () => runsMatching(/INSERT INTO orchestrator_heartbeats/).map((r) => ({
    actionTaken: r.params[3],
    errorMessage: r.params[5],
    status: r.params[6],
  }));

  return {
    db,
    runs,
    runsMatching,
    entryInserts,
    heartbeatInserts,
    trailInserts: () => runsMatching(/INSERT INTO orchestrator_reasoning_trails/),
    gateState: () => (gateState ? JSON.parse(gateState) as Record<string, unknown> : undefined),
  };
}

const OVERDUE: DeadlineRow = { id: 'd-1', title: 'AMLR Article 16 BWRA filing', due_date: '2026-09-01', days_remaining: -15 };
// urgency = max(0.4, 1 - (10/14)*0.5) = 0.643 — moderate: below 0.7, above 0.5
const moderate = (n: number): DeadlineRow => ({ id: `d-${n}`, title: `Policy review ${n}`, due_date: '2026-09-26', days_remaining: 10 });

const BRIEFING_JSON = JSON.stringify({
  summary: '1 signal detected. 1 needs immediate attention.',
  briefing_markdown: '# ANTON Orchestrator Briefing\n\nThe BWRA filing is overdue.',
  proposals: [{
    signal_source: 'deadline',
    signal_id: 'd-1',
    signal_summary: 'BWRA filing overdue',
    action_type: 'deadline_action',
    proposed_action: 'Run the AMLR Gap Analysis module on the BWRA filing',
    confidence_score: 0.9,
    urgency_score: 0.95,
    rationale: 'Overdue statutory filing',
    estimated_effort: '30 min automated + 15 min review',
  }],
});

beforeEach(() => {
  mocks.callChat.mockReset();
  mocks.enqueueAudit.mockReset();
  mocks.createNotification.mockClear();
  delete process.env.ORCHESTRATOR_HEARTBEAT_MODEL;
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('runHeartbeatCycle — the ledger tells the truth', () => {
  it('a cycle the spend gate skips writes no audit row and no trail; it only counts itself in the gate state', async () => {
    const fake = makeFakeDb({
      proposalRatingsNewestFirst: new Array(10).fill(null),
      gateState: { paused: true, changed_at: '2026-06-11T10:30:00.251Z', threshold: 10 },
      deadlines: [OVERDUE],
    });

    const first = await runHeartbeatCycle(fake.db, null, 'heartbeat');
    const second = await runHeartbeatCycle(fake.db, null, 'heartbeat');

    expect(first.action).toBe('spend_gate_paused');
    expect(first.signalCount).toBe(1);
    expect(first.trailId).toBeUndefined();
    expect(second.action).toBe('spend_gate_paused');

    expect(mocks.callChat).not.toHaveBeenCalled();
    expect(mocks.enqueueAudit).not.toHaveBeenCalled();
    expect(fake.trailInserts()).toHaveLength(0);
    expect(fake.entryInserts()).toHaveLength(0);
    expect(fake.runsMatching(/UPDATE orchestrator_reasoning_trails/)).toHaveLength(0);

    // The heartbeat row is still the honest operational record of each tick.
    expect(fake.heartbeatInserts().map((h) => h.actionTaken)).toEqual(['spend_gate_paused', 'spend_gate_paused']);

    // ...and the gate state carries the count — no transition, so no notification.
    const state = fake.gateState();
    expect(state).toMatchObject({ paused: true, changed_at: '2026-06-11T10:30:00.251Z', threshold: 10, paused_cycles: 2 });
    expect(typeof state?.last_paused_cycle_at).toBe('string');
    expect(mocks.createNotification).not.toHaveBeenCalled();
  });

  it('a routine cycle the rules settle without the model leaves no audit row and no trail', async () => {
    const fake = makeFakeDb({ proposalRatingsNewestFirst: [], deadlines: [] });

    const result = await runHeartbeatCycle(fake.db, null, 'heartbeat');

    expect(result).toMatchObject({ action: 'none', signalCount: 0 });
    expect(result.trailId).toBeUndefined();
    expect(mocks.callChat).not.toHaveBeenCalled();
    expect(mocks.enqueueAudit).not.toHaveBeenCalled();
    expect(fake.trailInserts()).toHaveLength(0);
    expect(fake.heartbeatInserts()).toEqual([{ actionTaken: 'none', errorMessage: null, status: 'ok' }]);
  });

  it('a cycle that briefs writes one audit row per model call with the dispatched model, provider, tokens and cost — and a trail whose entries carry them', async () => {
    mocks.callChat.mockResolvedValue({ text: BRIEFING_JSON, thinking: 'weighed the overdue filing', inputTokens: 900, outputTokens: 300 });
    const fake = makeFakeDb({ proposalRatingsNewestFirst: [], deadlines: [OVERDUE] });

    const result = await runHeartbeatCycle(fake.db, null, 'heartbeat');

    expect(result.action).toBe('briefing_generated');
    expect(result.briefingId).toBeDefined();
    expect(result.trailId).toBeDefined();

    // An overdue deadline is significant by rule — the only model call is the briefing.
    expect(mocks.callChat).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueAudit).toHaveBeenCalledTimes(1);
    const audit = mocks.enqueueAudit.mock.calls[0][0] as Record<string, unknown>;
    expect(audit).toMatchObject({
      moduleId: 'orchestrator',
      model: 'sdk:claude-sonnet-5',
      provider: 'anthropic_sdk',
      thinkingLevel: 'investigate',
      inputTokenCount: 900,
      outputTokenCount: 300,
      responseStatus: 'success',
    });
    // claude-sonnet-5: $2 / $10 per MTok → 900 × 2e-6 + 300 × 10e-6
    expect(audit.estimatedCostUsd).toBeCloseTo(0.0048, 6);
    expect(audit.knowledgeSourcesUsed).toEqual(['orchestrator:briefing', `trail:${result.trailId}`]);

    // One trail, four entries, numbered 1..4 (not 1, 11, 21, 31).
    expect(fake.trailInserts()).toHaveLength(1);
    const entries = fake.entryInserts();
    expect(entries.map((e) => e.entryType)).toEqual(['signal_detection', 'signal_assessment', 'proposal_reasoning', 'completion_summary']);
    expect(entries.map((e) => e.sequence)).toEqual([1, 2, 3, 4]);
    expect(entries.every((e) => e.trailId === result.trailId)).toBe(true);

    // The rule decided significance: no model on that step.
    expect(entries[1]).toMatchObject({ modelUsed: null, tokensUsed: null, thinking: null });
    expect(entries[1].content).toMatch(/decided by rule, no model call/);
    // The reasoning step names what will actually run, not just the configured id.
    expect(entries[2].content).toContain('sdk:claude-sonnet-5');
    expect(entries[2].content).toContain('configured as claude-sonnet-4-6');
    // The briefing step carries the call's model, tokens, cost and thinking.
    expect(entries[3]).toMatchObject({ modelUsed: 'sdk:claude-sonnet-5', tokensUsed: 1200, thinking: 'weighed the overdue filing' });
    expect(entries[3].costUsd).toBeCloseTo(0.0048, 6);

    const complete = fake.runsMatching(/UPDATE orchestrator_reasoning_trails SET\s+status = \?/);
    expect(complete).toHaveLength(1);
    expect(complete[0].sql).toContain('total_reasoning_tokens');
    expect(complete[0].params[0]).toBe('completed');

    expect(fake.heartbeatInserts()).toEqual([{ actionTaken: 'briefing_generated', errorMessage: null, status: 'ok' }]);
  });

  it('a cycle the model judges routine still leaves its trail and its audit row — the model decided, so there is a reason to keep', async () => {
    mocks.callChat.mockResolvedValue({ text: 'NO', thinking: '', inputTokens: 120, outputTokens: 1 });
    const fake = makeFakeDb({ proposalRatingsNewestFirst: [], deadlines: [moderate(1), moderate(2), moderate(3)] });

    const result = await runHeartbeatCycle(fake.db, null, 'heartbeat');

    expect(result.action).toBe('none');
    expect(result.signalCount).toBe(3);
    expect(result.trailId).toBeDefined();

    expect(mocks.callChat).toHaveBeenCalledTimes(1);
    expect(mocks.callChat.mock.calls[0][0]).toMatchObject({ model: 'sdk:claude-sonnet-5', maxTokens: 10 });
    expect(mocks.enqueueAudit).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueAudit.mock.calls[0][0]).toMatchObject({
      moduleId: 'orchestrator',
      model: 'sdk:claude-sonnet-5',
      provider: 'anthropic_sdk',
      inputTokenCount: 120,
      outputTokenCount: 1,
      responseStatus: 'success',
      knowledgeSourcesUsed: ['orchestrator:significance', `trail:${result.trailId}`],
    });

    const entries = fake.entryInserts();
    expect(entries.map((e) => e.entryType)).toEqual(['signal_detection', 'signal_assessment']);
    expect(entries.map((e) => e.sequence)).toEqual([1, 2]);
    // Empty thinking is stored as NULL, never ''.
    expect(entries[1]).toMatchObject({ modelUsed: 'sdk:claude-sonnet-5', tokensUsed: 121, thinking: null });
    expect(entries[1].content).toMatch(/sdk:claude-sonnet-5 assessed 3 moderate signals/);
    expect(fake.heartbeatInserts()).toEqual([{ actionTaken: 'none', errorMessage: null, status: 'ok' }]);
  });

  it('a briefing call that fails is an error row and a failed trail, never a completed no-op', async () => {
    mocks.callChat.mockRejectedValue(new Error('SDK engine busy'));
    const fake = makeFakeDb({ proposalRatingsNewestFirst: [], deadlines: [OVERDUE] });

    const result = await runHeartbeatCycle(fake.db, null, 'heartbeat');

    expect(result.action).toBe('none');
    expect(result.briefingId).toBeUndefined();
    expect(result.trailId).toBeDefined();

    expect(mocks.enqueueAudit).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueAudit.mock.calls[0][0]).toMatchObject({
      moduleId: 'orchestrator',
      model: 'sdk:claude-sonnet-5',
      provider: 'anthropic_sdk',
      inputTokenCount: 0,
      outputTokenCount: 0,
      responseStatus: 'error',
    });

    const entries = fake.entryInserts();
    expect(entries.map((e) => e.entryType)).toEqual(['signal_detection', 'signal_assessment', 'proposal_reasoning', 'completion_summary']);
    expect(entries[3].content).toMatch(/Briefing generation failed on sdk:claude-sonnet-5: SDK engine busy/);

    const complete = fake.runsMatching(/UPDATE orchestrator_reasoning_trails SET\s+status = \?/);
    expect(complete).toHaveLength(1);
    expect(complete[0].params[0]).toBe('failed');

    const [heartbeat] = fake.heartbeatInserts();
    expect(heartbeat.status).toBe('error');
    expect(heartbeat.actionTaken).toBe('none');
    expect(String(heartbeat.errorMessage)).toMatch(/Briefing generation failed on sdk:claude-sonnet-5/);
  });
});
