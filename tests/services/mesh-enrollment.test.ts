/**
 * mesh-enrollment.test.ts — verify the server-side enrollment flow emits a
 * cryptographically valid mesh package per spec §3.2 + §8.
 *
 * Tested invariants:
 *   - When transport='mesh', the package includes ed_pk / x_pk / binding_sig
 *   - x_pk == ed25519_pk_to_curve25519(ed_pk) (relay step 2 verification)
 *   - binding_sig is valid Ed25519(ed_pk) over (BINDING_DOMAIN || ed_pk || x_pk)
 *   - Mesh fields are cached on the second enrollment (no recomputation)
 *   - relay_endpoints fall back to ANTON_MESH_RELAYS env var
 *   - public_https enrollments are unchanged (no mesh fields emitted)
 */

import 'dotenv/config';
import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { ed25519, edwardsToMontgomeryPub } from '@noble/curves/ed25519';

const BINDING_DOMAIN = new TextEncoder().encode('ANTON-MESH-IDENTITY/v1\n');

// We talk to a real Postgres test database that's already provisioned for
// the project. Migration 206 was applied. Skip the suite gracefully if the
// db isn't reachable so unrelated CI doesn't fail.
let createAppEnrollmentService: typeof import('../../server/services/app-enrollment-service.js').createAppEnrollmentService;
let db: import('../../server/db/database.js').DatabaseAdapter;
let dbAvailable = false;

beforeAll(async () => {
  ({ createAppEnrollmentService } = await import('../../server/services/app-enrollment-service.js'));
  console.log('[mesh-enrollment.test] DATABASE_URL =', process.env.DATABASE_URL ? '<set>' : '<unset>');
  if (!process.env.DATABASE_URL) {
    console.warn('[mesh-enrollment.test] DATABASE_URL not set; skipping suite');
    return;
  }
  try {
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: process.env.DATABASE_URL });
    // Smoke check + ensure migration 206 columns exist.
    await db.get('SELECT ed25519_pubkey_raw FROM instance_identity LIMIT 1');
    dbAvailable = true;
  } catch (err) {
    console.warn('[mesh-enrollment.test] DB not reachable or migration not applied; skipping suite:', (err as Error).message);
    dbAvailable = false;
  }
});

beforeEach(async () => {
  if (!dbAvailable) return;
  // Reset just the mesh cache fields so each test re-derives. We DON'T
  // reset the identity itself (that would be slow + chatty for parallel
  // test runs).
  await db.run(`
    UPDATE instance_identity SET
      ed25519_pubkey_raw = NULL,
      x25519_pubkey = NULL,
      x25519_privkey_encrypted = NULL,
      x25519_privkey_iv = NULL,
      binding_sig = NULL,
      mesh_instance_id = NULL
    WHERE singleton = 'singleton'
  `);
});

afterEach(async () => {
  if (!dbAvailable) return;
  // Tidy up any enrollment tokens we created.
  await db.run(`DELETE FROM app_enrollment_tokens WHERE created_by_user_id = 'test-mesh-suite'`);
});

/** Test that needs DB access. Skips at runtime if the suite couldn't reach Postgres. */
function dbIt(name: string, body: () => Promise<void>): void {
  it(name, async (ctx) => {
    if (!dbAvailable) { ctx.skip(); return; }
    await body();
  });
}

