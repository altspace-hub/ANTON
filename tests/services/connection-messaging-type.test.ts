/**
 * connection-messaging-type.test.ts — a connection type that could be read but never written.
 *
 * Four live queries filtered on `type = 'messaging'`:
 *   routes/integrations.ts  POST /integrations/test
 *   routes/integrations.ts  POST /integrations/send
 *   routes/integrations.ts  GET  /integrations/connections
 *   services/workflow-executor.ts  the messaging_notification step
 *
 * and no code path could create a row with that type: POST /api/connections validated
 * against a hand-maintained list that omitted it, and nothing else inserted it. So the
 * Slack/Teams integration was structurally unreachable — the two POSTs always 404'd, the
 * GET always returned [], and a workflow's "Messaging Notification" step always returned
 * { sent: false, error: 'Messaging connection not found or not active' } while the run
 * counted the step as COMPLETED. A notification feature that silently never notifies.
 *
 * Fixed by making the type writable rather than deleting the four readers: the send side
 * (slack-webhook.ts / teams-webhook.ts / message-formatter.ts) is complete and working,
 * and the workflow builder already offers the step. The missing piece was one list.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import {
  CONNECTION_TYPES,
  USER_CREATABLE_CONNECTION_TYPES,
  createConnectionManager,
} from '../../server/services/connection-manager.js';
import { encryptConfig, decryptConfig, redactConfig, SENSITIVE_FIELDS } from '../../server/services/credential-vault.js';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('messaging is now a writable connection type', () => {
  it('appears in the user-creatable list', () => {
    expect(USER_CREATABLE_CONNECTION_TYPES).toContain('messaging');
  });

  it('is a real member of the schema CHECK constraint, not an invention', () => {
    const schema = read('server/db/schema.postgresql.sql');
    const line = schema.split('\n').find((l) => l.includes("CHECK(type IN (") && l.includes('script_library'));
    expect(line).toBeDefined();
    for (const t of CONNECTION_TYPES) expect(line).toContain(`'${t}'`);
  });

  it('the create route validates against the shared list instead of a private copy', () => {
    // The private copy is exactly what drifted: it allowed channel_bridge and omitted
    // messaging, in opposite directions, from the ConnectionType union next door.
    const routes = read('server/routes/connections.ts');
    expect(routes).toContain('USER_CREATABLE_CONNECTION_TYPES');
    expect(routes).not.toMatch(/const validTypes = \[/);
  });

  it('still refuses channel_bridge through the generic endpoint', () => {
    // A bridge is only usable with the token POST /api/bridges mints and shows once, so
    // a bridge created here would be an unauthenticatable dead row.
    expect(USER_CREATABLE_CONNECTION_TYPES).not.toContain('channel_bridge');
  });

  it('the wizard offers it, so the type is reachable by a user and not just by curl', () => {
    const wizard = read('src/features/connections/ConnectionWizard.tsx');
    expect(wizard).toMatch(/id: 'messaging'/);
    expect(wizard).toMatch(/MessagingForm/);
  });
});

describe('no connection type is read but unwritable (the general form of this bug)', () => {
  it('every type queried in server code can be created by something', () => {
    const files = walk(join(process.cwd(), 'server'));

    const readTypes = new Set<string>();
    const writtenTypes = new Set<string>(USER_CREATABLE_CONNECTION_TYPES);

    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      if (!src.includes('connections')) continue;

      // `... FROM connections WHERE ... type = 'x'`
      for (const m of src.matchAll(/FROM connections\b[^;'"`]*?type\s*=\s*'([a-z_]+)'/g)) {
        readTypes.add(m[1]);
      }
      // Literal types in an INSERT INTO connections statement (bridges.ts writes
      // 'channel_bridge' directly rather than through the manager).
      for (const m of src.matchAll(/INSERT INTO\s+connections[\s\S]{0,400}/g)) {
        for (const lit of m[0].matchAll(/'([a-z_]+)'/g)) {
          if ((CONNECTION_TYPES as readonly string[]).includes(lit[1])) writtenTypes.add(lit[1]);
        }
      }
    }

    // Guard the guard: if the scan finds nothing it must fail loudly rather than pass.
    expect(readTypes.size).toBeGreaterThan(0);
    expect(readTypes).toContain('messaging');

    const unwritable = [...readTypes].filter((t) => !writtenTypes.has(t));
    expect(unwritable).toEqual([]);
  });
});

describe('the messaging webhook URL is treated as the credential it is', () => {
  const HOOK = 'https://hooks.slack.com/services/T000/B000/xoxb-super-secret';

  it('is encrypted at rest', () => {
    const enc = encryptConfig({ platform: 'slack', webhook_url: HOOK });
    expect(enc.webhook_url).not.toBe(HOOK);
    expect(enc.webhook_url_encrypted).toBe(true);
    expect(JSON.stringify(enc)).not.toContain('xoxb-super-secret');
  });

  it('round-trips back to a usable URL for the send path', () => {
    // integrations.ts and the messaging_notification step both decryptConfig before use.
    expect(decryptConfig(encryptConfig({ webhook_url: HOOK })).webhook_url).toBe(HOOK);
  });

  it('never leaves the server in a connection response', () => {
    const out = redactConfig({ platform: 'slack', webhook_url: HOOK });
    expect(out.webhook_url).toBeUndefined();
    expect(out.webhook_url_set).toBe(true);
    expect(JSON.stringify(out)).not.toContain('hooks.slack.com');
    expect(out.platform).toBe('slack');   // non-secret fields survive
  });

  it('is registered once, in the shared list both halves read', () => {
    expect(SENSITIVE_FIELDS).toContain('webhook_url');
  });
});

describe('testConfig for messaging is a test that can fail', () => {
  const fakeDb = {
    dialect: 'postgresql',
    async get() { return undefined; },
    async all() { return []; },
    async run(): Promise<RunResult> { return { changes: 0, lastInsertRowid: 0 }; },
    async exec() { /* noop */ },
    async transaction<T>(fn: (tx: DatabaseAdapter) => Promise<T>) { return fn(fakeDb as unknown as DatabaseAdapter); },
    async close() { /* noop */ },
  } as unknown as DatabaseAdapter;

  afterEach(() => vi.unstubAllGlobals());

  it('reports failure when the webhook rejects the post', async () => {
    // Making the type creatable without this would have handed the wizard back the
    // "cannot fail" green tick that POST /connections/test was built to remove.
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false, status: 404, text: async () => 'no_service',
    })));
    const manager = await createConnectionManager(fakeDb);

    const r = await manager.testConfig('messaging', {
      platform: 'slack',
      webhook_url: 'https://hooks.slack.com/services/dead/link',
    });

    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/404|no_service/);
  });

  it('reports success when the webhook accepts it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, text: async () => 'ok' })));
    const manager = await createConnectionManager(fakeDb);

    const r = await manager.testConfig('messaging', {
      platform: 'slack',
      webhook_url: 'https://hooks.slack.com/services/T000/B000/real',
    });

    expect(r.ok).toBe(true);
  });

  it('refuses a URL that is not a Slack webhook at all', async () => {
    const manager = await createConnectionManager(fakeDb);
    const r = await manager.testConfig('messaging', {
      platform: 'slack',
      webhook_url: 'https://evil.example.com/collect',
    });
    expect(r.ok).toBe(false);
  });

  it('refuses an unconfigured webhook and an unknown platform', async () => {
    const manager = await createConnectionManager(fakeDb);
    expect((await manager.testConfig('messaging', { platform: 'slack' })).ok).toBe(false);
    expect((await manager.testConfig('messaging', { platform: 'carrier-pigeon', webhook_url: 'https://x' })).ok).toBe(false);
  });

  it('does not fall through to the "no live test available" pass', async () => {
    // That branch returns { ok: true } unconditionally — reaching it for messaging would
    // reintroduce the always-green wizard for exactly one type.
    const manager = await createConnectionManager(fakeDb);
    const r = await manager.testConfig('messaging', { platform: 'slack', webhook_url: '' });
    expect(r.message).not.toMatch(/no live test available/);
  });
});
