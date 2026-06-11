/**
 * distill.test.ts — Wave 4.8 (Core Experience Review 2026-06).
 *
 * POST /api/distill/module-prompt — save-chat-as-module v2 endpoint.
 * The utility-model distillation is replaced with an injected stub
 * (deps.distill) — NO live LLM call happens in this file. Requires
 * DATABASE_URL only to construct the adapter the route factory expects;
 * skips otherwise (same pattern as the other route tests).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { Server } from 'http';
import type { ChatTurn, DistillationResult } from '../../server/services/chat-distiller.js';

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

describeOrSkip('Wave 4.8 distill route', () => {
  let db: import('../../server/db/database.js').DatabaseAdapter;
  let server: Server;
  let base: string;

  let stubResult: DistillationResult = {
    status: 'distilled',
    distilled: {
      systemPrompt: '## Contract Risk Reviewer\n\nYou review contracts for hidden risks…',
      suggestedName: 'Contract Risk Review',
      suggestedDescription: 'Reviews contracts for hidden risk clauses.',
      workedExample: { user: 'Review this clause…', assistant: 'This clause shifts liability…' },
    },
    model: 'stub-utility-model',
  };
  let lastConversation: ChatTurn[] | null = null;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-distill';

    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    const { createDistillRoutes } = await import('../../server/routes/distill.js');

    db = new PostgresAdapter({ connectionString: DATABASE_URL! });

    const app = express();
    app.use(express.json({ limit: '10mb' }));
    app.use((req: Request, _res: Response, next: NextFunction) => {
      req.user = { id: 'solo', username: 'solo', role: 'admin' };
      next();
    });
    app.use('/api', createDistillRoutes(db, {
      distill: async (_db, conversation) => {
        lastConversation = conversation;
        return stubResult;
      },
    }));
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address();
    if (addr === null || typeof addr === 'string') throw new Error('No server address');
    base = `http://127.0.0.1:${addr.port}`;
  }, 60_000);

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server?.close((err) => (err ? reject(err) : resolve())));
    await db.close();
  });

  async function post(body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
    const r = await fetch(`${base}/api/distill/module-prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: r.status, json: (await r.json()) as Record<string, unknown> };
  }

  it('distills a conversation into prompt + name + description + worked example', async () => {
    const messages = [
      { role: 'user', content: 'Review this NDA for hidden risks.' },
      { role: 'assistant', content: 'Three clauses stand out…' },
    ];
    const { status, json } = await post({ messages });
    expect(status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.status).toBe('distilled');
    expect(String(json.systemPrompt)).toContain('Contract Risk Reviewer');
    expect(json.suggestedName).toBe('Contract Risk Review');
    expect((json.workedExample as { user: string }).user).toContain('Review this clause');
    expect(json.model).toBe('stub-utility-model');
    expect(lastConversation).toHaveLength(2);
    expect(lastConversation![0].role).toBe('user');
  });

  it('returns failure honestly — never a fabricated prompt', async () => {
    stubResult = { status: 'failed', distilled: null, error: 'utility model unreachable' };
    const { status, json } = await post({
      messages: [
        { role: 'user', content: 'Q' },
        { role: 'assistant', content: 'A' },
      ],
    });
    expect(status).toBe(200);
    expect(json.success).toBe(false);
    expect(json.status).toBe('failed');
    expect(json.systemPrompt).toBeUndefined();
    expect(String(json.error)).toContain('utility model unreachable');
    // restore for any later test
    stubResult = { status: 'distilled', distilled: { systemPrompt: 'x'.repeat(100), suggestedName: 'n', suggestedDescription: 'd', workedExample: null }, model: 'stub' };
  });

  it('400s on validation failures', async () => {
    // fewer than 2 messages
    expect((await post({ messages: [{ role: 'user', content: 'only one' }] })).status).toBe(400);
    // bad role
    expect((await post({ messages: [{ role: 'system', content: 'a' }, { role: 'user', content: 'b' }] })).status).toBe(400);
    // empty content
    expect((await post({ messages: [{ role: 'user', content: '' }, { role: 'assistant', content: 'b' }] })).status).toBe(400);
    // missing messages
    expect((await post({})).status).toBe(400);
    // unknown extra key (.strict() schema)
    expect((await post({ messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }], extra: 1 })).status).toBe(400);
  });
});
