/**
 * fc-key-material-leak.test.ts — response-shape guards for the FutureChain
 * routes (launch-week security wave, Sep 2026).
 *
 * Two regressions this pins:
 *
 *  1. HIGH — GET /api/futurechain/wallets served whole `fc_wallets` rows
 *     (`SELECT *` in fc-wallet-service.getWallets), so every listing shipped
 *     `privkey_encrypted` + `mnemonic_encrypted` (migrations 210/211) to the
 *     client. On a default SOLO install that is an offline-crackable copy of
 *     the wallet. Ciphertext is still key material.
 *
 *  2. MEDIUM — GET/PUT /api/futurechain/gateway/config spread the raw config
 *     row, so the plaintext `api_key` (the bearer credential for the public
 *     /api/gateway/pay route) travelled right next to its own mask.
 *
 * Requires DATABASE_URL — same skip pattern as fc-checkout.test.ts. Every row
 * this test writes is namespaced with a random suffix and removed in teardown.
 *
 * Deliberately does NOT write to `fc_gateway_config`: that table is a single
 * 'default' row and fc-checkout.test.ts (a separate file, so a separate worker
 * running in parallel) swaps its api_key + enabled flag for its own run. An
 * earlier draft of this test set a known key and the two files stomped each
 * other. The gateway assertions below are therefore value-independent — they
 * assert the SHAPE of the response, which is the security property anyway.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
import express from 'express';
import type { Server } from 'http';

function resolveDatabaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const env = readFileSync(join(process.cwd(), '.env'), 'utf8');
    const m = env.match(/^DATABASE_URL=(.+)$/m);
    return m ? m[1].trim() : undefined;
  } catch { return undefined; }
}
const DATABASE_URL = resolveDatabaseUrl();
const describeOrSkip = DATABASE_URL ? describe : describe.skip;

/** Columns on fc_wallets that must never appear in an API response. */
const SECRET_WALLET_COLUMNS = [
  'privkey_encrypted',
  'privkey_iv',
  'mnemonic_encrypted',
  'mnemonic_iv',
] as const;

describeOrSkip('FutureChain routes never return key material', () => {
  let db: import('../../server/db/database.js').DatabaseAdapter;
  let server: Server;
  let base: string;

  const suffix = randomBytes(5).toString('hex');
  const WALLET_ID = `fcw_keyleak_${suffix}`;
  const WALLET_ADDR = `fc_keyleak_${suffix}`;
  // Stand-ins for the real AES-GCM ciphertext ‖ tag blobs.
  const PRIVKEY_BLOB = randomBytes(48);
  const MNEMONIC_BLOB = randomBytes(64);

  /** A gateway api_key is 32+ random hex (see fc-gateway-service.regenerateApiKey,
   *  `randomBytes(32).toString('hex')`). No other column on fc_gateway_config —
   *  booleans, FTC limits, 'default', timestamps — can produce a run this long,
   *  so a match means the raw key rode along in the response. */
  const RAW_KEY_SHAPE = /[0-9a-f]{32,}/;
  /** What the masked field is allowed to look like: empty, or the gw_ prefix
   *  plus at most an 8-character tail. */
  const MASK_SHAPE = /^(|gw_\*{8}|gw_\*{8}\.\.\.[0-9a-zA-Z_-]{8})$/;

  beforeAll(async () => {
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    const { createFCWalletRoutes } = await import('../../server/routes/fc-wallets.js');
    const { createFCGatewayRoutes } = await import('../../server/routes/fc-gateway.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL! });

    // A real-mode wallet row WITH key material present — the only shape that
    // can prove the response is trimmed rather than merely empty.
    await db.run(
      `INSERT INTO fc_wallets (
         id, name, wallet_file_name, address, wallet_type,
         balance_ftc, balance_raw, is_active,
         pubkey, privkey_encrypted, privkey_iv, mnemonic_encrypted, mnemonic_iv,
         sdk_schema_version, key_version
       ) VALUES (?, ?, ?, ?, 'human', 1.5, 150000000, TRUE, ?, ?, ?, ?, ?, 2, 2)`,
      WALLET_ID, `keyleak ${suffix}`, `keyleak_${suffix}`, WALLET_ADDR,
      randomBytes(32), PRIVKEY_BLOB, randomBytes(12), MNEMONIC_BLOB, randomBytes(12),
    );

    const app = express();
    app.use(express.json());
    app.use('/api', await createFCWalletRoutes(db));
    const { adminRouter } = await createFCGatewayRoutes(db);
    app.use('/api', adminRouter);
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
    const addr = server.address();
    if (addr === null || typeof addr === 'string') throw new Error('no addr');
    base = `http://127.0.0.1:${addr.port}`;
  }, 60_000);

  afterAll(async () => {
    try {
      await db.run('DELETE FROM fc_wallets WHERE id = ?', WALLET_ID);
    } finally {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
      await db.close();
    }
  });

  it('GET /futurechain/wallets omits privkey + mnemonic columns but keeps the display fields', async () => {
    const res = await fetch(`${base}/api/futurechain/wallets`);
    expect(res.status).toBe(200);
    const rows = (await res.json()) as Array<Record<string, unknown>>;

    // Guard against a vacuous pass: the seeded wallet MUST be in the listing.
    const mine = rows.find((r) => r.id === WALLET_ID);
    expect(mine, 'seeded wallet missing from the listing — assertions below would be vacuous').toBeDefined();

    // Structural check: the key columns must not be present at all, not even
    // as null. A joined-text scan cannot see this.
    for (const col of SECRET_WALLET_COLUMNS) {
      expect(Object.keys(mine!)).not.toContain(col);
    }

    // The fields the desktop UI (src/pages/futurechain/FCWalletsPage.tsx) and
    // the companion wallet screens actually render must survive the trim.
    for (const col of ['id', 'name', 'address', 'wallet_type', 'balance_ftc', 'utxo_count', 'is_active', 'created_at']) {
      expect(Object.keys(mine!)).toContain(col);
    }
  });

  it('GET /futurechain/gateway/config masks the API key and never returns it in full', async () => {
    const res = await fetch(`${base}/api/futurechain/gateway/config`);
    expect(res.status).toBe(200);
    const raw = await res.text();
    const body = JSON.parse(raw) as Record<string, unknown>;

    expect(Object.keys(body)).not.toContain('api_key');
    expect(raw).not.toMatch(RAW_KEY_SHAPE);
    // The mask the UI renders (api_key_display) survives, and exposes at most
    // an 8-character tail.
    expect(String(body.api_key_display)).toMatch(MASK_SHAPE);
  });

  it('PUT /futurechain/gateway/config masks the API key in its echo of the saved row', async () => {
    // An EMPTY body: fc-gateway-service.updateConfig whitelists the fields it
    // will write, finds none here, skips the UPDATE entirely and just re-reads
    // the row. So this asserts the response projection without touching the
    // shared 'default' config row that fc-checkout.test.ts also uses.
    const res = await fetch(`${base}/api/futurechain/gateway/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const raw = await res.text();
    const body = JSON.parse(raw) as Record<string, unknown>;

    expect(Object.keys(body)).not.toContain('api_key');
    expect(raw).not.toMatch(RAW_KEY_SHAPE);
    expect(String(body.api_key_display)).toMatch(MASK_SHAPE);
  });
});
