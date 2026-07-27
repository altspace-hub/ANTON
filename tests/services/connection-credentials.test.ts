/**
 * connection-credentials.test.ts — credentials encrypted at rest, decrypted at point of
 * use, never sent to a client.
 *
 * Three defects sat in the gap between those clauses:
 *
 *  1. `get()` returned the STORED (encrypted) config while `test()` decrypted its own
 *     copy. So a connection would Test green and then fail on every workflow run,
 *     because the executor passed AES ciphertext in as the host and password. The
 *     workaround users find for that is to store the password in cleartext, which is
 *     how a usability bug becomes a security one.
 *
 *  2. `update()` wrote `data.config` verbatim — the edit form's PLAINTEXT — so editing
 *     a connection silently undid the encryption `create()` had applied.
 *
 *  3. The routes returned the whole Connection, config included. Combined with (2) that
 *     put real passwords on the wire, and it would have become a guaranteed plaintext
 *     leak the moment the data layer started decrypting (which it must, for (1)).
 *
 * The vault tests below are pure. The manager tests need Postgres and skip without it.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { encryptConfig, decryptConfig, redactConfig, mergeSecrets } from '../../server/services/credential-vault.js';

function resolveDatabaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const env = readFileSync(join(process.cwd(), '.env'), 'utf8');
    const m = env.match(/^DATABASE_URL=(.+)$/m);
    return m ? m[1].trim() : undefined;
  } catch { return undefined; }
}
const DATABASE_URL = resolveDatabaseUrl();

const SECRET = 'hunter2-correct-horse';

describe('credential vault', () => {
  it('encrypts a password and decrypts it back', () => {
    const enc = encryptConfig({ host: 'db.example', password: SECRET });
    expect(enc.password).not.toBe(SECRET);
    expect(enc.password_encrypted).toBe(true);
    expect(decryptConfig(enc).password).toBe(SECRET);
  });

  it('leaves non-secret fields alone', () => {
    const enc = encryptConfig({ host: 'db.example', port: 5432, password: SECRET });
    expect(enc.host).toBe('db.example');
    expect(enc.port).toBe(5432);
  });

  it('is idempotent — re-encrypting an encrypted config does not double-wrap it', () => {
    // update() re-encrypts whatever it is given, including a config that came straight
    // back from get(). A non-idempotent encrypt would make the value undecryptable.
    const once = encryptConfig({ password: SECRET });
    const twice = encryptConfig(once);
    expect(decryptConfig(twice).password).toBe(SECRET);
  });

  it('passes a PLAINTEXT legacy row through decrypt untouched', () => {
    // Rows written by the old update() have no _encrypted marker. Decrypting on read
    // must not mangle them, or the fix would break every previously-edited connection.
    const legacy = { host: 'db.example', password: SECRET };
    expect(decryptConfig(legacy).password).toBe(SECRET);
  });
});

describe('redactConfig', () => {
  it('removes the secret and reports only that one is set', () => {
    const out = redactConfig({ host: 'db.example', password: SECRET });
    expect(out.password).toBeUndefined();
    expect(out.password_set).toBe(true);
    expect(out.host).toBe('db.example');
  });

  it('leaves no trace of the value anywhere in the payload', () => {
    const out = redactConfig({ password: SECRET, api_key: 'ak_live_123', token: 'tok_abc' });
    expect(JSON.stringify(out)).not.toContain(SECRET);
    expect(JSON.stringify(out)).not.toContain('ak_live_123');
    expect(JSON.stringify(out)).not.toContain('tok_abc');
  });

  it('does not emit a mask that could be saved back as the real password', () => {
    // A '********' placeholder round-trips into the edit form and then into update(),
    // silently replacing the credential with literal asterisks.
    const out = redactConfig({ password: SECRET });
    expect(Object.values(out)).not.toContain('********');
    expect(Object.values(out)).not.toContain('***');
  });

  it('drops the at-rest _encrypted markers too', () => {
    const out = redactConfig(encryptConfig({ password: SECRET }));
    expect(out.password_encrypted).toBeUndefined();
  });

  it('reports nothing set when there is no secret', () => {
    const out = redactConfig({ host: 'db.example' });
    expect(out.password_set).toBeUndefined();
  });
});

describe('mergeSecrets — an omitted secret means unchanged, not deleted', () => {
  it('keeps the stored password when the incoming config omits it', () => {
    const out = mergeSecrets({ host: 'new-host' }, { host: 'old', password: SECRET });
    expect(out.password).toBe(SECRET);
    expect(out.host).toBe('new-host');
  });

  it('lets an explicit new value win', () => {
    const out = mergeSecrets({ password: 'replacement' }, { password: SECRET });
    expect(out.password).toBe('replacement');
  });

  it('lets an explicit empty string CLEAR the credential', () => {
    // Otherwise a credential could never be removed once set.
    const out = mergeSecrets({ password: '' }, { password: SECRET });
    expect(out.password).toBe('');
  });

  it('drops the _set display marker rather than storing it', () => {
    const out = mergeSecrets({ password_set: true }, { password: SECRET });
    expect(out.password_set).toBeUndefined();
    expect(out.password).toBe(SECRET);
  });
});

const d = DATABASE_URL ? describe : describe.skip;

d('connection manager — the encrypt/decrypt boundary', () => {
  let db: import('../../server/db/database.js').DatabaseAdapter;
  let manager: Awaited<ReturnType<typeof import('../../server/services/connection-manager.js').createConnectionManager>>;
  const created: string[] = [];

  beforeAll(async () => {
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL! });
    const { createConnectionManager } = await import('../../server/services/connection-manager.js');
    manager = await createConnectionManager(db);
  });

  afterAll(async () => {
    for (const id of created) await db.run('DELETE FROM connections WHERE id = ?', id).catch(() => {});
  });

  async function rawStoredConfig(id: string): Promise<string> {
    const row = await db.get('SELECT config FROM connections WHERE id = ?', id) as { config: string };
    return typeof row.config === 'string' ? row.config : JSON.stringify(row.config);
  }

  it('get() returns a USABLE password — the bug that made Test pass then workflows fail', async () => {
    const conn = await manager.create(
      { display_name: 'T ' + randomUUID().slice(0, 6), type: 'database', config: { driver: 'postgresql', host: 'h', password: SECRET } },
      'tester',
    );
    created.push(conn.id);

    const fetched = await manager.get(conn.id);
    expect((fetched!.config as Record<string, unknown>).password).toBe(SECRET);
  });

  it('...while the row on disk stays encrypted', async () => {
    const conn = await manager.create(
      { display_name: 'T ' + randomUUID().slice(0, 6), type: 'database', config: { driver: 'postgresql', password: SECRET } },
      'tester',
    );
    created.push(conn.id);
    expect(await rawStoredConfig(conn.id)).not.toContain(SECRET);
  });

  it('update() does NOT downgrade the stored credential to plaintext', async () => {
    const conn = await manager.create(
      { display_name: 'T ' + randomUUID().slice(0, 6), type: 'database', config: { driver: 'postgresql', password: 'old-secret' } },
      'tester',
    );
    created.push(conn.id);

    // Exactly what the edit form sends: plaintext values.
    await manager.update(conn.id, { config: { driver: 'postgresql', password: SECRET } });

    expect(await rawStoredConfig(conn.id)).not.toContain(SECRET);   // encrypted at rest
    const after = await manager.get(conn.id);
    expect((after!.config as Record<string, unknown>).password).toBe(SECRET);  // still usable
  });

  it('survives the full redacted round-trip a client actually performs', async () => {
    // GET (redacted, no password) -> user edits the host -> PUT the object back.
    // Before mergeSecrets this wiped the credential on an unrelated edit, and nothing
    // surfaced it until the next workflow run failed to authenticate.
    const conn = await manager.create(
      { display_name: 'T ' + randomUUID().slice(0, 6), type: 'database', config: { driver: 'postgresql', host: 'old-host', password: SECRET } },
      'tester',
    );
    created.push(conn.id);

    const asClientSees = redactConfig((await manager.get(conn.id))!.config as Record<string, unknown>);
    expect(asClientSees.password).toBeUndefined();          // client genuinely lacks it

    await manager.update(conn.id, { config: { ...asClientSees, host: 'new-host' } });

    const after = await manager.get(conn.id);
    expect((after!.config as Record<string, unknown>).host).toBe('new-host');
    expect((after!.config as Record<string, unknown>).password).toBe(SECRET);
    expect((after!.config as Record<string, unknown>).password_set).toBeUndefined();
    expect(await rawStoredConfig(conn.id)).not.toContain(SECRET);
  });

  it('a display-name-only edit leaves the credential intact', async () => {
    // update() falls back to existing.config, which is now DECRYPTED — so it must be
    // re-encrypted on the way back in, and must still decrypt to the same value.
    const conn = await manager.create(
      { display_name: 'T ' + randomUUID().slice(0, 6), type: 'database', config: { driver: 'postgresql', password: SECRET } },
      'tester',
    );
    created.push(conn.id);

    await manager.update(conn.id, { display_name: 'Renamed' });

    const after = await manager.get(conn.id);
    expect(after!.display_name).toBe('Renamed');
    expect((after!.config as Record<string, unknown>).password).toBe(SECRET);
    expect(await rawStoredConfig(conn.id)).not.toContain(SECRET);
  });
});
