/**
 * embedding-pin.test.ts — the embedding provider is pinned (Wave 6, track I).
 *
 * Switching EMBEDDING_PROVIDER used to invalidate every stored vector without a
 * word: nothing recorded which provider produced the rows, and a search scored
 * them against a query vector from another space. Against an in-memory fake
 * database (no live DB) and the real SQLite vector store:
 *
 *   - the pin (app_settings embedding_provider / _model / _dimension) is
 *     written once, by the first stored embedding — never by a search;
 *   - a provider change is warned about once, not on every search;
 *   - rows from another model or dimension are excluded from vector scoring
 *     and still reach the caller through the keyword path; the negative
 *     control shows the store WOULD score them without the model filter;
 *   - POST /reembed-mismatched counts only on a dry run (the default), and a
 *     real run re-embeds, deletes the old rows and moves the pin.
 */
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import type { EmbeddingAdapter } from '../../server/services/embedding-adapter.js';

const adapterRef = vi.hoisted(() => ({ current: null as EmbeddingAdapter | null }));

vi.mock('../../server/services/embedding-adapter.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/services/embedding-adapter.js')>();
  return {
    ...actual,
    getEmbeddingAdapter: () => {
      if (!adapterRef.current) throw new Error('test adapter not set');
      return adapterRef.current;
    },
  };
});

import {
  ensureEmbeddingPin,
  checkEmbeddingPin,
  resetEmbeddingPinForTests,
  EMBEDDING_PIN_KEYS,
} from '../../server/services/embedding-pin.js';
import { hybridSearch, embedAndStore, INSTANCE_WIDE_SEARCH } from '../../server/services/hybrid-search.js';
import { getVectorStore, resetVectorStore } from '../../server/services/vector-store-adapter.js';
import { createEmbeddingRoutes } from '../../server/routes/embeddings.js';

// ── Fake database ──────────────────────────────────────────────────────────

interface EmbeddingRow {
  id: string; content_type: string; content_id: string; content_text: string;
  embedding: string; embedding_model: string; embedding_dimension: number; metadata: string;
}
interface AtomRow { id: string; content: string; category: string; atom_type: string; tags: string }

interface FakeDb {
  db: DatabaseAdapter;
  settings: Map<string, string>;
  embeddings: EmbeddingRow[];
  atoms: AtomRow[];
  writes: string[];
  selects: Array<{ sql: string; params: unknown[] }>;
}

function makeFakeDb(): FakeDb {
  const state: FakeDb = {
    db: null as unknown as DatabaseAdapter,
    settings: new Map(),
    embeddings: [],
    atoms: [],
    writes: [],
    selects: [],
  };
  const flat = (sql: string) => sql.replace(/\s+/g, ' ').trim();

  const db = {
    dialect: 'postgresql',
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      const s = flat(sql);
      if (s.startsWith('SELECT COUNT(*) AS c FROM embeddings WHERE embedding_model <> ? OR embedding_dimension <> ?')) {
        const [model, dim] = params as [string, number];
        const c = state.embeddings.filter((r) => r.embedding_model !== model || r.embedding_dimension !== dim).length;
        return { c } as T;
      }
      throw new Error(`fake db: unexpected get(): ${s.slice(0, 100)}`);
    },
    async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
      const s = flat(sql);
      state.selects.push({ sql: s, params });
      if (s.startsWith('SELECT key, value FROM app_settings WHERE key IN')) {
        return (params as string[])
          .filter((k) => state.settings.has(k))
          .map((k) => ({ key: k, value: state.settings.get(k) as string })) as T[];
      }
      if (s.startsWith('SELECT * FROM embeddings WHERE 1=1')) {
        const args = [...params];
        let types: string[] | null = null;
        const inMatch = /content_type IN \(([?,\s]+)\)/.exec(s);
        if (inMatch) types = args.splice(0, inMatch[1].split(',').length) as string[];
        const model = /embedding_model = \?/.test(s) ? (args.shift() as string) : null;
        return state.embeddings.filter((r) =>
          (!types || types.includes(r.content_type)) && (model === null || r.embedding_model === model)) as T[];
      }
      if (s.startsWith('SELECT embedding_model, embedding_dimension, COUNT(*) AS count FROM embeddings GROUP BY')) {
        const groups = new Map<string, { embedding_model: string; embedding_dimension: number; count: number }>();
        for (const r of state.embeddings) {
          const key = `${r.embedding_model}|${r.embedding_dimension}`;
          const g = groups.get(key) ?? { embedding_model: r.embedding_model, embedding_dimension: r.embedding_dimension, count: 0 };
          g.count++;
          groups.set(key, g);
        }
        return [...groups.values()].sort((a, b) => b.count - a.count) as T[];
      }
      if (s.startsWith('SELECT id, content_type, content_id, content_text, embedding_model, metadata FROM embeddings WHERE embedding_model <> ? OR embedding_dimension <> ?')) {
        const [model, dim, limit] = params as [string, number, number];
        return state.embeddings
          .filter((r) => r.embedding_model !== model || r.embedding_dimension !== dim)
          .sort((a, b) => a.id.localeCompare(b.id))
          .slice(0, limit) as T[];
      }
      if (s.includes('FROM knowledge_atoms ka')) {
        const words = String(params[0]).toLowerCase().split(/\s*\|\s*/);
        return state.atoms.filter((a) => words.some((w) => a.content.toLowerCase().includes(w))) as T[];
      }
      if (s.includes('FROM messages m')) return [];
      throw new Error(`fake db: unexpected all(): ${s.slice(0, 100)}`);
    },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      const s = flat(sql);
      state.writes.push(s);
      if (s.startsWith('INSERT INTO app_settings')) {
        const [key, value] = params as [string, string];
        state.settings.set(key, value);
        return { changes: 1, lastInsertRowid: 0 };
      }
      if (s.startsWith('INSERT INTO embeddings')) {
        const [id, content_type, content_id, content_text, embedding, embedding_model, embedding_dimension, metadata] =
          params as [string, string, string, string, string, string, number, string];
        const existing = state.embeddings.find((r) =>
          r.content_type === content_type && r.content_id === content_id && r.embedding_model === embedding_model);
        if (existing) Object.assign(existing, { content_text, embedding });
        else state.embeddings.push({ id, content_type, content_id, content_text, embedding, embedding_model, embedding_dimension, metadata });
        return { changes: 1, lastInsertRowid: 0 };
      }
      if (s.startsWith('DELETE FROM embeddings WHERE id = ? AND embedding_model <> ?')) {
        const [id, model] = params as [string, string];
        const before = state.embeddings.length;
        state.embeddings = state.embeddings.filter((r) => !(r.id === id && r.embedding_model !== model));
        return { changes: before - state.embeddings.length, lastInsertRowid: 0 };
      }
      throw new Error(`fake db: unexpected run(): ${s.slice(0, 100)}`);
    },
    async exec() { /* noop */ },
    async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db as unknown as DatabaseAdapter); },
    async close() { /* noop */ },
  };
  state.db = db as unknown as DatabaseAdapter;
  return state;
}

