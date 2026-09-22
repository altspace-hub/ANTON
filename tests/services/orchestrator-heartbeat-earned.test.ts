/**
 * orchestrator-heartbeat-earned.test.ts — the orchestrator earns its heartbeat.
 *
 * Live numbers on 2026-09-16: orchestrator_stage at 1 since 2026-03-16 with
 * 2,606 briefings, 1,977 proposals, 0 rated, 0 executions — promotion
 * arithmetically impossible — and the 30-minute heartbeat writing a paused
 * no-op every cycle since September. Wave 0 stopped the empty audit rows; the
 * cycles still ran.
 *
 * The rule pinned here: a scheduled cycle runs only when heartbeat_enabled = 1
 * AND at least one proposal was rated in the last 90 days, OR app_settings
 * 'orchestrator_heartbeat_force' is 'true'. The timer stays registered while
 * idle; the idle reason is logged once per idle episode, never per tick. A
 * fresh install starts with the heartbeat OFF and its model ids resolved
 * through the provider router's tiers — no literal 4.x ids.
 */
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';

const mocks = vi.hoisted(() => ({
  runHeartbeatCycle: vi.fn(),
  schedule: vi.fn(),
  resolveModel: vi.fn((tier: string) => (tier === 'large' ? 'sdk:claude-opus-5' : 'sdk:claude-sonnet-5')),
}));

vi.mock('node-cron', () => ({
  validate: () => true,
  schedule: (expr: string, fn: () => Promise<void>) => mocks.schedule(expr, fn),
}));
vi.mock('../../server/services/orchestrator-engine.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../server/services/orchestrator-engine.js')>();
  return {
    ...original,
    runHeartbeatCycle: (...args: unknown[]) => mocks.runHeartbeatCycle(...args),
  };
});
vi.mock('../../server/services/provider-router.js', () => ({
  callChat: vi.fn(),
  mapModelToProvider: (m: string) => m,
  resolveModel: (tier: string) => mocks.resolveModel(tier),
}));
vi.mock('../../server/services/model-adapter.js', () => ({
  getProviderFromModelId: () => 'anthropic_sdk',
}));
vi.mock('../../server/services/audit-queue.js', () => ({ enqueueAudit: () => undefined }));
vi.mock('../../server/services/notification-service.js', () => ({
  createNotification: vi.fn(async () => undefined),
}));
vi.mock('../../server/services/sdk-engine-store.js', () => ({ isSdkEngineEnabled: () => true }));
vi.mock('fs-extra', () => ({
  default: { ensureDir: vi.fn(async () => undefined), writeFile: vi.fn(async () => undefined) },
}));

import {
  evaluateHeartbeatEarned,
  getHeartbeatEarnedState,
  heartbeatEarned,
  scheduledTick,
  initOrchestratorHeartbeat,
  stopOrchestratorHeartbeat,
  getHeartbeatStatus,
  HEARTBEAT_FORCE_KEY,
  HEARTBEAT_EARNED_WINDOW_DAYS,
} from '../../server/services/orchestrator-heartbeat.js';
import { getOrchestratorConfig, freshInstallConfig } from '../../server/services/orchestrator-engine.js';

// ── Fake adapter ─────────────────────────────────────────────────────────────

interface FakeState {
  /** null = no orchestrator_config row (fresh install) */
  config: Record<string, unknown> | null;
  /** proposals rated inside the window */
  rated: number;
  /** value of app_settings.orchestrator_heartbeat_force, undefined = no row */
  force?: string;
  /** rows in orchestrator_heartbeats from the last hour */
  cyclesLastHour: number;
  /** make the ratings query throw */
  ratedError?: string;
  lastCycleAt?: string;
}

const ENABLED_CONFIG = {
  id: 'default',
  heartbeat_enabled: 1,
  heartbeat_interval_minutes: 30,
  briefing_schedule: 'manual',
  radar_urgency_threshold: 0.7,
  quality_decline_threshold: 1.5,
  deadline_alert_days: 14,
  heartbeat_model: 'sdk:claude-sonnet-5',
  briefing_model: 'sdk:claude-opus-5',
  planning_model: 'sdk:claude-opus-5',
  orchestrator_paused: 0,
  fully_disabled: 0,
};

