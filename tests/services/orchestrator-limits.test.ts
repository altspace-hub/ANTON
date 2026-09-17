/**
 * orchestrator-limits.test.ts — every hard limit is real or gone.
 *
 * On 2026-09-16 ORCHESTRATOR_HARD_LIMITS declared seven limits and two had a
 * call site. MAX_HEARTBEATS_PER_HOUR, MIN_HEARTBEAT_INTERVAL_MINUTES,
 * MAX_TRAIL_ENTRIES and MAX_COST_PER_CYCLE_USD were declared and never
 * checked; MAX_CHAIN_DEPTH capped chaining code that does not exist. The
 * dashboard and GET /limits presented all seven as ceilings in force.
 *
 * Each limit that stays is exercised here at its call site; the deleted one
 * is asserted absent; and a source guard fails the moment a key is added to
 * the table without a `ORCHESTRATOR_HARD_LIMITS.<KEY>` reference somewhere.
 */
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';

const mocks = vi.hoisted(() => ({
  callChat: vi.fn(),
  schedule: vi.fn(),
}));

vi.mock('node-cron', () => ({
  validate: () => true,
  schedule: (expr: string, fn: () => Promise<void>) => mocks.schedule(expr, fn),
}));
vi.mock('../../server/services/provider-router.js', () => ({
  callChat: (opts: { model: string }) => mocks.callChat(opts),
  // The live default is the subscription engine: bare claude-* ids resolve to Sonnet 5 ($2 / $10 per MTok).
  mapModelToProvider: (m: string) => (m.startsWith('claude-') ? 'sdk:claude-sonnet-5' : m),
  resolveModel: (tier: string) => (tier === 'large' ? 'sdk:claude-opus-5' : 'sdk:claude-sonnet-5'),
}));
vi.mock('../../server/services/model-adapter.js', () => ({
  getProviderFromModelId: (m: string) => (m.startsWith('sdk:') ? 'anthropic_sdk' : m.startsWith('ollama:') ? 'ollama' : 'anthropic'),
}));
vi.mock('../../server/services/audit-queue.js', () => ({ enqueueAudit: () => undefined }));
vi.mock('../../server/services/notification-service.js', () => ({
  createNotification: vi.fn(async () => undefined),
}));
vi.mock('../../server/services/sdk-engine-store.js', () => ({ isSdkEngineEnabled: () => true }));
vi.mock('../../server/services/orchestrator-pattern-engine.js', () => ({
  detectPatterns: async () => [],
  recordPatternDetection: async () => ({ ok: true, proposalId: null }),
  shouldAutoPause: async () => ({ pause: false, reason: '' }),
}));
vi.mock('fs-extra', () => ({
  default: { ensureDir: vi.fn(async () => undefined), writeFile: vi.fn(async () => undefined) },
}));

import {
  ORCHESTRATOR_HARD_LIMITS,
  addTrailEntry,
  runHeartbeatCycle,
  CycleCostMeter,
  CycleCostCapExceededError,
} from '../../server/services/orchestrator-engine.js';
import {
  effectiveHeartbeatIntervalMinutes,
  countHeartbeatsInLastHour,
  scheduledTick,
  initOrchestratorHeartbeat,
  stopOrchestratorHeartbeat,
} from '../../server/services/orchestrator-heartbeat.js';

const repoRoot = path.resolve(__dirname, '..', '..');

// ── Fake adapter (the ledger test's shape, trimmed) ─────────────────────────

interface Run { sql: string; params: unknown[] }
interface DeadlineRow { id: string; title: string; due_date: string; days_remaining: number }

interface FakeOptions {
  config?: Record<string, unknown>;
  /** rows in orchestrator_heartbeats from the last hour */
  cyclesLastHour?: number;
  /** make the cycles-per-hour query throw */
  cyclesError?: string;
  /** entries already on any trail (overrides the running count) */
  fixedTrailCount?: number;
  deadlines?: DeadlineRow[];
  proposalRatingsNewestFirst?: Array<string | null>;
}

