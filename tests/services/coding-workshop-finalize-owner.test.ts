/**
 * coding-workshop-finalize-owner.test.ts — the workshop's last mile.
 *
 * finalize() seeds a parent `projects` row for the Studio project it creates. It did
 * so WITHOUT a user_id, and `projects.user_id` is `NOT NULL DEFAULT 'default'` — so
 * every workshop project was stamped with the literal string 'default'.
 *
 * That is not cosmetic. Every downstream Studio router (coding-studio.ts,
 * core-team.ts, coding-git.ts, coding-preview.ts) resolves the owner as
 * `projects.user_id` and 404s any value that is truthy and not the caller. 'default'
 * is truthy. So on a DEPLOYMENT_MODE=team install, a non-admin who completed the
 * whole kickoff was 404'd out of the project the UI had just navigated them to.
 * Solo escaped only because the solo user is an admin and skips the check.
 *
 * The test asserts on the SQL and params of the INSERT, because the bug is invisible
 * end-to-end in solo mode — exactly the configuration the existing suites run in.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createCodingWorkshopEngine } from '../../server/services/coding-workshop-engine.js';
import { resetCodingModelStrategyForTests } from '../../server/services/coding-model-resolver.js';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';

const ENV_KEYS = ['ANTHROPIC_API_KEY', 'MISTRAL_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY', 'DEFAULT_MODEL'] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {}; for (const k of ENV_KEYS) saved[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
  process.env.MISTRAL_API_KEY = 'test-key';
  resetCodingModelStrategyForTests();
});
afterEach(() => {
  for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  resetCodingModelStrategyForTests();
});

interface Recorded { sql: string; params: unknown[] }

/** In-memory `coding_workshop_sessions` that records every write verbatim. */
function recordingStore(): { db: DatabaseAdapter; writes: Recorded[] } {
  const rows = new Map<string, Record<string, unknown>>();
  const writes: Recorded[] = [];
  const db = {
    dialect: 'postgres',
    async get<T>(sql: string, ...p: unknown[]): Promise<T | undefined> {
      if (/FROM coding_workshop_sessions WHERE id = \?/.test(sql)) return rows.get(p[0] as string) as T | undefined;
      if (/FROM coding_projects WHERE id = \?/.test(sql)) return undefined;   // never pre-seeded
      return undefined;
    },
    async all<T>(): Promise<T[]> { return [] as T[]; },
    async run(sql: string, ...p: unknown[]): Promise<RunResult> {
      writes.push({ sql, params: p });
      if (/INSERT INTO coding_workshop_sessions/.test(sql)) {
        const [id, user_id, tier, mode, state] = p as string[];
        rows.set(id, { id, user_id, tier, mode, state, status: 'active', coding_project_id: null, charter: null });
      } else if (/UPDATE coding_workshop_sessions\s+SET state = \?/.test(sql)) {
        const [state, id] = p as string[];
        const row = rows.get(id); if (row) row.state = state;
      }
      return { changes: 1, lastInsertRowid: 0 } as RunResult;
    },
    async exec() { /* noop */ },
    async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db as unknown as DatabaseAdapter); },
    async close() { /* noop */ },
  };
  return { db: db as unknown as DatabaseAdapter, writes };
}

/** Drive a session far enough to have a problem statement, then finalize as `caller`. */
async function seedAndFinalize(sessionOwner: string | null, caller: string | null) {
  const { db, writes } = recordingStore();
  const engine = createCodingWorkshopEngine(db, {
    callOrchestrator: async () =>
      'Charter locked.\n[STATE_UPDATE]:{"title":"Owner Test","problemStatement":"prove the owner is stamped","scope":"minimal"}',
    suggestFrameworks: async () => [],
  });
  const session = await engine.createSession('standard', 'project', sessionOwner);
  await engine.processUserResponse(session.id, 'lock it in');
  await engine.finalize(session.id, caller);
  const insert = writes.find((w) => /INSERT INTO projects/.test(w.sql));
  if (!insert) throw new Error('finalize did not insert a parent projects row');
  return insert;
}

describe('finalize stamps an owner on the seeded parent project', () => {
  it('writes user_id into the projects INSERT — not the schema default', async () => {
    const insert = await seedAndFinalize('user-alice', 'user-alice');

    // The column has to be in the statement at all; without it PostgreSQL silently
    // applies DEFAULT 'default' and the row belongs to nobody.
    expect(insert.sql).toMatch(/INSERT INTO projects[^)]*\buser_id\b/);
    expect(insert.params).toContain('user-alice');
    expect(insert.params).not.toContain('default');
  });

  it('prefers the CALLER over the session creator (finalize can be a later request)', async () => {
    const insert = await seedAndFinalize('user-alice', 'user-bob');
    expect(insert.params).toContain('user-bob');
    expect(insert.params).not.toContain('user-alice');
  });

  it('falls back to the session owner when the caller is anonymous', async () => {
    const insert = await seedAndFinalize('user-alice', null);
    expect(insert.params).toContain('user-alice');
  });

  it('falls back to the column default only when nobody at all is known', async () => {
    // An engine call with no identity anywhere (direct service use, no request):
    // keep the table's own semantics rather than inventing an owner or crashing on
    // the NOT NULL.
    const insert = await seedAndFinalize(null, null);
    expect(insert.params).toContain('default');
  });
});
