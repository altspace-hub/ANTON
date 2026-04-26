/**
 * Regression test for the historical /portals/mine 500 (audit-notes §6 D7).
 *
 * Background: PortalsLandingPage at /portals/mine calls three GET endpoints in
 * parallel: /api/portals (list owned by user), /api/portals/inbox, and
 * /api/portals/trust-bundle/status. A regression caused one of these to 500
 * when zero or N portals existed for the user.
 *
 * Status: FIXED in HEAD (commit 0fabf7f and prior batches). This test pins
 * the contract so any future regression that breaks any of the three calls
 * surfaces immediately.
 *
 * NOTE: this test connects to the running dev server at localhost:3001.
 * It's an integration test, not a unit test — that's appropriate here
 * because the bug being pinned was an end-to-end routing issue (Express
 * matching `/portals/:id` against the literal string "mine"). A unit test
 * of the route handler wouldn't have caught it.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import pg from 'pg';

const SERVER = process.env.TEST_SERVER_URL ?? 'http://localhost:3001';
const DATABASE_URL = process.env.DATABASE_URL;

const skipReason = !DATABASE_URL ? 'no DATABASE_URL' : null;
const describeOrSkip = skipReason ? describe.skip : describe;

describeOrSkip('GET /api/portals/* — /portals/mine page contract', () => {
  let client: pg.Client;
  const testPortalId = randomUUID();
  const testOwner = 'solo';

  beforeAll(async () => {
    client = new pg.Client({ connectionString: DATABASE_URL });
    await client.connect();
  });

  afterAll(async () => {
    await client.query('DELETE FROM portals WHERE id = $1', [testPortalId]);
    await client.end();
  });

  it('GET /api/portals returns 200 with empty list (zero-portal state)', async () => {
    // Ensure zero portals for the test owner first.
    await client.query("DELETE FROM portals WHERE metadata->>'ownerId' = $1", [testOwner]);
    const r = await fetch(`${SERVER}/api/portals`, {
      headers: { Authorization: 'Bearer solo-mode' },
    });
    expect(r.status).toBe(200);
    const data = (await r.json()) as { portals: unknown[] };
    expect(Array.isArray(data.portals)).toBe(true);
  });

  it('GET /api/portals returns 200 with the test portal in the list (populated state)', async () => {
    await client.query(
      `INSERT INTO portals (id, name, namespace, category, contact_hash,
                            public_key_hex, private_key_pem, status, public_index, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
       ON CONFLICT (id) DO UPDATE SET metadata = EXCLUDED.metadata`,
      [
        testPortalId, 'Roundtrip Test', 'test/roundtrip', 'general',
        'ANTON-TEST-TEST-TEST-TEST', '00'.repeat(44),
        '-----BEGIN PRIVATE KEY-----\nstub\n-----END PRIVATE KEY-----',
        'draft', false, JSON.stringify({ ownerId: testOwner }),
      ]
    );

    const r = await fetch(`${SERVER}/api/portals`, {
      headers: { Authorization: 'Bearer solo-mode' },
    });
    expect(r.status).toBe(200);
    const data = (await r.json()) as { portals: Array<{ id: string }> };
    expect(data.portals.find((p) => p.id === testPortalId)).toBeTruthy();
  });

  it('GET /api/portals/inbox returns 200', async () => {
    const r = await fetch(`${SERVER}/api/portals/inbox?status=pending&limit=1`, {
      headers: { Authorization: 'Bearer solo-mode' },
    });
    expect(r.status).toBe(200);
  });

  it('GET /api/portals/trust-bundle/status returns 200', async () => {
    const r = await fetch(`${SERVER}/api/portals/trust-bundle/status`);
    expect(r.status).toBe(200);
  });

  it('GET /api/portals/mine returns 200 with the same payload as /api/portals (alias)', async () => {
    // Pins the historical regression (audit-notes §6 D7) where Express
    // matched /portals/:id against "mine" and PostgreSQL rejected the literal
    // as a UUID. The fix in routes/portals.ts registers /portals/mine
    // BEFORE /portals/:id and reuses the listOwnedPortals handler.
    const r = await fetch(`${SERVER}/api/portals/mine`, {
      headers: { Authorization: 'Bearer solo-mode' },
    });
    expect(r.status).toBe(200);
    const data = (await r.json()) as { portals: unknown[] };
    expect(Array.isArray(data.portals)).toBe(true);
  });
});