const CONFIG = {
  id: 'default',
  heartbeat_enabled: 1,
  heartbeat_interval_minutes: 30,
  briefing_schedule: 'manual',
  radar_urgency_threshold: 0.7,
  quality_decline_threshold: 1.5,
  deadline_alert_days: 14,
  heartbeat_model: 'claude-haiku-4-5-20251001',
  briefing_model: 'claude-sonnet-4-6',
  planning_model: 'claude-opus-4-8',
  orchestrator_paused: 0,
  fully_disabled: 0,
  reasoning_transparency_level: 1,
};

function makeFakeDb(opts: FakeOptions = {}) {
  const runs: Run[] = [];
  const entriesPerTrail = new Map<string, number>();
  const db: DatabaseAdapter = {
    dialect: 'postgresql' as DatabaseAdapter['dialect'],
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      if (sql.includes('FROM orchestrator_config')) return (opts.config ?? CONFIG) as T;
      if (sql.includes('FROM orchestrator_heartbeats') && sql.includes('COUNT(*)')) {
        if (opts.cyclesError) throw new Error(opts.cyclesError);
        return { c: String(opts.cyclesLastHour ?? 0) } as T;
      }
      if (sql.includes('FROM orchestrator_proposals') && sql.includes('COUNT(*)')) return { c: '1' } as T;
      if (sql.includes('FROM app_settings')) return undefined;
      if (sql.includes('COUNT(*) as c FROM orchestrator_reasoning_entries')) {
        const n = opts.fixedTrailCount ?? entriesPerTrail.get(String(params[0])) ?? 0;
        return { c: String(n) } as T; // bigint → string, the live shape
      }
      return undefined;
    },
    async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
      if (sql.includes('FROM orchestrator_proposals')) {
        return (opts.proposalRatingsNewestFirst ?? []).slice(0, Number(params[0] ?? 10)).map((r) => ({ human_rating: r })) as T[];
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
      return { changes: 1, lastInsertRowid: 0 } as RunResult;
    },
    async exec() { /* noop */ },
    async transaction<T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
    async close() { /* noop */ },
  };
  const runsMatching = (re: RegExp) => runs.filter((r) => re.test(r.sql));
  return {
    db,
    runs,
    runsMatching,
    entryInserts: () => runsMatching(/INSERT INTO orchestrator_reasoning_entries/).map((r) => ({
      entryType: String(r.params[2]),
      sequence: r.params[3],
      title: String(r.params[4]),
      content: String(r.params[5]),
      metadata: r.params[9] ? JSON.parse(String(r.params[9])) as Record<string, unknown> : null,
      costUsd: r.params[12],
    })),
    heartbeatInserts: () => runsMatching(/INSERT INTO orchestrator_heartbeats/).map((r) => ({
      actionTaken: r.params[3],
      errorMessage: r.params[5],
      status: r.params[6],
    })),
    briefingInserts: () => runsMatching(/INSERT INTO orchestrator_briefings/),
  };
}

const OVERDUE: DeadlineRow = { id: 'd-1', title: 'AMLR Article 16 BWRA filing', due_date: '2026-09-01', days_remaining: -15 };
// urgency = max(0.4, 1 - (10/14)*0.5) = 0.643 — moderate: the rules cannot decide three of these, so the model is asked
const moderate = (n: number): DeadlineRow => ({ id: `d-${n}`, title: `Policy review ${n}`, due_date: '2026-09-26', days_remaining: 10 });

const BRIEFING_JSON = JSON.stringify({
  summary: '1 signal detected.',
  briefing_markdown: '# Briefing\n\nThe BWRA filing is overdue.',
  proposals: [{
    signal_source: 'deadline', signal_id: 'd-1', signal_summary: 'BWRA filing overdue',
    action_type: 'deadline_action', proposed_action: 'Run the AMLR Gap Analysis module',
    confidence_score: 0.9, urgency_score: 0.95, rationale: 'Overdue statutory filing', estimated_effort: '30 min',
  }],
});

let warn: MockInstance<typeof console.warn>;
let log: MockInstance<typeof console.log>;
let info: MockInstance<typeof console.info>;
let error: MockInstance<typeof console.error>;