describe('Mesh enrollment — package construction', () => {
  dbIt('emits ed_pk + x_pk + binding_sig + relay_endpoints when transport=mesh', async () => {
    const svc = createAppEnrollmentService(db);
    const pkg = await svc.startEnrollment({
      issued_by_user_id: 'test-mesh-suite',
      endpoints: { wan: 'https://example.com' },
      transport: 'mesh',
      relay_endpoints: ['wss://r1.test', 'wss://r2.test'],
    });

    expect(pkg.transport).toBe('mesh');
    expect(pkg.relay_endpoints).toEqual(['wss://r1.test', 'wss://r2.test']);
    expect(pkg.instance_ed_pk).toBeDefined();
    expect(pkg.instance_x_pk).toBeDefined();
    expect(pkg.binding_sig).toBeDefined();
    // Hex lengths
    expect(pkg.instance_ed_pk!.length).toBe(64);   // 32 bytes hex
    expect(pkg.instance_x_pk!.length).toBe(64);
    expect(pkg.binding_sig!.length).toBe(128);     // 64 bytes hex
  });

  dbIt('x_pk equals ed25519_pk_to_curve25519(ed_pk) — relay step 2 will verify', async () => {
    const svc = createAppEnrollmentService(db);
    const pkg = await svc.startEnrollment({
      issued_by_user_id: 'test-mesh-suite',
      endpoints: {},
      transport: 'mesh',
      relay_endpoints: ['wss://r1.test'],
    });

    const ed_pk = Buffer.from(pkg.instance_ed_pk!, 'hex');
    const expected_x_pk = edwardsToMontgomeryPub(ed_pk);
    const actual_x_pk = Buffer.from(pkg.instance_x_pk!, 'hex');
    expect(Buffer.compare(expected_x_pk, actual_x_pk)).toBe(0);
  });

  dbIt('binding_sig is a valid Ed25519 sig over (BINDING_DOMAIN || ed_pk || x_pk)', async () => {
    const svc = createAppEnrollmentService(db);
    const pkg = await svc.startEnrollment({
      issued_by_user_id: 'test-mesh-suite',
      endpoints: {},
      transport: 'mesh',
      relay_endpoints: ['wss://r1.test'],
    });

    const ed_pk = new Uint8Array(Buffer.from(pkg.instance_ed_pk!, 'hex'));
    const x_pk = new Uint8Array(Buffer.from(pkg.instance_x_pk!, 'hex'));
    const sig = new Uint8Array(Buffer.from(pkg.binding_sig!, 'hex'));

    const msg = new Uint8Array(BINDING_DOMAIN.length + 32 + 32);
    msg.set(BINDING_DOMAIN, 0);
    msg.set(ed_pk, BINDING_DOMAIN.length);
    msg.set(x_pk, BINDING_DOMAIN.length + 32);

    expect(ed25519.verify(sig, msg, ed_pk)).toBe(true);
  });

  dbIt('caches mesh fields — second enrollment returns identical fields without recomputing', async () => {
    const svc = createAppEnrollmentService(db);
    const pkg1 = await svc.startEnrollment({
      issued_by_user_id: 'test-mesh-suite',
      endpoints: {},
      transport: 'mesh',
      relay_endpoints: ['wss://r1.test'],
    });
    const pkg2 = await svc.startEnrollment({
      issued_by_user_id: 'test-mesh-suite',
      endpoints: {},
      transport: 'mesh',
      relay_endpoints: ['wss://r1.test'],
    });
    // Tokens differ each call, but the mesh identity is stable.
    expect(pkg1.instance_ed_pk).toBe(pkg2.instance_ed_pk);
    expect(pkg1.instance_x_pk).toBe(pkg2.instance_x_pk);
    expect(pkg1.binding_sig).toBe(pkg2.binding_sig);
  });
});

describe('Mesh enrollment — relay endpoint resolution', () => {
  dbIt('falls back to ANTON_MESH_RELAYS env when caller omits relay_endpoints', async () => {
    const svc = createAppEnrollmentService(db);
    const prev = process.env.ANTON_MESH_RELAYS;
    process.env.ANTON_MESH_RELAYS = 'wss://env1.test, wss://env2.test';
    try {
      const pkg = await svc.startEnrollment({
        issued_by_user_id: 'test-mesh-suite',
        endpoints: {},
        transport: 'mesh',
      });
      expect(pkg.relay_endpoints).toEqual(['wss://env1.test', 'wss://env2.test']);
    } finally {
      if (prev === undefined) delete process.env.ANTON_MESH_RELAYS;
      else process.env.ANTON_MESH_RELAYS = prev;
    }
  });

  dbIt('throws when transport=mesh and no relays anywhere', async () => {
    const svc = createAppEnrollmentService(db);
    const prev = process.env.ANTON_MESH_RELAYS;
    delete process.env.ANTON_MESH_RELAYS;
    try {
      await expect(svc.startEnrollment({
        issued_by_user_id: 'test-mesh-suite',
        endpoints: {},
        transport: 'mesh',
      })).rejects.toThrow(/at least one relay endpoint/);
    } finally {
      if (prev !== undefined) process.env.ANTON_MESH_RELAYS = prev;
    }
  });
});

describe('Mesh enrollment — back-compat with public_https', () => {
  dbIt('public_https enrollment emits no mesh fields', async () => {
    const svc = createAppEnrollmentService(db);
    const pkg = await svc.startEnrollment({
      issued_by_user_id: 'test-mesh-suite',
      endpoints: { wan: 'https://example.com' },
      // transport omitted ⇒ public_https default
    });
    expect(pkg.transport).toBeUndefined();
    expect(pkg.instance_ed_pk).toBeUndefined();
    expect(pkg.instance_x_pk).toBeUndefined();
    expect(pkg.binding_sig).toBeUndefined();
    expect(pkg.relay_endpoints).toBeUndefined();
  });
});

describe('Mesh enrollment — token retrieval round-trip', () => {
  dbIt('getEnrollment(token) returns the mesh fields the phone needs', async () => {
    const svc = createAppEnrollmentService(db);
    const start = await svc.startEnrollment({
      issued_by_user_id: 'test-mesh-suite',
      endpoints: {},
      transport: 'mesh',
      relay_endpoints: ['wss://r1.test'],
    });
    const fetched = await svc.getEnrollment(start.token);
    expect(fetched).not.toBeNull();
    expect(fetched!.transport).toBe('mesh');
    expect(fetched!.instance_ed_pk).toBe(start.instance_ed_pk);
    expect(fetched!.instance_x_pk).toBe(start.instance_x_pk);
    expect(fetched!.binding_sig).toBe(start.binding_sig);
    expect(fetched!.relay_endpoints).toEqual(['wss://r1.test']);
  });
});
