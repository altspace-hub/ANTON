/**
 * coding-compat-callers.test.ts — the Studio's expert panel and kickoff
 * workshop run on an OpenAI-compatible model (compat:<slug>:<model>, e.g.
 * OpenRouter).
 *
 * Their live model calls went through callChat WITHOUT `db`, and a compat id
 * resolves its endpoint through the database: every call threw "Database
 * adapter required to resolve a compat: model endpoint" before reaching the
 * model. Here the REAL callChat runs against a fake OpenAI-compatible server
 * started in this file, with a fake database that knows the endpoint row. No
 * database is registered at boot (setRouterDb), so the call can only succeed if
 * the caller passed its own.
 *
 * Also pinned: the workshop drops a <think> block a reasoning model leaked into
 * its reply, so the visitor never sees it and its draft state is not used.
 *
 * The planner and codegen calls are covered on the test database in
 * coding-studio-orchestrator-compat.db.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http, { type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import { runCoreTeamPanel, CORE_TEAM_ROLES } from '../../server/services/core-team-panel.js';
import {
  createCodingWorkshopEngine,
  createDefaultWorkshopState,
} from '../../server/services/coding-workshop-engine.js';
import { invalidateCustomEndpointCache } from '../../server/services/custom-endpoint-resolver.js';
import { resetCodingModelStrategyForTests } from '../../server/services/coding-model-resolver.js';

const SLUG = 'tcompatstudio';
const SESSION_ID = 'ws-compat-0001';

interface SeenRequest { model: string; system: string; lastUser: string }

const PANEL_REPLY = '```json\n' + JSON.stringify({
  gate: 'build',
  experts: CORE_TEAM_ROLES.map((r) => ({ role: r.label, verdict: 'endorse', concerns: [], required_change: null, rationale: 'fine' })),
  agreements: ['sound'], dissents: [], open_questions: [], synthesis: 'model synthesis',
}) + '\n```';
const CHAIR_REPLY = 'Chair: the panel endorses the build.';
const WORKSHOP_REPLY = '<think>Let me draft {"title":"Draft title"} first.</think>Welcome! What problem are we solving?\n'
  + '[STATE_UPDATE]:{"title":"Real title","currentPhaseProgress":10}';

function startFakeModel(): Promise<{ server: Server; baseUrl: string; seen: SeenRequest[] }> {
  const seen: SeenRequest[] = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c: Buffer) => { body += c.toString('utf8'); });
    req.on('end', () => {
      if (req.method !== 'POST' || !req.url?.endsWith('/chat/completions')) {
        res.writeHead(404).end();
        return;
      }
      const parsed = JSON.parse(body || '{}') as { model?: string; messages?: Array<{ role: string; content: unknown }> };
      const messages = parsed.messages ?? [];
      const text = (c: unknown): string => (typeof c === 'string' ? c : JSON.stringify(c));
      const system = text(messages.find((m) => m.role === 'system')?.content ?? '');
      const lastUser = text([...messages].reverse().find((m) => m.role === 'user')?.content ?? '');
      seen.push({ model: parsed.model ?? '', system, lastUser });
      const content = system.includes('CORE TEAM') ? PANEL_REPLY
        : system.includes('chair of ANTON Studio') ? CHAIR_REPLY
        : WORKSHOP_REPLY;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}/v1`, seen });
    });
  });
}

/** Knows the compat endpoint row and one workshop session; every write is a no-op. */
function fakeDb(baseUrl: string): DatabaseAdapter {
  const endpointRow = {
    slug: SLUG, display_name: 'Fake', base_url: baseUrl, api_key_encrypted: null,
    default_model: 'lead-m', context_window: null, extra_headers: {}, enabled: true,
  };
  const sessionRow = {
    id: SESSION_ID, user_id: null, coding_project_id: null, tier: 'standard', mode: 'project',
    state: JSON.stringify(createDefaultWorkshopState('standard', 'project')), status: 'active', charter: null,
  };
  const db: DatabaseAdapter = {
    dialect: 'postgresql',
    async get<T>(sql: string): Promise<T | undefined> {
      if (/FROM coding_workshop_sessions/.test(sql)) return sessionRow as T;
      return undefined;
    },
    async all<T>(sql: string): Promise<T[]> {
      if (/custom_model_endpoints/.test(sql)) return [endpointRow] as T[];
      return [] as T[];
    },
    async run(): Promise<RunResult> { return { changes: 1, lastInsertRowid: 0 }; },
    async exec(): Promise<void> {},
    async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
    async close(): Promise<void> {},
  } as DatabaseAdapter;
  return db;
}

const ENV_KEYS = ['ANTHROPIC_API_KEY', 'MISTRAL_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY', 'DEFAULT_MODEL', 'DEPLOYMENT_MODE'] as const;
const savedEnv: Record<string, string | undefined> = {};

describe('Studio panel and workshop on a compat: model', () => {
  let fake: Awaited<ReturnType<typeof startFakeModel>>;
  let db: DatabaseAdapter;

  beforeAll(async () => {
    for (const k of ENV_KEYS) { savedEnv[k] = process.env[k]; delete process.env[k]; }
    // Every coding role without an override resolves to the compat default.
    process.env.DEFAULT_MODEL = `compat:${SLUG}:lead-m`;
    resetCodingModelStrategyForTests();
    invalidateCustomEndpointCache();
    fake = await startFakeModel();
    db = fakeDb(fake.baseUrl);
  });

  afterAll(async () => {
    for (const k of ENV_KEYS) { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; }
    invalidateCustomEndpointCache();
    await new Promise<void>((resolve) => fake.server.close(() => resolve()));
  });

  it('the panel (experts + chair) reaches the model and returns a verdict', async () => {
    fake.seen.length = 0;
    const result = await runCoreTeamPanel(db, {
      projectId: 'cp-compat', gate: 'build', artifact: '# Plan\n- one task', mode: 'thorough',
      expertModelOverride: `compat:${SLUG}:expert-m`, blockConfirmationVotes: 0,
    });
    expect(result.expertModel).toBe(`compat:${SLUG}:expert-m`);
    expect(result.chairModel).toBe(`compat:${SLUG}:lead-m`);
    expect(result.verdict.experts).toHaveLength(7);
    expect(result.verdict.panel_verdict).toBe('endorse');
    expect(result.verdict.synthesis).toBe(CHAIR_REPLY);
    expect(fake.seen.map((r) => r.model)).toEqual(['expert-m', 'lead-m']);
  });

  it('the workshop turn reaches the model, and its <think> block is neither shown nor used', async () => {
    fake.seen.length = 0;
    const engine = createCodingWorkshopEngine(db);
    const out = await engine.startConversation(SESSION_ID);
    expect(fake.seen.map((r) => r.model)).toEqual(['lead-m']);
    expect(out.response).toBe('Welcome! What problem are we solving?');
    expect(out.response).not.toContain('Let me draft');
    expect(out.state.title).toBe('Real title');
  });
});
