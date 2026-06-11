/**
 * analytics-aliases.test.ts — Finding #4
 * (run-pipeline adversarial review 2026-06).
 *
 * PostgreSQL folds unquoted column aliases to lowercase, so `AS totalCost`
 * returned the property `totalcost` → the JS read `row.totalCost` was undefined
 * → /overview reported €0 and /module-usage's `AS moduleId` made
 * toLabel(undefined) throw → 500. The fix quotes the camelCase aliases
 * (`AS "totalCost"`, `AS "totalTokens"`, `AS "moduleId"`).
 *
 * Requires DATABASE_URL (env or .env); skips otherwise. No LLM is called.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { Server } from 'http';

function resolveDatabaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const env = readFileSync(join(process.cwd(), '.env'), 'utf8');
    const m = env.match(/^DATABASE_URL=(.+)$/m);
    return m ? m[1].trim() : undefined;
  } catch {
    return undefined;
  }
}

const DATABASE_URL = resolveDatabaseUrl();
const describeOrSkip = DATABASE_URL ? describe : describe.skip;

describeOrSkip('analytics camelCase alias quoting (#4)', () => {
  let db: import('../../server/db/database.js').DatabaseAdapter;
  let server: Server;
  let base: string;

  const userId = `analytics-test-${randomUUID().slice(0, 8)}`;
  const sessionId = randomUUID();
  const moduleId = 'gap-analysis';

  beforeAll(async () => {
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    const { createAnalyticsRouter } = await import('../../server/routes/analytics.js');

    db = new PostgresAdapter({ connectionString: DATABASE_URL! });

    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      req.user = { id: userId, username: 'tester', role: 'admin' };
      next();
    });
    app.use('/api/analytics', await createAnalyticsRouter(db));
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address();
    if (addr === null || typeof addr === 'string') throw new Error('No server address');
    base = `http://127.0.0.1:${addr.port}`;

    // sessions.user_id FKs users(id) — create the owner first.
    await db.run(
      `INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, 'x', 'admin')
       ON CONFLICT (id) DO NOTHING`,
      userId, userId);

    // Seed one session owned by this test user + an assistant message with a
    // known token_count + cost so totals are non-zero and assertable.
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO sessions (id, module_id, title, config, user_id, created_at, updated_at)
       VALUES (?, ?, 'Analytics alias test', '{}', ?, ?, ?)`,
      sessionId, moduleId, userId, now, now);
    await db.run(
      `INSERT INTO messages (id, session_id, role, content, token_count, cost, created_at)
       VALUES (?, ?, 'assistant', 'Output.', 1234, 0.5, ?)`,
      randomUUID(), sessionId, now);
  }, 60_000);

  afterAll(async () => {
    try {
      await db.run('DELETE FROM sessions WHERE id = ?', sessionId); // messages cascade
      await db.run('DELETE FROM users WHERE id = ?', userId);
    } finally {
      await new Promise<void>((resolve, reject) => server?.close((err) => (err ? reject(err) : resolve())));
      await db.close();
    }
  });

  it('/overview populates totalCost + totalTokens (not 0 from a lowercased alias)', async () => {
    const r = await fetch(`${base}/api/analytics/overview`);
    expect(r.status).toBe(200);
    const json = (await r.json()) as {
      totalCost: number; totalTokens: number; totalSessions: number; totalMessages: number;
    };
    // Pre-#4 totalCost/totalTokens were undefined → omitted → UI showed €0.
    expect(typeof json.totalCost).toBe('number');
    expect(typeof json.totalTokens).toBe('number');
    expect(json.totalCost).toBeCloseTo(0.5, 5);
    expect(json.totalTokens).toBe(1234);
  });

  it('/module-usage returns 200 (not 500) and labels the module', async () => {
    const r = await fetch(`${base}/api/analytics/module-usage`);
    expect(r.status).toBe(200);
    const rows = (await r.json()) as Array<{ moduleId: string | null; label: string; count: number; cost: number }>;
    expect(Array.isArray(rows)).toBe(true);
    const mine = rows.find((x) => x.moduleId === moduleId);
    expect(mine).toBeDefined();
    // toLabel humanises the id; pre-#4 moduleId was undefined → toLabel threw → 500.
    expect(mine!.label).toBe('Gap Analysis');
    expect(mine!.count).toBeGreaterThanOrEqual(1);
  });
});