function makeAdapter(provider: 'openai' | 'ollama' | 'voyage', model: string, dimensions: number, vectorFor: (t: string) => number[]): EmbeddingAdapter & { batches: string[][] } {
  const batches: string[][] = [];
  return {
    provider, model, dimensions, batches,
    async embed(text: string) { return vectorFor(text); },
    async embedBatch(texts: string[]) { batches.push(texts); return texts.map(vectorFor); },
  };
}

function row(id: string, contentId: string, model: string, vector: number[], text = `text of ${contentId}`): EmbeddingRow {
  return {
    id, content_type: 'knowledge_atom', content_id: contentId, content_text: text,
    embedding: JSON.stringify(vector), embedding_model: model, embedding_dimension: vector.length, metadata: '{}',
  };
}

const QUERY_VEC = [1, 0, 0, 0];
const ACTIVE = { provider: 'ollama' as const, model: 'nomic-embed-text', dimensions: 4 };

let warnSpy: ReturnType<typeof vi.spyOn>;
let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetEmbeddingPinForTests();
  resetVectorStore();
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => {
  warnSpy.mockRestore();
  logSpy.mockRestore();
});

const pinWarnings = () => warnSpy.mock.calls.filter((c) => String(c[0]).startsWith('[embedding-pin] Embedding provider changed'));

