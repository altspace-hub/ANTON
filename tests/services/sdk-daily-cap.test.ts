/**
 * sdk-daily-cap.test.ts — the per-day subscription run cap (Wave 5).
 *
 * A subscription has a plan allowance, not a bill, and nothing on the API
 * path's spend guards applies to it. The cap is a Settings value
 * (app_settings 'sdk_daily_run_cap'; null = unlimited) against an in-process
 * count of runs started today, seeded ONCE per day from the audit log so a
 * restart does not hand out a fresh allowance.
 *
 *   - both lanes refuse at the cap with the same message, on the same error
 *     path as the slot refusal (SSE error + [DONE]; runAgentic result.error),
 *     and the SDK is never invoked for a refused run;
 *   - a null cap is unlimited;
 *   - the count is seeded once from the audit log and runs since add to it;
 *   - a refused run does not count; a seed that fails counts from zero
 *     rather than refusing anyone.
 *
 * The SDK is faked at both seams; the database is a fake adapter.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import {
  streamToResponse,
  setSdkQueryImplForTests,
  setSdkAgentImplForTests,
  initSdkDailyGuard,
  setSdkDailyRunCap,
  getSdkDailyRunCap,
  sdkRunsToday,
  sdkDailyCapRefusal,
  ensureSdkDailyCounterSeeded,
  resetSdkDailyCounterForTests,
  activeSdkRunsForTests,
  SDK_DAILY_CAP_SEED_SQL,
  SDK_DAILY_RUN_CAP_SETTING_KEY,
  type AgentSdkModule,
} from '../../server/services/claude-sdk-client.js';
import { runAgentic } from '../../server/services/sdk-agentic-runner.js';
import { resetSdkEngineStoreForTests } from '../../server/services/sdk-engine-store.js';
import type { StreamSink } from '../../server/services/stream-sink.js';

// ── Fakes ───────────────────────────────────────────────────

interface FakeState { settings: Map<string, string>; auditRunsToday: number; seedQueries: number; seedThrows: boolean }
const state: FakeState = { settings: new Map(), auditRunsToday: 0, seedQueries: 0, seedThrows: false };

const db = {
  dialect: 'postgresql',
  async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
    if (sql === SDK_DAILY_CAP_SEED_SQL) {
      state.seedQueries += 1;
      if (state.seedThrows) throw new Error('relation "audit_log" does not exist');
      return { n: String(state.auditRunsToday) } as T;   // Postgres hands COUNT(*) back as a string
    }
    if (sql.includes('FROM app_settings')) {
      const value = state.settings.get(String(params[0]));
      return value === undefined ? undefined : ({ value } as T);
    }
    return undefined;
  },
  async all<T>(): Promise<T[]> { return []; },
  async run(sql: string, ...params: unknown[]): Promise<RunResult> {
    if (sql.startsWith('INSERT INTO app_settings')) state.settings.set(String(params[0]), String(params[1]));
    if (sql.startsWith('DELETE FROM app_settings')) state.settings.delete(String(params[0]));
    return { changes: 1, lastInsertRowid: 0 };
  },
  async exec() { /* noop */ },
  async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
  async close() { /* noop */ },
} as unknown as DatabaseAdapter;

function sinkWithEvents() {
  const chunks: string[] = [];
  const sink: StreamSink = { headersSent: false, writeHead: () => undefined, write: (c: string) => { chunks.push(c); }, end: () => undefined };
  const events = () => chunks.flatMap((c) => c.split('\n')).filter((l) => l.startsWith('data: ') && l !== 'data: [DONE]').map((l) => JSON.parse(l.slice(6)) as Record<string, unknown>);
  const done = () => chunks.some((c) => c.includes('data: [DONE]'));
  return { sink, events, done };
}

const textDelta = (text: string) => ({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text } } });
const success = () => ({ type: 'result', subtype: 'success', result: 'ok', num_turns: 1, usage: { input_tokens: 10, output_tokens: 2 } });

/** Text-engine seam: counts invocations. */
function fakeTextSdk() {
  let invocations = 0;
  setSdkQueryImplForTests(() => { invocations += 1; return (async function* () { yield textDelta('ok'); yield success(); })(); });
  return () => invocations;
}
/** Agentic seam: counts invocations. */
function fakeAgentSdk() {
  let invocations = 0;
  const impl: AgentSdkModule = {
    tool: (name, description, schema, handler) => ({ name, description, schema, handler }),
    createSdkMcpServer: (o) => ({ name: o.name }),
    query: (() => { invocations += 1; return (async function* () { yield { type: 'stream_event', event: { type: 'message_start' } }; yield textDelta('ok'); yield success(); })(); }) as AgentSdkModule['query'],
  };
  setSdkAgentImplForTests(impl);
  return () => invocations;
}

const CONFIG = { model: 'sdk:claude-opus-5', thinking: 'quick' as const, system: 's', messages: [{ role: 'user' as const, content: 'hi' }] };
const interactiveRun = async () => { const s = sinkWithEvents(); await streamToResponse(CONFIG, s.sink); return s; };
const backgroundRun = async () => runAgentic({ model: 'sdk:claude-opus-5', thinking: 'quick', system: 's', prompt: 'p', tools: [], background: true }, () => undefined);

const CAP_MESSAGE = (n: number) => `Daily cap of ${n} subscription runs reached — raise it in Settings → Execution engines.`;