function makeDb(state: FakeState) {
  const gets: Array<{ sql: string; params: unknown[] }> = [];
  const db: DatabaseAdapter = {
    dialect: 'postgresql' as DatabaseAdapter['dialect'],
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      gets.push({ sql, params });
      if (sql.includes('FROM orchestrator_config')) return (state.config ?? undefined) as T | undefined;
      if (sql.includes('FROM orchestrator_proposals')) {
        if (state.ratedError) throw new Error(state.ratedError);
        // COUNT(*) is a bigint: node-postgres returns it as a string.
        return { c: String(state.rated) } as T;
      }
      if (sql.includes('FROM app_settings')) {
        return params[0] === HEARTBEAT_FORCE_KEY && state.force !== undefined ? ({ value: state.force } as T) : undefined;
      }
      if (sql.includes('FROM orchestrator_heartbeats')) {
        if (sql.includes('COUNT(*)')) return { c: String(state.cyclesLastHour) } as T;
        return (state.lastCycleAt ? { ran_at: state.lastCycleAt } : undefined) as T | undefined;
      }
      return undefined;
    },
    async all<T>(): Promise<T[]> { return []; },
    async run(): Promise<RunResult> { return { changes: 1, lastInsertRowid: 0 } as RunResult; },
    async exec() { /* noop */ },
    async transaction<T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
    async close() { /* noop */ },
  };
  return { db, gets };
}

let info: MockInstance<typeof console.info>;
let log: MockInstance<typeof console.log>;
let warn: MockInstance<typeof console.warn>;

beforeEach(() => {
  mocks.runHeartbeatCycle.mockReset();
  mocks.runHeartbeatCycle.mockResolvedValue({ action: 'none', signalCount: 0, costUsd: 0, unpricedCalls: 0 });
  mocks.schedule.mockReset();
  mocks.schedule.mockImplementation(() => ({ stop: vi.fn() }));
  mocks.resolveModel.mockClear();
  info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  delete process.env.ORCHESTRATOR_HEARTBEAT_MODEL;
  delete process.env.ORCHESTRATOR_BRIEFING_MODEL;
  stopOrchestratorHeartbeat(); // resets the per-boot idle-log state
  log.mockClear();
});

afterEach(() => {
  info.mockRestore();
  log.mockRestore();
  warn.mockRestore();
});

const idleLines = () => info.mock.calls.filter((c) => /orchestrator heartbeat idle: no rated proposal in 90 days; rate a proposal or set orchestrator_heartbeat_force/.test(String(c[0])));

// ── The rule ─────────────────────────────────────────────────────────────────

describe('evaluateHeartbeatEarned (pure)', () => {
  it('is idle with no rated proposal and no force', () => {
    const s = evaluateHeartbeatEarned(0, false);
    expect(s).toMatchObject({ earned: false, forced: false, ratedInWindow: 0, windowDays: 90 });
    expect(s.reason).toBe('Idle: no rated proposal in 90 days; rate a proposal or set orchestrator_heartbeat_force');
  });

  it('one rated proposal in the window earns it', () => {
    expect(evaluateHeartbeatEarned(1, false)).toMatchObject({ earned: true, forced: false, ratedInWindow: 1 });
    expect(evaluateHeartbeatEarned(1, false).reason).toMatch(/^Earned: 1 proposal\(s\) rated in the last 90 days/);
  });

  it('the force key earns it with zero ratings, and says so', () => {
    const s = evaluateHeartbeatEarned(0, true);
    expect(s).toMatchObject({ earned: true, forced: true, ratedInWindow: 0 });
    expect(s.reason).toContain(HEARTBEAT_FORCE_KEY);
  });

  it('force plus ratings is earned and reports both', () => {
    expect(evaluateHeartbeatEarned(3, true)).toMatchObject({ earned: true, forced: true, ratedInWindow: 3 });
  });

  it('a negative or non-numeric count is idle, not a crash', () => {
    expect(evaluateHeartbeatEarned(-2, false).earned).toBe(false);
    expect(evaluateHeartbeatEarned(Number.NaN, false).earned).toBe(false);
  });

  it('the window is 90 days', () => {
    expect(HEARTBEAT_EARNED_WINDOW_DAYS).toBe(90);
  });
});