describe('the pin', () => {
  it('is written by the first stored embedding, once', async () => {
    const f = makeFakeDb();
    const adapter = makeAdapter(ACTIVE.provider, ACTIVE.model, ACTIVE.dimensions, () => [0.5, 0.5, 0, 0]);
    adapterRef.current = adapter;

    await embedAndStore(f.db, { contentType: 'knowledge_atom', contentId: 'a1', contentText: 'first atom' });
    expect(f.settings.get(EMBEDDING_PIN_KEYS.provider)).toBe('ollama');
    expect(f.settings.get(EMBEDDING_PIN_KEYS.model)).toBe('nomic-embed-text');
    expect(f.settings.get(EMBEDDING_PIN_KEYS.dimension)).toBe('4');
    const pinWrites = () => f.writes.filter((w) => w.startsWith('INSERT INTO app_settings')).length;
    expect(pinWrites()).toBe(3);

    await embedAndStore(f.db, { contentType: 'knowledge_atom', contentId: 'a2', contentText: 'second atom' });
    const again = await ensureEmbeddingPin(f.db, adapter);
    expect(again.pinnedNow).toBe(false);
    expect(again.mismatch).toBe(false);
    expect(pinWrites()).toBe(3);
  });

  it('is never written by a search (a read-only check on a fresh instance)', async () => {
    const f = makeFakeDb();
    const adapter = makeAdapter(ACTIVE.provider, ACTIVE.model, ACTIVE.dimensions, () => QUERY_VEC);
    const status = await checkEmbeddingPin(f.db, adapter);
    expect(status.pinned).toBeNull();
    expect(status.mismatch).toBe(false);
    expect(f.writes).toEqual([]);
  });

  it('warns once when the environment has moved to another provider', async () => {
    const f = makeFakeDb();
    f.settings.set(EMBEDDING_PIN_KEYS.provider, 'openai');
    f.settings.set(EMBEDDING_PIN_KEYS.model, 'text-embedding-3-small');
    f.settings.set(EMBEDDING_PIN_KEYS.dimension, '1536');
    const adapter = makeAdapter(ACTIVE.provider, ACTIVE.model, ACTIVE.dimensions, () => QUERY_VEC);

    const first = await checkEmbeddingPin(f.db, adapter);
    await checkEmbeddingPin(f.db, adapter);
    await ensureEmbeddingPin(f.db, adapter);

    expect(first.mismatch).toBe(true);
    expect(first.pinned).toEqual({ provider: 'openai', model: 'text-embedding-3-small', dimension: 1536 });
    expect(first.active).toEqual({ provider: 'ollama', model: 'nomic-embed-text', dimension: 4 });
    expect(pinWarnings()).toHaveLength(1);
    expect(String(pinWarnings()[0][0])).toMatch(/reembed-mismatched/);
    // A mismatch never overwrites the pin — only a completed re-embed does.
    expect(f.settings.get(EMBEDDING_PIN_KEYS.model)).toBe('text-embedding-3-small');
  });
});

describe('hybridSearch scores only rows the active adapter produced', () => {
  function seeded(): FakeDb {
    const f = makeFakeDb();
    f.embeddings.push(
      row('e-active', 'atom-active', 'nomic-embed-text', [0.9, 0.1, 0, 0], 'active provider atom about sanctions'),
      // Another provider, another dimension.
      row('e-openai', 'atom-openai', 'text-embedding-3-small', [1, 0, 0, 0, 0, 0], 'openai atom about sanctions screening'),
      // Another model with the SAME dimension and a vector identical to the query:
      // cosine would be 1.0, and it is still a different vector space.
      row('e-minilm', 'atom-minilm', 'all-minilm-4d', [1, 0, 0, 0], 'minilm atom about sanctions lists'),
    );
    f.atoms.push({ id: 'atom-openai', content: 'openai atom about sanctions screening', category: 'observation', atom_type: 'insight', tags: '[]' });
    f.settings.set(EMBEDDING_PIN_KEYS.provider, 'ollama');
    f.settings.set(EMBEDDING_PIN_KEYS.model, 'nomic-embed-text');
    f.settings.set(EMBEDDING_PIN_KEYS.dimension, '4');
    adapterRef.current = makeAdapter(ACTIVE.provider, ACTIVE.model, ACTIVE.dimensions, () => QUERY_VEC);
    return f;
  }

  it('excludes other-model and other-dimension rows from vector scoring; keyword still finds them', async () => {
    const f = seeded();
    const results = await hybridSearch(f.db, {
      query: 'sanctions', contentTypes: ['knowledge_atom'], topK: 10, minSimilarity: 0.1, scope: INSTANCE_WIDE_SEARCH,
    });
    const vectorIds = results.filter((r) => r.source !== 'bm25').map((r) => r.content_id);
    expect(vectorIds).toEqual(['atom-active']);
    expect(results.find((r) => r.content_id === 'atom-minilm')).toBeUndefined();
    const legacy = results.find((r) => r.content_id === 'atom-openai');
    expect(legacy?.source).toBe('bm25');

    const vectorSelect = f.selects.find((q) => q.sql.startsWith('SELECT * FROM embeddings'));
    expect(vectorSelect?.sql).toMatch(/embedding_model = \?/);
    expect(vectorSelect?.params).toContain('nomic-embed-text');
  });

  it('negative control: without the model filter the store WOULD score the same-dimension legacy row', async () => {
    const f = seeded();
    const hits = await getVectorStore(f.db).search({ queryVector: QUERY_VEC, contentTypes: ['knowledge_atom'], minSimilarity: 0.1 });
    expect(hits.map((h) => h.content_id)).toContain('atom-minilm');
  });

  it('skips the vector leg entirely when the query embedding failed (zero vector)', async () => {
    const f = seeded();
    adapterRef.current = makeAdapter(ACTIVE.provider, ACTIVE.model, ACTIVE.dimensions, () => [0, 0, 0, 0]);
    const results = await hybridSearch(f.db, {
      query: 'sanctions', contentTypes: ['knowledge_atom'], topK: 10, scope: INSTANCE_WIDE_SEARCH,
    });
    expect(f.selects.some((q) => q.sql.startsWith('SELECT * FROM embeddings'))).toBe(false);
    expect(results.every((r) => r.source === 'bm25')).toBe(true);
  });
});

