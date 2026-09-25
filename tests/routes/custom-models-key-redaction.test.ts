/**
 * custom-models-key-redaction.test.ts — GET /api/settings/custom-models handed
 * a custom model slot's own API key, in plaintext, to any signed-in user
 * (public-demo readiness, 2026-09-25). The model picker reads that route for
 * every user, so the key went to every browser.
 *
 * Now the key never leaves the server: GET sends STORED_KEY_PLACEHOLDER in its
 * place (plus hasApiKeyOverride), and a save that sends the placeholder back
 * keeps the stored key. The Settings form round-trips the slot unchanged, so
 * an admin editing another field of a slot does not lose its key.
 *
 * Negative controls: an edit of another field keeps the stored key (the form
 * sends back what GET gave it); a new key typed into the form replaces the
 * stored one; a save without a key (the form's "use the provider key") clears
 * it, as before.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import { createSettingsRoutes, STORED_KEY_PLACEHOLDER } from '../../server/routes/settings.js';

const settings = new Map<string, string>();
const db = {
  dialect: 'postgresql',
  async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
    if (sql.includes('FROM app_settings')) {
      // By parameter, or by a literal key in the statement.
      const key = params.length > 0 ? String(params[0]) : /key = '([^']+)'/.exec(sql)?.[1] ?? '';
      const value = settings.get(key);
      return value === undefined ? undefined : ({ value } as T);
    }
    return undefined;
  },
  async all<T>(): Promise<T[]> { return []; },
  async run(sql: string, ...params: unknown[]): Promise<RunResult> {
    if (sql.startsWith('INSERT INTO app_settings')) settings.set(String(params[0]), String(params[1]));
    if (sql.startsWith('DELETE FROM app_settings')) settings.delete(String(params[0]));
    return { changes: 1, lastInsertRowid: 0 };
  },
  async exec() { /* noop */ },
  async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
  async close() { /* noop */ },
} as unknown as DatabaseAdapter;

const SECRET = 'sk-slot-secret-123456';
const SLOT = {
  enabled: true, displayName: 'My GPT', modelId: 'gpt-4o-mini', provider: 'openai',
  contextWindow: 128000, maxOutputTokens: 8192, inputCostPer1M: 0, outputCostPer1M: 0,
  costTier: 1, supportsThinking: false, supportsJsonMode: true,
};

const saved = { mode: process.env.DEPLOYMENT_MODE, k1: process.env.CUSTOM_MODEL_1_API_KEY };
let server: Server;
let base = '';
let current = { id: 'root', username: 'root', role: 'admin' };

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as unknown as { user: typeof current }).user = current; next(); });
  app.use('/api', await createSettingsRoutes(db));
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  const addr = server.address();
  if (addr === null || typeof addr === 'string') throw new Error('no address');
  base = `http://127.0.0.1:${addr.port}/api`;
});

afterAll(async () => {
  if (saved.mode === undefined) delete process.env.DEPLOYMENT_MODE; else process.env.DEPLOYMENT_MODE = saved.mode;
  if (saved.k1 === undefined) delete process.env.CUSTOM_MODEL_1_API_KEY; else process.env.CUSTOM_MODEL_1_API_KEY = saved.k1;
  await new Promise<void>((resolve) => { server?.close(() => resolve()); });
});

afterEach(() => { settings.clear(); current = { id: 'root', username: 'root', role: 'admin' }; });

const stored = (slot: 1 | 2) => JSON.parse(settings.get(`custom_model_slot_${slot}`) ?? 'null') as Record<string, unknown> | null;

async function getSlots(): Promise<{ status: number; text: string; json: { slot1: Record<string, unknown> | null; slot2: Record<string, unknown> | null } }> {
  const r = await fetch(`${base}/settings/custom-models`);
  const text = await r.text();
  return { status: r.status, text, json: JSON.parse(text) };
}

async function save(slot: 1 | 2, config: Record<string, unknown> | null): Promise<number> {
  const r = await fetch(`${base}/settings/custom-models`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slot, config }),
  });
  await r.text();
  return r.status;
}

describe('GET /api/settings/custom-models never returns a slot key', () => {
  it('an analyst in team mode sees the slot, not its key', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    settings.set('custom_model_slot_1', JSON.stringify({ ...SLOT, apiKeyOverride: SECRET }));
    current = { id: 'carol', username: 'carol', role: 'analyst' };
    const r = await getSlots();
    expect(r.status).toBe(200);
    expect(r.text).not.toContain(SECRET);
    expect(r.json.slot1).toMatchObject({ modelId: 'gpt-4o-mini', apiKeyOverride: STORED_KEY_PLACEHOLDER, hasApiKeyOverride: true });
    expect(r.json.slot2).toBeNull();
  });

  it('a slot without a key reports hasApiKeyOverride=false and carries no placeholder', async () => {
    delete process.env.DEPLOYMENT_MODE;
    settings.set('custom_model_slot_2', JSON.stringify(SLOT));
    const r = await getSlots();
    expect(r.json.slot2).toMatchObject({ hasApiKeyOverride: false });
    expect(r.json.slot2).not.toHaveProperty('apiKeyOverride');
  });
});

describe('saving a slot', () => {
  it('negative control: an edit of another field keeps the stored key (the form sends back what GET gave it)', async () => {
    delete process.env.DEPLOYMENT_MODE;
    settings.set('custom_model_slot_1', JSON.stringify({ ...SLOT, apiKeyOverride: SECRET }));
    const fromGet = (await getSlots()).json.slot1!;
    expect(await save(1, { ...fromGet, displayName: 'Renamed' })).toBe(200);
    expect(stored(1)).toMatchObject({ displayName: 'Renamed', apiKeyOverride: SECRET });
    expect(stored(1)).not.toHaveProperty('hasApiKeyOverride');
    expect(process.env.CUSTOM_MODEL_1_API_KEY).toBe(SECRET);
  });

  it('negative control: a new key replaces the stored one', async () => {
    delete process.env.DEPLOYMENT_MODE;
    settings.set('custom_model_slot_1', JSON.stringify({ ...SLOT, apiKeyOverride: SECRET }));
    expect(await save(1, { ...SLOT, apiKeyOverride: 'sk-new' })).toBe(200);
    expect(stored(1)?.apiKeyOverride).toBe('sk-new');
  });

  it('negative control: a save without a key clears it, as before', async () => {
    delete process.env.DEPLOYMENT_MODE;
    settings.set('custom_model_slot_1', JSON.stringify({ ...SLOT, apiKeyOverride: SECRET }));
    expect(await save(1, { ...SLOT })).toBe(200);
    expect(stored(1)).not.toHaveProperty('apiKeyOverride');
  });

  it('what GET hands the form is never stored as if it were a key', async () => {
    delete process.env.DEPLOYMENT_MODE;
    settings.set('custom_model_slot_1', JSON.stringify({ ...SLOT, apiKeyOverride: SECRET }));
    const handedOut = (await getSlots()).json.slot1!.apiKeyOverride;
    // Slot 2 has no stored key: the value from slot 1's form must not become one.
    expect(await save(2, { ...SLOT, apiKeyOverride: handedOut })).toBe(200);
    expect(stored(2)).not.toHaveProperty('apiKeyOverride');
  });
});
