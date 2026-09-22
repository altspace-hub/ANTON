/**
 * video-visibility.test.ts — GET /api/video/:id must not hand out a playback
 * URL for a video the caller is not allowed to see.
 *
 * The defect: the by-id read selected `WHERE v.id = ? AND v.state = 'ready'`
 * and nothing else, then minted a signed playback URL from the row's
 * storage_key. /video/feed in the same file already filtered
 * `visibility IN ('public','unlisted')`, so the correct predicate existed ten
 * lines up — the detail route just never applied it. Any authenticated user
 * who knew (or harvested — ids travel in playlists, links, logs) an upload id
 * got a streamable URL for a 'private' upload belonging to someone else.
 *
 * Why the fake DB below EVALUATES the SQL instead of stubbing a row: a stub
 * that always answers with the row would pass with or without the fix, and a
 * text assertion on the query string cannot tell a predicate that binds the
 * caller's id from one that binds the uploader's. So the fake parses the
 * route's own WHERE clause, binds the route's own parameters positionally, and
 * evaluates it against an in-memory video_uploads table — the same decision
 * Postgres would make. It refuses (throws) on any construct it does not
 * understand, so a future rewrite of the query fails loudly here rather than
 * silently degrading into "always returns the row".
 *
 * The suite normally runs without DATABASE_URL, so this is deliberately not a
 * live-Postgres test — it must actually execute to be worth anything.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { Server } from 'http';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import type { AuthUser } from '../../server/middleware/auth.js';

// ── A minimal SQL WHERE evaluator (=, IN, AND, OR, parentheses) ─────────────

type Row = Record<string, unknown>;

function tokenize(where: string): string[] {
  const tokens = where.match(/'[^']*'|\(|\)|,|\?|[A-Za-z_][A-Za-z0-9_.]*|=/g);
  if (!tokens) throw new Error(`video test: could not tokenize WHERE clause: ${where}`);
  return tokens;
}

/**
 * Evaluates `where` against `row`. `params` are consumed left-to-right for
 * each `?`, exactly as the Postgres adapter binds them — so a fix that adds
 * the right predicate but binds the wrong value still fails here.
 */
function evaluateWhere(where: string, row: Row, params: unknown[]): boolean {
  const tokens = tokenize(where);
  let i = 0;
  let paramIndex = 0;
  const peek = () => tokens[i];
  const next = () => tokens[i++];

  function value(): unknown {
    const t = next();
    if (t === undefined) throw new Error('video test: unexpected end of WHERE clause');
    if (t === '?') return params[paramIndex++];
    if (t.startsWith("'")) return t.slice(1, -1);
    throw new Error(`video test: unsupported value token '${t}'`);
  }

  function column(name: string): unknown {
    const bare = name.includes('.') ? name.split('.')[1] : name;
    if (!(bare in row)) throw new Error(`video test: query referenced unknown column '${name}'`);
    return row[bare];
  }

  function comparison(): boolean {
    const col = next();
    if (col === undefined) throw new Error('video test: unexpected end of WHERE clause');
    const op = next();
    if (op === '=') return column(col) === value();
    if (op?.toUpperCase() === 'IN') {
      if (next() !== '(') throw new Error('video test: expected ( after IN');
      const options: unknown[] = [];
      for (;;) {
        options.push(value());
        const sep = next();
        if (sep === ')') break;
        if (sep !== ',') throw new Error(`video test: expected , or ) in IN list, got '${sep}'`);
      }
      return options.includes(column(col));
    }
    throw new Error(`video test: unsupported operator '${op}'`);
  }

  function factor(): boolean {
    if (peek() === '(') { next(); const v = expr(); if (next() !== ')') throw new Error('video test: unbalanced ()'); return v; }
    return comparison();
  }

  function term(): boolean {
    let v = factor();
    while (peek()?.toUpperCase() === 'AND') { next(); const r = factor(); v = v && r; }
    return v;
  }

  function expr(): boolean {
    let v = term();
    while (peek()?.toUpperCase() === 'OR') { next(); const r = term(); v = v || r; }
    return v;
  }

  const result = expr();
  if (i !== tokens.length) throw new Error(`video test: trailing tokens in WHERE clause: ${tokens.slice(i).join(' ')}`);
  return result;
}

// ── Fixture rows ────────────────────────────────────────────────────────────

const ALICE: AuthUser = { id: 'alice', username: 'alice', role: 'analyst' };
const BOB: AuthUser = { id: 'bob', username: 'bob', role: 'analyst' };

