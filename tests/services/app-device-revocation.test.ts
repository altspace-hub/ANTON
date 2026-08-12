/**
 * app-device-revocation.test.ts — unpairing a Companion device must actually
 * end its access.
 *
 * This is the control an operator reaches for when a phone is lost or stolen or
 * an employee leaves. Before this fix it revoked nothing: revokeDevice() marked
 * `app_devices.revoked_at` and disabled push, but never touched
 * app_session_tokens (which had no device_id to scope by), and neither
 * app-auth.ts nor the requireApproved gate consulted revoked_at. The holder of
 * the plaintext token kept full access for the remainder of the 30-day TTL —
 * while listDevices() filtered `revoked_at IS NULL`, so the UI showed the device
 * as gone. Inert, and silently so.
 *
 * These tests pin all three layers: the session DELETE, the auth-time refusal,
 * and the approval gate.
 */
import { describe, it, expect, vi } from 'vitest';
import { createAppEnrollmentService } from '../../server/services/app-enrollment-service.js';
import { createApprovedUserCheck } from '../../server/routes/app-gateway.js';
import { createAppAuthMiddleware } from '../../server/middleware/app-auth.js';
import type { DatabaseAdapter } from '../../server/db/database.js';

// ── revokeDevice ────────────────────────────────────────────────────────

/** Records every statement revokeDevice issues, in order. */
function recordingDb(): { db: DatabaseAdapter; runs: Array<{ sql: string; args: unknown[] }> } {
  const runs: Array<{ sql: string; args: unknown[] }> = [];
  const db = {
    run: async (sql: string, ...args: unknown[]) => { runs.push({ sql, args }); return { changes: 1 }; },
    get: async () => null,
    all: async () => [],
  } as unknown as DatabaseAdapter;
  return { db, runs };
}

describe('revokeDevice ends the device session, not just the device row', () => {
  it('DELETEs app_session_tokens for the revoked device', async () => {
    const { db, runs } = recordingDb();
    await createAppEnrollmentService(db).revokeDevice('user-1', 'dev-9');

    const del = runs.find(r => /DELETE\s+FROM\s+app_session_tokens/i.test(r.sql));
    expect(del, 'revokeDevice must delete the device session tokens').toBeDefined();
    expect(del!.args).toContain('dev-9');
    expect(del!.args).toContain('user-1');
  });

  it('also clears pre-migration sessions with no device attribution', async () => {
    // Sessions issued before migration 251 have device_id NULL and can never be
    // attributed. They are indistinguishable from the revoked device's own, so
    // revocation must fail SAFE and clear them rather than leave a stolen phone
    // authenticated.
    const { db, runs } = recordingDb();
    await createAppEnrollmentService(db).revokeDevice('user-1', 'dev-9');

    const del = runs.find(r => /DELETE\s+FROM\s+app_session_tokens/i.test(r.sql))!;
    expect(del.sql).toMatch(/device_id\s+IS\s+NULL/i);
    // ...but scoped to THIS user — never a global session wipe.
    expect(del.sql).toMatch(/connected_user_id\s*=/i);
  });

  it('kills the credential BEFORE marking the device revoked', async () => {
    // Ordering is deliberate. If the device UPDATE landed first and the session
    // DELETE then failed, listDevices() (which filters revoked_at IS NULL) would
    // already hide the device while its token still worked — precisely the state
    // that made the original bug invisible.
    const { db, runs } = recordingDb();
    await createAppEnrollmentService(db).revokeDevice('user-1', 'dev-9');

    const delIdx = runs.findIndex(r => /DELETE\s+FROM\s+app_session_tokens/i.test(r.sql));
    const updIdx = runs.findIndex(r => /UPDATE\s+app_devices\s+SET\s+revoked_at/i.test(r.sql));
    expect(delIdx).toBeGreaterThanOrEqual(0);
    expect(updIdx).toBeGreaterThanOrEqual(0);
    expect(delIdx).toBeLessThan(updIdx);
  });

  it('still marks the device revoked and disables its push tokens', async () => {
    const { db, runs } = recordingDb();
    await createAppEnrollmentService(db).revokeDevice('user-1', 'dev-9');
    expect(runs.some(r => /UPDATE\s+app_devices\s+SET\s+revoked_at/i.test(r.sql))).toBe(true);
    expect(runs.some(r => /app_push_tokens.*enabled\s*=\s*FALSE/is.test(r.sql))).toBe(true);
  });
});