describe('GET /provider and POST /reembed-mismatched', () => {
  let server: Server;
  let base: string;
  let f: FakeDb;
  let adapter: ReturnType<typeof makeAdapter>;

  beforeAll(async () => {
    f = makeFakeDb();
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as unknown as { user: { id: string; role: string } }).user = { id: 'admin-1', role: 'admin' };
      next();
    });
    app.use('/api/embeddings', await createEmbeddingRoutes(f.db));
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no server address');
    base = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  });

  beforeEach(() => {
    f.embeddings = [
      row('e1', 'atom-1', 'nomic-embed-text', [0.9, 0.1, 0, 0]),
      row('e2', 'atom-2', 'text-embedding-3-small', [1, 0, 0, 0, 0, 0]),
      row('e3', 'atom-3', 'text-embedding-3-small', [0, 1, 0, 0, 0, 0]),
    ];
    f.settings.clear();
    f.settings.set(EMBEDDING_PIN_KEYS.provider, 'openai');
    f.settings.set(EMBEDDING_PIN_KEYS.model, 'text-embedding-3-small');
    f.settings.set(EMBEDDING_PIN_KEYS.dimension, '1536');
    f.writes = [];
    adapter = makeAdapter(ACTIVE.provider, ACTIVE.model, ACTIVE.dimensions, (t) => [t.length, 1, 0, 0]);
    adapterRef.current = adapter;
  });

  it('GET /provider reports active vs pinned and the rows per model/dimension', async () => {
    const res = await fetch(`${base}/api/embeddings/provider`);
    expect(res.status).toBe(200);
    const body = await res.json() as {
      active: { model: string; dimension: number }; pinned: { model: string } | null; mismatch: boolean;
      rows: Array<{ embedding_model: string; embedding_dimension: number; count: number }>;
      totalRows: number; mismatchedRows: number;
    };
    expect(body.active).toMatchObject({ model: 'nomic-embed-text', dimension: 4 });
    expect(body.pinned).toMatchObject({ model: 'text-embedding-3-small' });
    expect(body.mismatch).toBe(true);
    expect(body.rows).toEqual([
      { embedding_model: 'text-embedding-3-small', embedding_dimension: 6, count: 2 },
      { embedding_model: 'nomic-embed-text', embedding_dimension: 4, count: 1 },
    ]);
    expect(body.totalRows).toBe(3);
    expect(body.mismatchedRows).toBe(2);
  });

  it('POST /reembed-mismatched is a dry run by default: counts, embeds nothing, writes nothing', async () => {
    const res = await fetch(`${base}/api/embeddings/reembed-mismatched`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { dryRun: boolean; mismatchedRows: number; wouldReembed: number; limit: number };
    expect(body.dryRun).toBe(true);
    expect(body.mismatchedRows).toBe(2);
    expect(body.wouldReembed).toBe(2);
    expect(adapter.batches).toEqual([]);
    expect(f.writes).toEqual([]);
    expect(f.embeddings).toHaveLength(3);
  });

  it('a dry run honours the per-call cap', async () => {
    const res = await fetch(`${base}/api/embeddings/reembed-mismatched`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ limit: 1 }),
    });
    const body = await res.json() as { wouldReembed: number; limit: number };
    expect(body.limit).toBe(1);
    expect(body.wouldReembed).toBe(1);
  });

  it('dryRun:false re-embeds the mismatched rows under the active model, deletes the old ones and moves the pin', async () => {
    const res = await fetch(`${base}/api/embeddings/reembed-mismatched`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dryRun: false }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { dryRun: boolean; reembedded: number; failed: number; remaining: number; repinned: boolean };
    expect(body).toMatchObject({ dryRun: false, reembedded: 2, failed: 0, remaining: 0, repinned: true });
    expect(adapter.batches).toHaveLength(1);
    expect(f.embeddings.map((r) => r.embedding_model).sort()).toEqual(['nomic-embed-text', 'nomic-embed-text', 'nomic-embed-text']);
    expect(f.embeddings.map((r) => r.content_id).sort()).toEqual(['atom-1', 'atom-2', 'atom-3']);
    expect(f.settings.get(EMBEDDING_PIN_KEYS.model)).toBe('nomic-embed-text');
    expect(f.settings.get(EMBEDDING_PIN_KEYS.dimension)).toBe('4');
  });
});