function bobsVideo(id: string, visibility: string): Row {
  return {
    id,
    title: `bob-${visibility}`,
    description: null,
    visibility,
    duration_seconds: 12,
    uploader_user_id: BOB.id,
    storage_key: `u/bob/${id}.bin`,
    state: 'ready',
    created_at: '2026-09-01T00:00:00Z',
    uploader_name: 'Bob',
  };
}

const TABLE: Row[] = [
  bobsVideo('11111111-1111-1111-1111-111111111111', 'private'),
  bobsVideo('22222222-2222-2222-2222-222222222222', 'public'),
  bobsVideo('33333333-3333-3333-3333-333333333333', 'unlisted'),
  bobsVideo('44444444-4444-4444-4444-444444444444', 'friends-circle'),
];

/** Answers the route's SELECT the way Postgres would, from TABLE. */
const db: DatabaseAdapter = {
  dialect: 'postgresql',
  async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
    const whereAt = sql.search(/\bWHERE\b/);
    if (whereAt < 0 || !/FROM\s+video_uploads/.test(sql)) return undefined;
    // Placeholders before WHERE would shift the binding; there are none today,
    // but count them so this stays honest if the SELECT list grows one.
    const skip = (sql.slice(0, whereAt).match(/\?/g) ?? []).length;
    const where = sql.slice(whereAt + 'WHERE'.length);
    const match = TABLE.find((row) => evaluateWhere(where, row, params.slice(skip)));
    return match as T | undefined;
  },
  async all<T>(): Promise<T[]> { return [] as T[]; },
  async run(): Promise<RunResult> { return { changes: 0, lastInsertRowid: 0 }; },
  async exec(): Promise<void> {},
  async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(this); },
  async close(): Promise<void> {},
};

describe('GET /api/video/:id is visibility-gated', () => {
  let server: Server;
  let base = '';
  let caller: AuthUser = ALICE;

  beforeAll(async () => {
    // middleware/auth throws at import when JWT_SECRET is unset (solo dev envs).
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-video-visibility';
    const { createVideoRoutes } = await import('../../server/routes/video.js');

    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, nextFn: NextFunction) => { req.user = caller; nextFn(); });
    app.use('/api', createVideoRoutes(db));
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
    const addr = server.address();
    if (addr === null || typeof addr === 'string') throw new Error('No server address');
    base = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server?.close((err) => (err ? reject(err) : resolve())));
  });

  async function getVideo(id: string, as: AuthUser): Promise<{ status: number; body: string }> {
    caller = as;
    const r = await fetch(`${base}/api/video/${id}`);
    return { status: r.status, body: await r.text() };
  }

  it("does not leak another user's private video — no row, no playback URL", async () => {
    const res = await getVideo('11111111-1111-1111-1111-111111111111', ALICE);
    expect(res.status).toBe(404);
    // The leak was the URL, not the metadata: assert the stream capability is
    // absent from the whole body, not just that some field is missing.
    expect(res.body).not.toContain('/api/video/stream');
    expect(res.body).not.toContain('playback_url');
  });

  it('still serves the uploader their own private video (the upload → player flow)', async () => {
    const res = await getVideo('11111111-1111-1111-1111-111111111111', BOB);
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body) as { video: { playback_url: string; visibility: string } };
    expect(json.video.visibility).toBe('private');
    expect(json.video.playback_url).toContain('/api/video/stream');
  });

  it('still serves a public video to any signed-in viewer (the feed → player flow)', async () => {
    const res = await getVideo('22222222-2222-2222-2222-222222222222', ALICE);
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body) as { video: { playback_url: string } };
    expect(json.video.playback_url).toContain('/api/video/stream');
  });

  it('still serves an unlisted video to a viewer holding the link', async () => {
    const res = await getVideo('33333333-3333-3333-3333-333333333333', ALICE);
    expect(res.status).toBe(200);
  });

  it('keeps friends-circle owner-only until a friend-graph join exists', async () => {
    // friend_contacts is keyed by the peer's Ed25519 pubkey, not users.id, so
    // "is Alice a friend of Bob" is not answerable in SQL yet. Owner-only is the
    // safe reading; this test is the reminder to revisit it, not a claim that
    // owner-only is the final semantic.
    expect((await getVideo('44444444-4444-4444-4444-444444444444', ALICE)).status).toBe(404);
    expect((await getVideo('44444444-4444-4444-4444-444444444444', BOB)).status).toBe(200);
  });

  it('never returns the storage key itself', async () => {
    const res = await getVideo('22222222-2222-2222-2222-222222222222', ALICE);
    expect(res.body).not.toContain('storage_key');
  });
});