// ── requireApproved gate ────────────────────────────────────────────────

function approvalDb(opts: { deviceRow: boolean; activeOrg: boolean }): {
  db: DatabaseAdapter; deviceSql: string[];
} {
  const deviceSql: string[] = [];
  const db = {
    get: async (sql: string) => {
      if (/app_devices/.test(sql)) {
        deviceSql.push(sql);
        return opts.deviceRow ? { x: 1 } : null;
      }
      if (/connected_user_orgs/.test(sql)) return opts.activeOrg ? { x: 1 } : null;
      return null;
    },
  } as unknown as DatabaseAdapter;
  return { db, deviceSql };
}

function runGate(db: DatabaseAdapter) {
  const req = { appUser: { id: 'user-1' } } as never;
  const res = {
    statusCode: 0,
    status(c: number) { this.statusCode = c; return this; },
    json() { return this; },
  };
  const next = vi.fn();
  return createApprovedUserCheck(db)(req, res as never, next as never)
    .then(() => ({ res, next }));
}

describe('requireApproved does not accept a revoked device', () => {
  it('scopes its app_devices lookup to non-revoked rows', async () => {
    const { db, deviceSql } = approvalDb({ deviceRow: true, activeOrg: false });
    await runGate(db);
    expect(deviceSql[0]).toMatch(/revoked_at\s+IS\s+NULL/i);
  });

  it('403s a user whose only device is revoked and who has no org', async () => {
    // deviceRow:false models the DB answering the now-correctly-scoped query.
    const { db } = approvalDb({ deviceRow: false, activeOrg: false });
    const { res, next } = await runGate(db);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it('still admits a user with a live device', async () => {
    const { db } = approvalDb({ deviceRow: true, activeOrg: false });
    const { next } = await runGate(db);
    expect(next).toHaveBeenCalled();
  });
});

// ── app-auth middleware ─────────────────────────────────────────────────

function authDb(session: { device_id: string | null }, device: { revoked_at: string | null } | null): DatabaseAdapter {
  return {
    get: async (sql: string) => {
      if (/FROM app_session_tokens/i.test(sql)) {
        return {
          connected_user_id: 'user-1',
          expires_at: new Date(Date.now() + 86_400_000).toISOString(),
          device_id: session.device_id,
        };
      }
      if (/FROM app_devices/i.test(sql)) return device;
      if (/connected_users/i.test(sql)) {
        return { id: 'user-1', contact_hash: 'h', display_name: 'D', public_key: null, status: 'active' };
      }
      return null;
    },
    run: async () => ({ changes: 1 }),
    all: async () => [],
  } as unknown as DatabaseAdapter;
}

function runAuth(db: DatabaseAdapter) {
  const req = { headers: { 'x-app-session': 'tok' } } as never;
  const res = {
    statusCode: 0,
    status(c: number) { this.statusCode = c; return this; },
    json() { return this; },
  };
  const next = vi.fn();
  return createAppAuthMiddleware(db)(req, res as never, next as never)
    .then(() => ({ res, next }));
}

describe('app-auth refuses a session whose device was unpaired', () => {
  it('401s when the session device is revoked', async () => {
    const { res, next } = await runAuth(authDb({ device_id: 'dev-9' }, { revoked_at: '2026-07-25T00:00:00Z' }));
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('401s when the session device row is gone entirely', async () => {
    const { res, next } = await runAuth(authDb({ device_id: 'dev-9' }, null));
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('admits a session whose device is still paired', async () => {
    const { next } = await runAuth(authDb({ device_id: 'dev-9' }, { revoked_at: null }));
    expect(next).toHaveBeenCalled();
  });

  it('admits a pre-migration session with no device_id rather than locking it out', async () => {
    // A NULL device_id is unattributable, not suspicious — failing these closed
    // would sign out every existing user the moment the migration lands. They
    // are cleaned up by revokeDevice() and by their own 30-day TTL.
    const { next } = await runAuth(authDb({ device_id: null }, null));
    expect(next).toHaveBeenCalled();
  });
});