describe('getHeartbeatEarnedState (db)', () => {
  it('reads the rated count from orchestrator_proposals over the 90-day window', async () => {
    const { db, gets } = makeDb({ config: ENABLED_CONFIG, rated: 2, cyclesLastHour: 0 });
    const s = await getHeartbeatEarnedState(db);
    expect(s).toMatchObject({ earned: true, forced: false, ratedInWindow: 2 });
    const q = gets.find((g) => g.sql.includes('FROM orchestrator_proposals'));
    expect(q?.sql).toMatch(/human_rating IS NOT NULL/);
    expect(q?.sql).toMatch(/make_interval\(days => \?\)/);
    expect(q?.params).toEqual([90]);
    expect(await heartbeatEarned(db)).toBe(true);
  });

  it.each(['true', ' TRUE ', '1'])("app_settings '%s' forces the heartbeat on", async (value) => {
    const { db } = makeDb({ config: ENABLED_CONFIG, rated: 0, force: value, cyclesLastHour: 0 });
    expect(await getHeartbeatEarnedState(db)).toMatchObject({ earned: true, forced: true });
  });

  it.each(['false', '0', 'yes please', ''])("app_settings '%s' does not force it", async (value) => {
    const { db } = makeDb({ config: ENABLED_CONFIG, rated: 0, force: value, cyclesLastHour: 0 });
    expect(await getHeartbeatEarnedState(db)).toMatchObject({ earned: false, forced: false });
    expect(await heartbeatEarned(db)).toBe(false);
  });

  it('fails CLOSED when the ratings query throws — and names the error', async () => {
    const { db } = makeDb({ config: ENABLED_CONFIG, rated: 5, ratedError: 'relation does not exist', cyclesLastHour: 0 });
    const s = await getHeartbeatEarnedState(db);
    expect(s.earned).toBe(false);
    expect(s.reason).toMatch(/ratings could not be read: relation does not exist/);
  });

  it('the force key still wins when the ratings query throws', async () => {
    const { db } = makeDb({ config: ENABLED_CONFIG, rated: 0, ratedError: 'boom', force: 'true', cyclesLastHour: 0 });
    expect(await getHeartbeatEarnedState(db)).toMatchObject({ earned: true, forced: true });
  });
});

// ── The tick ─────────────────────────────────────────────────────────────────

