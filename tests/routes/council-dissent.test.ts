/**
 * council-dissent.test.ts — Wave 4.2 (Core Experience Review 2026-06).
 *
 * POST /api/council/:sessionId/dissent-ledger — extraction over the
 * persisted deliberation record, ledger persisted into session config.
 * GET  /api/council/:sessionId/dissent-ledger — read the persisted ledger.
 *
 * The LLM extraction is replaced with an injected stub (deps.extract) —
 * NO live LLM call happens in this file. Requires DATABASE_URL (env or
 * .env); skips otherwise (same pattern as feedback-valves.test.ts).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { Server } from 'http';
import type { DissentExtractionResult, DissentLedger } from '../../server/services/council-dissent.js';

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

const STUB_LEDGER: DissentLedger = {
  agreements: [{ point: 'Plan is feasible', members: ['Pragmatist', 'Defender'] }],
  dissents: [{ member: "Devil's Advocate", position: 'Budget untested', severity: 'high', round: 2 }],
  openQuestions: ['Who owns rollback?'],
};

describeOrSkip('Wave 4.2 council dissent-ledger routes', () => {
  let db: import('../../server/db/database.js').DatabaseAdapter;
  let server: Server;
  let base: string;

  const councilSessionId = randomUUID();
  const emptyCouncilSessionId = randomUUID();
  const nonCouncilSessionId = randomUUID();

  // Switchable stub — set per test. Captures what the route passed in.
  let stubResult: DissentExtractionResult = { status: 'extracted', ledger: STUB_LEDGER, model: 'stub-utility-model' };
  let lastExtractInput: { topic: string; deliberation: string } | null = null;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-council-dissent';

    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    const { createCouncilRoutes } = await import('../../server/routes/council.js');

    db = new PostgresAdapter({ connectionString: DATABASE_URL! });

    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      req.user = { id: 'solo', username: 'solo', role: 'admin' };
      next();
    });
    app.use('/api', createCouncilRoutes(db, {
      extract: async (_db, input) => {
        lastExtractInput = input;
        return stubResult;
      },
    }));
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address();
    if (addr === null || typeof addr === 'string') throw new Error('No server address');
    base = `http://127.0.0.1:${addr.port}`;

    // Seed: a council session WITH a deliberation record, a council session
    // WITHOUT one, and a non-council session.
    const t = new Date().toISOString();
    await db.run(
      `INSERT INTO sessions (id, module_id, title, config, created_at, updated_at) VALUES (?, 'ai-council', ?, ?, ?, ?)`,
      councilSessionId, 'Council: Should we migrate to PG?', JSON.stringify({ topic: 'Should we migrate to PG?', rounds: 2 }), t, t);
    await db.run(
      `INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, 'user', ?, ?)`,
      randomUUID(), councilSessionId,
      '# AI Council: Should we migrate to PG?\n\n## Round 1 of 2\n\n### Devil\'s Advocate — Claude Opus 4.8\n\nI object to the budget assumptions…',
      t);
    await db.run(
      `INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, 'assistant', 'Chair synthesis text.', ?)`,
      randomUUID(), councilSessionId, t);

    await db.run(
      `INSERT INTO sessions (id, module_id, title, config, created_at, updated_at) VALUES (?, 'ai-council', 'Council: stopped early', '{}', ?, ?)`,
      emptyCouncilSessionId, t, t);

    await db.run(
      `INSERT INTO sessions (id, module_id, title, config, created_at, updated_at) VALUES (?, 'gap-analysis', 'Not a council', '{}', ?, ?)`,
      nonCouncilSessionId, t, t);
  }, 60_000);

  afterAll(async () => {
    try {
      await db.run('DELETE FROM sessions WHERE id IN (?, ?, ?)', councilSessionId, emptyCouncilSessionId, nonCouncilSessionId);
    } finally {
      await new Promise<void>((resolve, reject) => server?.close((err) => (err ? reject(err) : resolve())));
      await db.close();
    }
  });

  async function post(path: string, body: unknown = {}): Promise<{ status: number; json: Record<string, unknown> }> {
    const r = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: r.status, json: (await r.json()) as Record<string, unknown> };
  }

  it('extracts a ledger over the persisted deliberation and persists it in session config', async () => {
    stubResult = { status: 'extracted', ledger: STUB_LEDGER, model: 'stub-utility-model' };
    const { status, json } = await post(`/api/council/${councilSessionId}/dissent-ledger`, { topic: 'Should we migrate to PG?' });
    expect(status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.status).toBe('extracted');
    expect((json.ledger as DissentLedger).dissents[0].member).toBe("Devil's Advocate");
    expect(json.model).toBe('stub-utility-model');

    // The route read the persisted deliberation record server-side
    expect(lastExtractInput?.deliberation).toContain('I object to the budget assumptions');
    expect(lastExtractInput?.topic).toBe('Should we migrate to PG?');

    // Ledger persisted into config (merged — existing keys preserved)
    const row = await db.get<{ config: string }>('SELECT config FROM sessions WHERE id = ?', councilSessionId);
    const cfg = JSON.parse(String(row!.config)) as Record<string, unknown>;
    expect(cfg.topic).toBe('Should we migrate to PG?'); // pre-existing key preserved
    const persisted = cfg.dissentLedger as { ledger: DissentLedger; extractedAt: string; model: string | null };
    expect(persisted.ledger).toEqual(STUB_LEDGER);
    expect(persisted.model).toBe('stub-utility-model');
    expect(typeof persisted.extractedAt).toBe('string');
  });

  it('GET returns the persisted ledger', async () => {
    const r = await fetch(`${base}/api/council/${councilSessionId}/dissent-ledger`);
    expect(r.status).toBe(200);
    const json = (await r.json()) as { dissentLedger: { ledger: DissentLedger } | null };
    expect(json.dissentLedger?.ledger).toEqual(STUB_LEDGER);
  });

  it('extraction failure is returned honestly and persists nothing new', async () => {
    // Use the still-empty council session (after seeding a deliberation for it)
    await db.run(
      `INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, 'user', ?, ?)`,
      randomUUID(), emptyCouncilSessionId, '# AI Council: stopped early\n\n## Round 1 of 1\n\nSome deliberation content long enough.', new Date().toISOString());

    stubResult = { status: 'failed', ledger: null, error: 'utility model unreachable' };
    const { status, json } = await post(`/api/council/${emptyCouncilSessionId}/dissent-ledger`);
    expect(status).toBe(200);
    expect(json.success).toBe(false);
    expect(json.status).toBe('failed');
    expect(json.ledger).toBeNull();
    expect(String(json.error)).toContain('utility model unreachable');

    const row = await db.get<{ config: string }>('SELECT config FROM sessions WHERE id = ?', emptyCouncilSessionId);
    const cfg = JSON.parse(String(row!.config)) as Record<string, unknown>;
    expect(cfg.dissentLedger).toBeUndefined(); // nothing faked, nothing persisted
  });

  it('400s on a non-council session', async () => {
    const { status, json } = await post(`/api/council/${nonCouncilSessionId}/dissent-ledger`);
    expect(status).toBe(400);
    expect(String(json.error)).toMatch(/not an ai council session/i);
  });

  it('404s on an unknown session', async () => {
    const { status } = await post(`/api/council/${randomUUID()}/dissent-ledger`);
    expect(status).toBe(404);
  });

  it('404s when no deliberation record was persisted', async () => {
    const bare = randomUUID();
    await db.run(
      `INSERT INTO sessions (id, module_id, title, config) VALUES (?, 'ai-council', 'Council: bare', '{}')`, bare);
    try {
      const { status, json } = await post(`/api/council/${bare}/dissent-ledger`);
      expect(status).toBe(404);
      expect(String(json.error)).toMatch(/no deliberation record/i);
    } finally {
      await db.run('DELETE FROM sessions WHERE id = ?', bare);
    }
  });
});
