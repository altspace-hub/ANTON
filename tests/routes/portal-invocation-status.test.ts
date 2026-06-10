/**
 * Contract test for the public visitor invocation-status endpoint
 * (Wave-2 Track C / plan 2.11 — "close the invoke loop"):
 *
 *   GET /api/portals/visit/:address/invocations/:responseId
 *
 * The responseId acts as the capability token (random, verb-prefixed,
 * portal-scoped, rate-limited per IP), so the route is public — no auth
 * header in any request below. Pins:
 *   - 200 + kind:'invocation_status' for a known responseId (pending)
 *   - owner's response output surfaces once status='responded'
 *   - rejection reason surfaces once status='rejected'
 *   - 404 + kind:'not_found' for an unknown responseId
 *   - never leaks the visitor's input or contact hash
 *   - rate-limit headers present (standardHeaders on the limiter)
 *
 * NOTE: like portals-mine.test.ts, this connects to the running dev server
 * at localhost:3001 — it's an integration test because the behaviour being
 * pinned spans Express routing + the portal handler + PostgreSQL.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import pg from 'pg';

const SERVER = process.env.TEST_SERVER_URL ?? 'http://localhost:3001';
const DATABASE_URL = process.env.DATABASE_URL;

const skipReason = !DATABASE_URL ? 'no DATABASE_URL' : null;
const describeOrSkip = skipReason ? describe.skip : describe;

describeOrSkip('GET /api/portals/visit/:address/invocations/:responseId', () => {
  let client: pg.Client;
  const portalId = randomUUID();
  const portalName = `invstatus-${randomUUID().slice(0, 8)}`;
  const portalNamespace = 'testns';
  const portalAddress = `${portalName}.${portalNamespace}.portal`;
  const responseId = 'CON-20260610-TESTTOKEN1';
  const rejectedResponseId = 'CON-20260610-TESTTOKEN2';

  function statusUrl(rid: string): string {
    return `${SERVER}/api/portals/visit/${encodeURIComponent(portalAddress)}/invocations/${encodeURIComponent(rid)}`;
  }

  beforeAll(async () => {
    client = new pg.Client({ connectionString: DATABASE_URL });
    await client.connect();
    await client.query(
      `INSERT INTO portals (id, name, namespace, category, contact_hash,
                            public_key_hex, private_key_pem, status, public_index, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
      [
        portalId, portalName, portalNamespace, 'personal',
        'ANTON-TEST-TEST-TEST-TEST', '00'.repeat(44),
        '-----BEGIN PRIVATE KEY-----\nstub\n-----END PRIVATE KEY-----',
        'active', false, JSON.stringify({ ownerId: 'solo' }),
      ],
    );
    await client.query(
      `INSERT INTO portal_capability_invocations
         (portal_id, capability_id, capability_verb, aap_endpoint,
          visitor_contact_hash, input, output, response_id, status)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, 'pending'),
              ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $9, 'pending')`,
      [
        portalId, 'say-hello', 'contact', 'messages',
        'ANTON-VSTR-VSTR-VSTR-VSTR',
        JSON.stringify({ message: 'secret visitor input — must never surface' }),
        JSON.stringify({ messageId: responseId, acceptedAt: new Date().toISOString() }),
        responseId, rejectedResponseId,
      ],
    );
  });

  afterAll(async () => {
    // Cascade deletes the invocation rows.
    await client.query('DELETE FROM portals WHERE id = $1', [portalId]);
    await client.end();
  });

  it('returns 200 + pending status for a known responseId (no auth required)', async () => {
    const r = await fetch(statusUrl(responseId));
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body.kind).toBe('invocation_status');
    expect(body.responseId).toBe(responseId);
    expect(body.status).toBe('pending');
    expect(body.respondedAt).toBeNull();
    // Output is withheld until the owner actually responds.
    expect(body.output).toBeNull();
  });

  it('never leaks the visitor input or contact hash', async () => {
    const r = await fetch(statusUrl(responseId));
    const text = await r.text();
    expect(text).not.toContain('secret visitor input');
    expect(text).not.toContain('ANTON-VSTR');
  });

  it("surfaces the owner's output once status = responded", async () => {
    await client.query(
      `UPDATE portal_capability_invocations
       SET status = 'responded', responded_at = NOW(), output = $1::jsonb
       WHERE portal_id = $2 AND response_id = $3`,
      [JSON.stringify({ answer: 'Yes — we can do Tuesday.' }), portalId, responseId],
    );
    const r = await fetch(statusUrl(responseId));
    expect(r.status).toBe(200);
    const body = (await r.json()) as { status: string; respondedAt: string | null; output: { answer?: string } | null };
    expect(body.status).toBe('responded');
    expect(body.respondedAt).toBeTruthy();
    expect(body.output?.answer).toBe('Yes — we can do Tuesday.');
  });

  it('surfaces the rejection reason once status = rejected', async () => {
    await client.query(
      `UPDATE portal_capability_invocations
       SET status = 'rejected', responded_at = NOW(), rejection_reason = 'Fully booked this month.'
       WHERE portal_id = $1 AND response_id = $2`,
      [portalId, rejectedResponseId],
    );
    const r = await fetch(statusUrl(rejectedResponseId));
    expect(r.status).toBe(200);
    const body = (await r.json()) as { status: string; rejectionReason: string | null; output: unknown };
    expect(body.status).toBe('rejected');
    expect(body.rejectionReason).toBe('Fully booked this month.');
    expect(body.output).toBeNull();
  });

  it('returns 404 + not_found for an unknown responseId', async () => {
    const r = await fetch(statusUrl('CON-20260610-DOESNOTEXIST'));
    expect(r.status).toBe(404);
    const body = (await r.json()) as { kind: string };
    expect(body.kind).toBe('not_found');
  });

  it('returns 404 for an unknown portal address', async () => {
    const r = await fetch(
      `${SERVER}/api/portals/visit/${encodeURIComponent('no-such-portal.testns.portal')}/invocations/${responseId}`,
    );
    expect(r.status).toBe(404);
  });

  it('carries standard rate-limit headers (per-IP limiter is wired)', async () => {
    const r = await fetch(statusUrl(responseId));
    // express-rate-limit standardHeaders → draft-6 (RateLimit-Limit) or
    // draft-7 (combined RateLimit). Accept either so a library bump
    // doesn't break the pin.
    const hasHeaders = r.headers.get('ratelimit-limit') !== null || r.headers.get('ratelimit') !== null;
    expect(hasHeaders).toBe(true);
  });
});