describe('scheduledTick — enabled AND earned, one idle line per episode', () => {
  it('enabled but not earned: five ticks run no cycle and log the idle reason exactly once', async () => {
    const state: FakeState = { config: ENABLED_CONFIG, rated: 0, cyclesLastHour: 0 };
    const { db } = makeDb(state);

    for (let i = 0; i < 5; i++) expect(await scheduledTick(db, null, 'heartbeat')).toBeNull();

    expect(mocks.runHeartbeatCycle).not.toHaveBeenCalled();
    expect(idleLines()).toHaveLength(1);
    expect(String(idleLines()[0][0])).toContain('rate a proposal or set orchestrator_heartbeat_force');
  });

  it('a rating ends the idle episode without a restart; a later idle episode logs once more', async () => {
    const state: FakeState = { config: ENABLED_CONFIG, rated: 0, cyclesLastHour: 0 };
    const { db } = makeDb(state);

    await scheduledTick(db, null, 'heartbeat');
    await scheduledTick(db, null, 'heartbeat');
    expect(idleLines()).toHaveLength(1);

    state.rated = 1; // someone rated a proposal
    const result = await scheduledTick(db, null, 'heartbeat');
    expect(result).toMatchObject({ action: 'none' });
    expect(mocks.runHeartbeatCycle).toHaveBeenCalledTimes(1);
    expect(mocks.runHeartbeatCycle).toHaveBeenCalledWith(db, null, 'heartbeat', false);

    state.rated = 0; // 90 days later
    await scheduledTick(db, null, 'heartbeat');
    await scheduledTick(db, null, 'heartbeat');
    expect(idleLines()).toHaveLength(2);
    expect(mocks.runHeartbeatCycle).toHaveBeenCalledTimes(1);
  });

  it('the force key runs the cycle with zero ratings', async () => {
    const { db } = makeDb({ config: ENABLED_CONFIG, rated: 0, force: 'true', cyclesLastHour: 0 });
    await scheduledTick(db, null, 'heartbeat');
    expect(mocks.runHeartbeatCycle).toHaveBeenCalledTimes(1);
    expect(idleLines()).toHaveLength(0);
  });

  it('earned but heartbeat_enabled = 0: no cycle, and no idle line (disabled is not idle)', async () => {
    const { db } = makeDb({ config: { ...ENABLED_CONFIG, heartbeat_enabled: 0 }, rated: 4, cyclesLastHour: 0 });
    expect(await scheduledTick(db, null, 'heartbeat')).toBeNull();
    expect(mocks.runHeartbeatCycle).not.toHaveBeenCalled();
    expect(idleLines()).toHaveLength(0);
  });

  it('paused or fully disabled never reaches the earned check', async () => {
    const paused = makeDb({ config: { ...ENABLED_CONFIG, orchestrator_paused: 1 }, rated: 4, cyclesLastHour: 0 });
    expect(await scheduledTick(paused.db, null, 'heartbeat')).toBeNull();
    const off = makeDb({ config: { ...ENABLED_CONFIG, fully_disabled: 1 }, rated: 4, cyclesLastHour: 0 });
    expect(await scheduledTick(off.db, null, 'heartbeat')).toBeNull();
    expect(mocks.runHeartbeatCycle).not.toHaveBeenCalled();
    expect(paused.gets.some((g) => g.sql.includes('FROM orchestrator_proposals'))).toBe(false);
  });

  it('daily and weekly briefings are gated by the same rule and force a briefing when they run', async () => {
    const idle = makeDb({ config: ENABLED_CONFIG, rated: 0, cyclesLastHour: 0 });
    expect(await scheduledTick(idle.db, null, 'daily')).toBeNull();
    expect(mocks.runHeartbeatCycle).not.toHaveBeenCalled();

    const earned = makeDb({ config: ENABLED_CONFIG, rated: 1, cyclesLastHour: 0 });
    await scheduledTick(earned.db, null, 'weekly');
    expect(mocks.runHeartbeatCycle).toHaveBeenCalledWith(earned.db, null, 'weekly', true);
  });
});