beforeEach(() => {
  mocks.callChat.mockReset();
  mocks.schedule.mockReset();
  mocks.schedule.mockImplementation(() => ({ stop: vi.fn() }));
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  delete process.env.ORCHESTRATOR_HEARTBEAT_MODEL;
  stopOrchestratorHeartbeat();
  log.mockClear();
});

afterEach(() => {
  warn.mockRestore();
  log.mockRestore();
  info.mockRestore();
  error.mockRestore();
});

const warned = () => warn.mock.calls.map((c) => c.map(String).join(' '));

// ── Source guard ─────────────────────────────────────────────────────────────

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function serverSources(): Array<{ file: string; code: string }> {
  const out: Array<{ file: string; code: string }> = [];
  for (const dir of ['server/services', 'server/routes']) {
    for (const entry of readdirSync(path.join(repoRoot, dir), { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
      const file = path.join(entry.parentPath ?? entry.path, entry.name);
      out.push({ file: path.relative(repoRoot, file), code: stripComments(readFileSync(file, 'utf-8')) });
    }
  }
  return out;
}

describe('ORCHESTRATOR_HARD_LIMITS — the table matches what the code enforces', () => {
  it('holds exactly the six enforced limits', () => {
    expect(Object.keys(ORCHESTRATOR_HARD_LIMITS).sort()).toEqual([
      'MAX_AUTO_EXECUTIONS_PER_DAY',
      'MAX_COST_PER_CYCLE_USD',
      'MAX_HEARTBEATS_PER_HOUR',
      'MAX_PROPOSALS_PER_BRIEFING',
      'MAX_TRAIL_ENTRIES',
      'MIN_HEARTBEAT_INTERVAL_MINUTES',
    ]);
  });

  it('every key has a call site — a limit nobody reads is not a limit', () => {
    const sources = serverSources();
    for (const key of Object.keys(ORCHESTRATOR_HARD_LIMITS)) {
      const re = new RegExp(String.raw`ORCHESTRATOR_HARD_LIMITS\.${key}\b`);
      const sites = sources.filter((s) => re.test(s.code)).map((s) => s.file);
      expect(sites, `${key} has no call site`).not.toHaveLength(0);
    }
  });

  it('MAX_CHAIN_DEPTH is gone from the table and from all code (no chaining code exists to cap)', () => {
    expect(ORCHESTRATOR_HARD_LIMITS).not.toHaveProperty('MAX_CHAIN_DEPTH');
    for (const s of serverSources()) {
      expect(s.code, s.file).not.toMatch(/MAX_CHAIN_DEPTH/);
    }
    const dashboard = stripComments(readFileSync(path.join(repoRoot, 'src/pages/OrchestratorDashboard.tsx'), 'utf-8'));
    expect(dashboard).not.toMatch(/MAX_CHAIN_DEPTH|chain max|max depth/);
    // Nothing follows a chain: the table and the linkage columns are never touched.
    for (const s of serverSources()) {
      expect(s.code, s.file).not.toMatch(/orchestrator_workflow_chains/);
      expect(s.code, s.file).not.toMatch(/chained_(from|to)_execution_id\s*=/);
    }
  });
});

// ── MIN_HEARTBEAT_INTERVAL_MINUTES ───────────────────────────────────────────

describe('MIN_HEARTBEAT_INTERVAL_MINUTES — the configured interval is clamped at scheduling time', () => {
  it('clamps anything shorter up to the floor and leaves longer intervals alone', () => {
    expect(ORCHESTRATOR_HARD_LIMITS.MIN_HEARTBEAT_INTERVAL_MINUTES).toBe(10);
    expect(effectiveHeartbeatIntervalMinutes(1)).toBe(10);
    expect(effectiveHeartbeatIntervalMinutes(9)).toBe(10);
    expect(effectiveHeartbeatIntervalMinutes(10)).toBe(10);
    expect(effectiveHeartbeatIntervalMinutes(45)).toBe(45);
    expect(effectiveHeartbeatIntervalMinutes(90)).toBe(90);
  });

  it('a missing or non-numeric interval falls back to 30, not to the floor', () => {
    expect(effectiveHeartbeatIntervalMinutes(undefined)).toBe(30);
    expect(effectiveHeartbeatIntervalMinutes(null)).toBe(30);
    expect(effectiveHeartbeatIntervalMinutes(Number.NaN)).toBe(30);
  });

  it('a config row with interval 3 registers a 10-minute timer and says why', async () => {
    const { db } = makeFakeDb({ config: { ...CONFIG, heartbeat_interval_minutes: 3 } });
    await initOrchestratorHeartbeat(db, null);
    expect(mocks.schedule).toHaveBeenCalledTimes(1);
    expect(mocks.schedule.mock.calls[0][0]).toBe('*/10 * * * *');
    expect(warned().join('\n')).toMatch(/interval 3 min is below MIN_HEARTBEAT_INTERVAL_MINUTES=10/);
  });

  it('a config row with interval 30 registers a 30-minute timer without a warning', async () => {
    const { db } = makeFakeDb();
    await initOrchestratorHeartbeat(db, null);
    expect(mocks.schedule.mock.calls[0][0]).toBe('*/30 * * * *');
    expect(warned().join('\n')).not.toMatch(/MIN_HEARTBEAT_INTERVAL_MINUTES/);
  });
});

// ── MAX_HEARTBEATS_PER_HOUR ──────────────────────────────────────────────────

describe('MAX_HEARTBEATS_PER_HOUR — a scheduled tick skips when the last hour is full', () => {
  it('counts rows in orchestrator_heartbeats from the last hour', async () => {
    const fake = makeFakeDb({ cyclesLastHour: 4 });
    expect(await countHeartbeatsInLastHour(fake.db)).toBe(4);
  });

  it('a failed count is treated as 0 with a warning, never as a crash', async () => {
    const fake = makeFakeDb({ cyclesError: 'relation missing' });
    expect(await countHeartbeatsInLastHour(fake.db)).toBe(0);
    expect(warned().join('\n')).toMatch(/could not count recent cycles/);
  });

  it('at the cap the tick runs no cycle and logs the skip; under the cap it runs', async () => {
    expect(ORCHESTRATOR_HARD_LIMITS.MAX_HEARTBEATS_PER_HOUR).toBe(6);

    const full = makeFakeDb({ cyclesLastHour: 6 });
    expect(await scheduledTick(full.db, null, 'heartbeat')).toBeNull();
    expect(full.heartbeatInserts()).toHaveLength(0);
    expect(warned().join('\n')).toMatch(/heartbeat tick skipped: 6 cycle\(s\) in the last hour reached MAX_HEARTBEATS_PER_HOUR=6/);

    const room = makeFakeDb({ cyclesLastHour: 5 });
    const result = await scheduledTick(room.db, null, 'heartbeat');
    expect(result).toMatchObject({ action: 'none', signalCount: 0 });
    expect(room.heartbeatInserts()).toHaveLength(1);
  });

  it('over the cap (a runaway) is skipped too', async () => {
    const fake = makeFakeDb({ cyclesLastHour: 40 });
    expect(await scheduledTick(fake.db, null, 'daily')).toBeNull();
    expect(fake.heartbeatInserts()).toHaveLength(0);
  });
});

// ── MAX_TRAIL_ENTRIES ────────────────────────────────────────────────────────

describe('MAX_TRAIL_ENTRIES — addTrailEntry refuses the entry past the cap (it does not evict)', () => {
  const entry = { entry_type: 'context_gathering' as const, title: 't', content: 'c' };

  it('the 100th entry is written as sequence 100', async () => {
    expect(ORCHESTRATOR_HARD_LIMITS.MAX_TRAIL_ENTRIES).toBe(100);
    const fake = makeFakeDb({ fixedTrailCount: 99 });
    expect(await addTrailEntry(fake.db, 'trail-a', entry)).toBe(true);
    expect(fake.entryInserts().map((e) => e.sequence)).toEqual([100]);
  });

  it('the 101st is refused: no INSERT, no DELETE of the oldest, one warning per trail', async () => {
    const fake = makeFakeDb({ fixedTrailCount: 100 });
    expect(await addTrailEntry(fake.db, 'trail-b', entry)).toBe(false);
    expect(await addTrailEntry(fake.db, 'trail-b', { ...entry, entry_type: 'completion_summary' })).toBe(false);
    expect(fake.entryInserts()).toHaveLength(0);
    expect(fake.runsMatching(/DELETE FROM orchestrator_reasoning_entries/)).toHaveLength(0);
    expect(fake.runsMatching(/UPDATE orchestrator_reasoning_trails/)).toHaveLength(0);
    const lines = warned().filter((l) => /MAX_TRAIL_ENTRIES=100 reached/.test(l));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('trail-b');
    expect(lines[0]).toContain('first refused: context_gathering');
  });
});

// ── MAX_COST_PER_CYCLE_USD ───────────────────────────────────────────────────

describe('CycleCostMeter (pure)', () => {
  it('sums priced calls, counts unpriced ones as $0, and returns the cap error once the total passes the cap', () => {
    expect(ORCHESTRATOR_HARD_LIMITS.MAX_COST_PER_CYCLE_USD).toBe(5);
    const meter = new CycleCostMeter();
    expect(meter.record({ step: 'significance', costUsd: 2.5 })).toBeNull();
    expect(meter.record({ step: 'briefing', costUsd: null })).toBeNull();
    expect(meter).toMatchObject({ totalUsd: 2.5, pricedCalls: 1, unpricedCalls: 1, exceeded: false });
    expect(meter.describe()).toMatch(/\$2\.5000 across 1 priced call\(s\) \+ 1 unpriced call\(s\) counted as \$0/);
    expect(meter.describe()).toMatch(/the total is a floor/);

    const hit = meter.record({ step: 'briefing', costUsd: 2.6 });
    expect(hit).toBeInstanceOf(CycleCostCapExceededError);
    expect(hit?.message).toBe('MAX_COST_PER_CYCLE_USD exceeded: $5.1000 after the briefing call is over the $5.00 cap — cycle aborted');
    expect(meter.exceeded).toBe(true);
  });

  it('exactly the cap is not over it', () => {
    const meter = new CycleCostMeter(5);
    expect(meter.record({ step: 'briefing', costUsd: 5 })).toBeNull();
  });
});

describe('MAX_COST_PER_CYCLE_USD — runHeartbeatCycle aborts past the cap', () => {
  it('a briefing call that takes the cycle over $5 is discarded: no briefing row, an error heartbeat row naming the cap, the spend on the trail', async () => {
    // 600,000 output tokens on Sonnet 5 at $10/MTok = $6.00
    mocks.callChat.mockResolvedValue({ text: BRIEFING_JSON, thinking: '', inputTokens: 1000, outputTokens: 600_000 });
    const fake = makeFakeDb({ deadlines: [OVERDUE] });

    const result = await runHeartbeatCycle(fake.db, null, 'heartbeat');

    expect(result.action).toBe('none');
    expect(result.briefingId).toBeUndefined();
    expect(result.costUsd).toBeCloseTo(6.002, 3);
    expect(result.unpricedCalls).toBe(0);
    expect(fake.briefingInserts()).toHaveLength(0);

    const [hb] = fake.heartbeatInserts();
    expect(hb.status).toBe('error');
    expect(hb.actionTaken).toBe('none');
    expect(String(hb.errorMessage)).toMatch(/MAX_COST_PER_CYCLE_USD exceeded: \$6\.0020 after the briefing call is over the \$5\.00 cap — cycle aborted/);

    const entries = fake.entryInserts();
    expect(entries.map((e) => e.entryType)).toEqual(['signal_detection', 'signal_assessment', 'proposal_reasoning', 'completion_summary', 'completion_summary']);
    const discarded = entries[3];
    expect(discarded.title).toBe('Briefing discarded — cycle cost cap exceeded');
    expect(discarded.costUsd).toBeCloseTo(6.002, 3);
    expect(discarded.metadata).toMatchObject({ cost_cap_exceeded: true, briefing_discarded: true, cycle_priced_calls: 1, cycle_unpriced_calls: 0, cycle_cost_cap_usd: 5 });
    expect(entries[4].title).toBe('Cycle aborted — cost cap exceeded');

    expect(warned().join('\n')).toMatch(/MAX_COST_PER_CYCLE_USD exceeded/);
    const complete = fake.runsMatching(/UPDATE orchestrator_reasoning_trails SET\s+status = \?/);
    expect(complete[0].params[0]).toBe('failed');
  });

  it('the cost accumulates across the cycle: a $3 assessment plus a $3 briefing aborts after the briefing', async () => {
    // 300,000 output tokens = $3.00 per call
    mocks.callChat
      .mockResolvedValueOnce({ text: 'YES', thinking: '', inputTokens: 100, outputTokens: 300_000 })
      .mockResolvedValueOnce({ text: BRIEFING_JSON, thinking: '', inputTokens: 100, outputTokens: 300_000 });
    const fake = makeFakeDb({ deadlines: [moderate(1), moderate(2), moderate(3)] });

    const result = await runHeartbeatCycle(fake.db, null, 'heartbeat');

    expect(mocks.callChat).toHaveBeenCalledTimes(2);
    expect(result.action).toBe('none');
    expect(result.costUsd).toBeCloseTo(6.0004, 4);
    expect(fake.briefingInserts()).toHaveLength(0);
    const entries = fake.entryInserts();
    expect(entries[1].entryType).toBe('signal_assessment');
    expect(entries[1].metadata).toMatchObject({ cycle_priced_calls: 1 });
    expect(entries[1].metadata?.cycle_cost_usd).toBeCloseTo(3.0002, 4);
    expect(fake.heartbeatInserts()[0].status).toBe('error');
  });

  it('an assessment call alone over the cap aborts before the briefing is even attempted', async () => {
    mocks.callChat.mockResolvedValueOnce({ text: 'YES', thinking: '', inputTokens: 100, outputTokens: 600_000 });
    const fake = makeFakeDb({ deadlines: [moderate(1), moderate(2), moderate(3)] });

    const result = await runHeartbeatCycle(fake.db, null, 'heartbeat');

    expect(mocks.callChat).toHaveBeenCalledTimes(1);
    expect(result.action).toBe('none');
    expect(fake.entryInserts().map((e) => e.entryType)).toEqual(['signal_detection', 'signal_assessment', 'completion_summary']);
    expect(String(fake.heartbeatInserts()[0].errorMessage)).toMatch(/after the significance call/);
  });

  it('a call the ledger cannot price counts as $0 toward the cap and the cycle says the total is a floor', async () => {
    mocks.callChat.mockResolvedValue({ text: BRIEFING_JSON, thinking: '', inputTokens: 900, outputTokens: 300 });
    // ollama:qwen3 passes mapModelToProvider untouched and has no price entry → costUsd null
    const fake = makeFakeDb({ deadlines: [OVERDUE], config: { ...CONFIG, briefing_model: 'ollama:qwen3' } });

    const result = await runHeartbeatCycle(fake.db, null, 'heartbeat');

    expect(result.action).toBe('briefing_generated');
    expect(result.costUsd).toBe(0);
    expect(result.unpricedCalls).toBe(1);
    expect(fake.briefingInserts()).toHaveLength(1);
    const summary = fake.entryInserts().find((e) => e.entryType === 'completion_summary');
    expect(summary?.content).toMatch(/1 unpriced call\(s\) counted as \$0 \(plan usage or no price known — the total is a floor\)/);
    expect(summary?.metadata).toMatchObject({ cycle_cost_usd: 0, cycle_unpriced_calls: 1 });
    expect(summary?.costUsd).toBeNull();
    expect(fake.heartbeatInserts()[0].status).toBe('ok');
  });

  it('a priced cycle under the cap completes and reports its cost', async () => {
    mocks.callChat.mockResolvedValue({ text: BRIEFING_JSON, thinking: '', inputTokens: 900, outputTokens: 300 });
    const fake = makeFakeDb({ deadlines: [OVERDUE] });

    const result = await runHeartbeatCycle(fake.db, null, 'heartbeat');

    expect(result.action).toBe('briefing_generated');
    expect(result.costUsd).toBeCloseTo(0.0048, 6);
    expect(result.unpricedCalls).toBe(0);
    expect(fake.briefingInserts()).toHaveLength(1);
    expect(fake.heartbeatInserts()).toEqual([{ actionTaken: 'briefing_generated', errorMessage: null, status: 'ok' }]);
  });
});