beforeEach(() => {
  state.settings.clear();
  state.auditRunsToday = 0;
  state.seedQueries = 0;
  state.seedThrows = false;
  resetSdkEngineStoreForTests();
  process.env.SDK_ENGINE_ENABLED = 'true';
  resetSdkDailyCounterForTests();
  initSdkDailyGuard(db);
});
afterEach(() => {
  setSdkQueryImplForTests(null);
  setSdkAgentImplForTests(null);
  delete process.env.SDK_ENGINE_ENABLED;
  resetSdkEngineStoreForTests();
  resetSdkDailyCounterForTests();
});

// ── Refusals ────────────────────────────────────────────────

describe('the cap refuses both lanes', () => {
  it('interactive lane: the run past the cap gets an SSE error + [DONE] and the SDK is not invoked', async () => {
    await setSdkDailyRunCap(db, 2);
    const invocations = fakeTextSdk();
    expect((await interactiveRun()).events().some((e) => e.type === 'error')).toBe(false);
    expect((await interactiveRun()).events().some((e) => e.type === 'error')).toBe(false);
    const third = await interactiveRun();
    const err = third.events().find((e) => e.type === 'error') as { message: string } | undefined;
    expect(err?.message).toBe(CAP_MESSAGE(2));
    expect(third.done()).toBe(true);
    expect(third.events().some((e) => e.type === 'stream_start')).toBe(false);
    expect(invocations()).toBe(2);
    expect(sdkRunsToday()).toBe(2);
    expect(activeSdkRunsForTests()).toBe(0);
  });

  it('background lane: runAgentic is refused with the same message and never starts the engine', async () => {
    await setSdkDailyRunCap(db, 1);
    const invocations = fakeAgentSdk();
    const first = await backgroundRun();
    expect(first.ok).toBe(true);
    const second = await backgroundRun();
    expect(second.ok).toBe(false);
    expect(second.error).toBe(CAP_MESSAGE(1));
    expect(invocations()).toBe(1);
    expect(activeSdkRunsForTests()).toBe(0);
  });

  it('the cap is checked before the slot: an interactive run is refused for the cap even with slots free', async () => {
    await setSdkDailyRunCap(db, 1);
    fakeTextSdk();
    await interactiveRun();
    expect(sdkDailyCapRefusal()).toBe(CAP_MESSAGE(1));
    expect(activeSdkRunsForTests()).toBe(0);
  });

  it('a refused run does not count', async () => {
    await setSdkDailyRunCap(db, 1);
    fakeTextSdk();
    await interactiveRun();
    await interactiveRun();
    await interactiveRun();
    expect(sdkRunsToday()).toBe(1);
  });
});

// ── Unlimited ───────────────────────────────────────────────

describe('no cap', () => {
  it('a null cap admits every run and still counts them', async () => {
    expect(getSdkDailyRunCap()).toBeNull();
    const invocations = fakeTextSdk();
    for (let i = 0; i < 5; i++) expect((await interactiveRun()).events().some((e) => e.type === 'error')).toBe(false);
    expect(invocations()).toBe(5);
    expect(sdkRunsToday()).toBe(5);
    expect(sdkDailyCapRefusal()).toBeNull();
  });

  it('removing a cap lifts a refusal immediately', async () => {
    await setSdkDailyRunCap(db, 1);
    fakeTextSdk();
    await interactiveRun();
    expect(sdkDailyCapRefusal()).toBe(CAP_MESSAGE(1));
    await setSdkDailyRunCap(db, null);
    expect(state.settings.has(SDK_DAILY_RUN_CAP_SETTING_KEY)).toBe(false);
    expect(sdkDailyCapRefusal()).toBeNull();
    expect((await interactiveRun()).events().some((e) => e.type === 'error')).toBe(false);
  });
});

// ── Seeding ─────────────────────────────────────────────────

describe('the count is seeded once from the audit log', () => {
  it('runs already in the audit log today count against the cap; the seed query runs once', async () => {
    state.auditRunsToday = 5;
    await setSdkDailyRunCap(db, 6);
    const invocations = fakeTextSdk();
    expect((await interactiveRun()).events().some((e) => e.type === 'error')).toBe(false);   // 5 + 1 = 6
    expect(sdkRunsToday()).toBe(6);
    const refused = await interactiveRun();
    expect((refused.events().find((e) => e.type === 'error') as { message: string }).message).toBe(CAP_MESSAGE(6));
    expect(invocations()).toBe(1);
    await ensureSdkDailyCounterSeeded();
    await ensureSdkDailyCounterSeeded();
    expect(state.seedQueries).toBe(1);
  });

  it('the persisted cap is read at init, so the first run of the day already sees it', async () => {
    resetSdkDailyCounterForTests();
    state.settings.set(SDK_DAILY_RUN_CAP_SETTING_KEY, '1');
    state.auditRunsToday = 1;
    initSdkDailyGuard(db);
    const invocations = fakeTextSdk();
    const refused = await interactiveRun();
    expect((refused.events().find((e) => e.type === 'error') as { message: string }).message).toBe(CAP_MESSAGE(1));
    expect(invocations()).toBe(0);
    expect(getSdkDailyRunCap()).toBe(1);
  });

  it('a seed that fails counts from zero and refuses nobody', async () => {
    state.seedThrows = true;
    await setSdkDailyRunCap(db, 3);
    const invocations = fakeTextSdk();
    expect((await interactiveRun()).events().some((e) => e.type === 'error')).toBe(false);
    expect(invocations()).toBe(1);
    expect(sdkRunsToday()).toBe(1);
    expect(state.seedQueries).toBe(1);
  });

  it('without a database the count starts at zero and the cap still applies once set in memory', async () => {
    resetSdkDailyCounterForTests();
    fakeTextSdk();
    await interactiveRun();
    expect(sdkRunsToday()).toBe(1);
    expect(state.seedQueries).toBe(0);
  });
});