describe('initOrchestratorHeartbeat — the timer stays registered while idle or disabled', () => {
  it('registers the timer with heartbeat_enabled = 0 and says the ticks idle until enabled', async () => {
    const { db } = makeDb({ config: { ...ENABLED_CONFIG, heartbeat_enabled: 0 }, rated: 0, cyclesLastHour: 0 });
    await initOrchestratorHeartbeat(db, null);
    expect(mocks.schedule).toHaveBeenCalledTimes(1);
    expect(mocks.schedule.mock.calls[0][0]).toBe('*/30 * * * *');
    expect(log.mock.calls.map((c) => String(c[0])).join('\n')).toMatch(/heartbeat_enabled = 0 — ticks idle until enabled/);

    const tick = mocks.schedule.mock.calls[0][1] as () => Promise<void>;
    await tick();
    expect(mocks.runHeartbeatCycle).not.toHaveBeenCalled();
  });

  it('a registered tick runs the cycle once the heartbeat is enabled and earned', async () => {
    const state: FakeState = { config: { ...ENABLED_CONFIG, heartbeat_enabled: 0 }, rated: 0, cyclesLastHour: 0 };
    const { db } = makeDb(state);
    await initOrchestratorHeartbeat(db, null);
    const tick = mocks.schedule.mock.calls[0][1] as () => Promise<void>;

    state.config = ENABLED_CONFIG; // enabled in Settings, still no rating
    await tick();
    expect(mocks.runHeartbeatCycle).not.toHaveBeenCalled();
    expect(idleLines()).toHaveLength(1);

    state.rated = 1;
    await tick();
    expect(mocks.runHeartbeatCycle).toHaveBeenCalledTimes(1);
  });

  it('fully_disabled at boot registers nothing (the kill switch)', async () => {
    const { db } = makeDb({ config: { ...ENABLED_CONFIG, fully_disabled: 1 }, rated: 9, force: 'true', cyclesLastHour: 0 });
    await initOrchestratorHeartbeat(db, null);
    expect(mocks.schedule).not.toHaveBeenCalled();
  });

  it('getHeartbeatStatus tells the dashboard enabled / scheduled / earned / last cycle / cycles per hour / limits', async () => {
    const { db } = makeDb({ config: ENABLED_CONFIG, rated: 0, cyclesLastHour: 2, lastCycleAt: '2026-09-16T10:30:00.000Z' });
    const before = await getHeartbeatStatus(db);
    expect(before).toMatchObject({ enabled: true, scheduled: false, intervalMinutes: null, running: false, cyclesLastHour: 2, lastCycleAt: '2026-09-16T10:30:00.000Z', forceKey: HEARTBEAT_FORCE_KEY });
    expect(before.earned).toMatchObject({ earned: false, forced: false });
    expect(before.limits).toMatchObject({ MAX_HEARTBEATS_PER_HOUR: 6, MIN_HEARTBEAT_INTERVAL_MINUTES: 10 });
    expect(before.limits).not.toHaveProperty('MAX_CHAIN_DEPTH');

    await initOrchestratorHeartbeat(db, null);
    const after = await getHeartbeatStatus(db);
    expect(after).toMatchObject({ scheduled: true, intervalMinutes: 30, running: false });
  });
});

// ── Fresh-install defaults ───────────────────────────────────────────────────

describe('fresh-install config (no orchestrator_config row)', () => {
  it('has the heartbeat OFF and resolves its models through the provider router tiers', async () => {
    const { db } = makeDb({ config: null, rated: 0, cyclesLastHour: 0 });
    const config = await getOrchestratorConfig(db);

    expect(config.heartbeat_enabled).toBe(0);
    expect(config.heartbeat_model).toBe('sdk:claude-sonnet-5');
    expect(config.briefing_model).toBe('sdk:claude-opus-5');
    expect(config.planning_model).toBe('sdk:claude-opus-5');
    expect(mocks.resolveModel.mock.calls.map((c) => c[0]).sort()).toEqual(['large', 'large', 'medium']);

    for (const id of [config.heartbeat_model, config.briefing_model, config.planning_model]) {
      expect(id).not.toMatch(/claude-[a-z]+-4-\d/);
    }
  });

  it('the env overrides still win over the tier defaults', async () => {
    process.env.ORCHESTRATOR_HEARTBEAT_MODEL = 'ollama:qwen3';
    process.env.ORCHESTRATOR_BRIEFING_MODEL = 'mistral-large-latest';
    const config = freshInstallConfig();
    expect(config.heartbeat_model).toBe('ollama:qwen3');
    expect(config.briefing_model).toBe('mistral-large-latest');
    expect(config.planning_model).toBe('sdk:claude-opus-5');
  });

  it('the fallback in the engine source names no literal Claude model id', () => {
    const src = readFileSync(path.resolve(__dirname, '..', '..', 'server', 'services', 'orchestrator-engine.ts'), 'utf-8');
    const body = /export function freshInstallConfig\(\)[\s\S]*?\n\}/.exec(src)?.[0] ?? '';
    expect(body).not.toBe('');
    expect(body).not.toMatch(/'claude-/);
    expect(body).toMatch(/resolveModel\('medium'\)/);
    expect(body).toMatch(/resolveModel\('large'\)/);
  });
});
