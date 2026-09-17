/**
 * compliance-by-message.test.ts — Wave 6 track E: the compliance routes a
 * client reads after a run, and the guards the router never had.
 *
 * A real Express app, a fake adapter (no database):
 *   - GET /compliance/by-message/:messageId returns that answer's executions
 *     (findings parsed) and violations (remediation steps parsed) with a tally;
 *     a missing message and — in team mode — somebody else's session are the
 *     same 404;
 *   - GET/POST /compliance/on-completion read and write the setting; POST
 *     takes only a boolean and is admin-only in team mode;
 *   - rule writes are admin-only in team mode; solo is unchanged.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import type { DatabaseAdapter } from '../../server/db/database.js';
import { createComplianceRoutes } from '../../server/routes/compliance.js';
import { COMPLIANCE_ON_COMPLETION_SQL, COMPLIANCE_ON_COMPLETION_SETTING_KEY } from '../../server/services/compliance-on-completion.js';

interface State {
  settings: Map<string, string>;
  messages: Map<string, { id: string; session_id: string }>;
  sessions: Map<string, { id: string; user_id: string }>;
  queries: string[];
}

const state: State = { settings: new Map(), messages: new Map(), sessions: new Map(), queries: [] };

const EXECUTIONS = [
  { id: 2, rule_id: 11, rule_code: 'WORK-002', title: 'No placeholders', severity: 'medium', category: 'work', result: 'fail', findings: '[{"description":"Placeholder left in the output: TODO","entity":"text"}]', auto_remediated: 0, executed_at: '2026-09-17T10:00:01Z' },
  { id: 1, rule_id: 10, rule_code: 'WORK-001', title: 'Provenance', severity: 'medium', category: 'work', result: 'pass', findings: '[]', auto_remediated: 0, executed_at: '2026-09-17T10:00:00Z' },
  { id: 3, rule_id: 12, rule_code: 'WORK-004', title: 'Length', severity: 'low', category: 'work', result: 'error', findings: '[{"description":"bad logic"}]', auto_remediated: 0, executed_at: '2026-09-17T10:00:02Z' },
];
const VIOLATIONS = [
  { id: 7, rule_id: 11, rule_code: 'WORK-002', title: 'No placeholders', remediation_steps: '["Fill in each placeholder."]', execution_id: 2, severity: 'medium', description: 'Placeholder left in the output: TODO', affected_entity: 'msg-1', remediation_status: 'open', remediated_at: null, remediated_by: null, notes: null, created_at: '2026-09-17T10:00:01Z' },
];

const db = {
  get: async (sql: string, ...args: unknown[]) => {
    state.queries.push(sql);
    if (sql === COMPLIANCE_ON_COMPLETION_SQL.read) {
      const v = state.settings.get(String(args[0]));
      return v === undefined ? undefined : { value: v };
    }
    if (sql.startsWith('SELECT id, session_id FROM messages')) return state.messages.get(String(args[0]));
    if (sql.includes('FROM sessions WHERE id = ? AND user_id = ?')) {
      const s = state.sessions.get(String(args[0]));
      return s && s.user_id === args[1] ? { id: s.id } : undefined;
    }
    if (sql.includes('FROM sessions WHERE id = ?')) {
      const s = state.sessions.get(String(args[0]));
      return s ? { id: s.id } : undefined;
    }
    return undefined;
  },
  all: async (sql: string, ...args: unknown[]) => {
    state.queries.push(sql);
    if (sql.includes('FROM rule_executions re')) return args[0] === 'msg-1' ? EXECUTIONS : [];
    if (sql.includes('FROM rule_violations rv')) return VIOLATIONS.filter((v) => v.affected_entity === args[0]);
    return [];
  },
  run: async (sql: string, ...args: unknown[]) => {
    state.queries.push(sql);
    if (sql === COMPLIANCE_ON_COMPLETION_SQL.upsert) state.settings.set(String(args[0]), String(args[1]));
    return { changes: 1, lastInsertRowid: 1 };
  },
} as unknown as DatabaseAdapter;

let currentUser: { id: string; username: string; role: 'admin' | 'analyst' | 'viewer' } = { id: 'solo', username: 'solo', role: 'admin' };
let server: Server;
let base: string;
let savedMode: string | undefined;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api', (req, _res, next) => { req.user = currentUser; next(); });
  app.use('/api', await createComplianceRoutes(db));
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  const addr = server.address();
  if (addr === null || typeof addr === 'string') throw new Error('no address');
  base = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server?.close((err) => (err ? reject(err) : resolve())));
});

beforeEach(() => {
  savedMode = process.env.DEPLOYMENT_MODE;
  delete process.env.DEPLOYMENT_MODE;
  currentUser = { id: 'solo', username: 'solo', role: 'admin' };
  state.settings.clear();
  state.queries.length = 0;
  state.messages = new Map([['msg-1', { id: 'msg-1', session_id: 'sess-1' }]]);
  state.sessions = new Map([['sess-1', { id: 'sess-1', user_id: 'owner' }]]);
});

afterEach(() => {
  if (savedMode === undefined) delete process.env.DEPLOYMENT_MODE; else process.env.DEPLOYMENT_MODE = savedMode;
});

const json = (method: string, path: string, body?: unknown) => fetch(`${base}/api${path}`, {
  method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
});

describe('GET /compliance/by-message/:messageId', () => {
  it('returns parsed executions, violations and a tally for the answer', async () => {
    const res = await json('GET', '/compliance/by-message/msg-1');
    expect(res.status).toBe(200);
    const body = await res.json() as {
      summary: Record<string, number>;
      executions: Array<{ rule_code: string; findings: unknown }>;
      violations: Array<{ remediation_steps: unknown; affected_entity: string }>;
      sessionId: string;
    };
    expect(body.sessionId).toBe('sess-1');
    expect(body.summary).toEqual({ rules: 3, passed: 1, failed: 1, warnings: 0, errors: 1, openViolations: 1 });
    expect(body.executions[0]).toMatchObject({ rule_code: 'WORK-002', findings: [{ description: 'Placeholder left in the output: TODO', entity: 'text' }] });
    expect(body.violations[0]).toMatchObject({ affected_entity: 'msg-1', remediation_steps: ['Fill in each placeholder.'] });
    // The execution lookup keys on the messageId stored in execution_context.
    expect(state.queries.find((q) => q.includes('FROM rule_executions re'))).toMatch(/execution_context::jsonb ->> 'messageId'/);
  });

  it('404s a missing message', async () => {
    const res = await json('GET', '/compliance/by-message/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: 'Message not found' });
  });

  it('in team mode: the same 404 for somebody else\'s session; 200 for the owner and for an admin', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    currentUser = { id: 'intruder', username: 'i', role: 'analyst' };
    const denied = await json('GET', '/compliance/by-message/msg-1');
    expect(denied.status).toBe(404);
    expect(await denied.json()).toMatchObject({ error: 'Message not found' });

    currentUser = { id: 'owner', username: 'o', role: 'viewer' };
    expect((await json('GET', '/compliance/by-message/msg-1')).status).toBe(200);

    currentUser = { id: 'boss', username: 'b', role: 'admin' };
    expect((await json('GET', '/compliance/by-message/msg-1')).status).toBe(200);
  });
});

describe('GET/POST /compliance/on-completion', () => {
  it('reads ON when unset, and writes a boolean', async () => {
    expect(await (await json('GET', '/compliance/on-completion')).json()).toEqual({ success: true, enabled: true });
    const off = await json('POST', '/compliance/on-completion', { enabled: false });
    expect(off.status).toBe(200);
    expect(state.settings.get(COMPLIANCE_ON_COMPLETION_SETTING_KEY)).toBe('false');
    expect(await (await json('GET', '/compliance/on-completion')).json()).toEqual({ success: true, enabled: false });
  });

  it('rejects a non-boolean', async () => {
    const res = await json('POST', '/compliance/on-completion', { enabled: 'off' });
    expect(res.status).toBe(400);
    expect(state.settings.size).toBe(0);
  });

  it('is admin-only in team mode', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    currentUser = { id: 'v', username: 'v', role: 'viewer' };
    expect((await json('POST', '/compliance/on-completion', { enabled: false })).status).toBe(403);
    expect((await json('GET', '/compliance/on-completion')).status).toBe(200);
    expect(state.settings.size).toBe(0);
  });
});

describe('rule routes', () => {
  it('400s a non-numeric rule id', async () => {
    expect((await json('GET', '/compliance/rules/abc')).status).toBe(400);
  });

  it('team mode: a viewer cannot write rules or read the violation list; solo can', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    currentUser = { id: 'v', username: 'v', role: 'viewer' };
    expect((await json('DELETE', '/compliance/rules/1')).status).toBe(403);
    expect((await json('POST', '/compliance/rules/execute-all', {})).status).toBe(403);
    expect((await json('GET', '/compliance/violations')).status).toBe(403);

    delete process.env.DEPLOYMENT_MODE;
    expect((await json('DELETE', '/compliance/rules/1')).status).toBe(200);
  });
});
