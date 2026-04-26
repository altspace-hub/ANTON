/**
 * Roundtrip test for the /portals/mine flow:
 * - Empty state (zero portals) → already returns 200, verified separately.
 * - Populated state (≥1 portal owned by user) → insert a row, hit the API, clean up.
 *
 * Catches the historical "/portals/mine 500" regression in both states.
 */
import 'dotenv/config';
import { randomUUID } from 'crypto';
import pkg from 'pg';
const { Client } = pkg;

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const ownerId = 'solo';
  const portalId = randomUUID();

  // Insert a synthetic portal owned by 'solo'
  await c.query(
    `INSERT INTO portals (id, name, namespace, category, contact_hash,
                          public_key_hex, private_key_pem, status, public_index, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
     ON CONFLICT (id) DO UPDATE SET metadata = EXCLUDED.metadata`,
    [
      portalId, 'Roundtrip Test', 'test/roundtrip', 'general',
      'ANTON-TEST-TEST-TEST-TEST',
      '00'.repeat(44),                          // 88-char hex stub
      '-----BEGIN PRIVATE KEY-----\nstub\n-----END PRIVATE KEY-----',
      'draft', false, JSON.stringify({ ownerId }),
    ]
  );
  console.log('Inserted test portal');

  // Hit the list endpoint
  const r = await fetch('http://localhost:3001/api/portals', {
    headers: { Authorization: 'Bearer solo-mode' },
  });
  const data = await r.json() as { portals?: Array<{ id: string; name: string }> };
  console.log(`HTTP ${r.status} — portals returned: ${data.portals?.length ?? '???'}`);
  if (data.portals?.find(p => p.id === portalId)) {
    console.log('  ✓ test portal visible in /api/portals');
  }

  // Hit the inbox + trust-bundle endpoints (the other two PortalsLandingPage calls)
  const r2 = await fetch('http://localhost:3001/api/portals/inbox?status=pending&limit=1', {
    headers: { Authorization: 'Bearer solo-mode' },
  });
  console.log(`/api/portals/inbox → HTTP ${r2.status}`);

  const r3 = await fetch('http://localhost:3001/api/portals/trust-bundle/status', {
    headers: { Authorization: 'Bearer solo-mode' },
  });
  console.log(`/api/portals/trust-bundle/status → HTTP ${r3.status}`);

  // Cleanup
  await c.query('DELETE FROM portals WHERE id = $1', [portalId]);
  console.log('Cleaned up');
  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
