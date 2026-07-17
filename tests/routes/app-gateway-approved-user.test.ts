import { describe, it, expect, vi } from 'vitest';
import { createApprovedUserCheck } from '../../server/routes/app-gateway.js';
import type { DatabaseAdapter } from '../../server/db/database.js';

/**
 * Enforcement matrix for the 2026-07-17 requireApprovedUser gate on the org-less
 * but sensitive app-gateway routes (agent queries, agent data, markets, radar).
 *
 * A bare app session is not enough — the user must be OPERATOR-APPROVED:
 *   - has a paired device (admin "Connect a device" enrollment ritual), OR
 *   - holds an active org membership.
 * Self-registered users (open registration) have neither → 403.
 */

/** Fake db whose get() answers the device / org lookups by SQL substring. */
function fakeDb(opts: { device: boolean; activeOrg: boolean }): DatabaseAdapter {
  return {
    get: async (sql: string) => {
      if (/app_devices/.test(sql)) return opts.device ? { x: 1 } : null;
      if (/connected_user_orgs/.test(sql)) return opts.activeOrg ? { x: 1 } : null;
      return null;
    },
  } as unknown as DatabaseAdapter;
}

function run(db: DatabaseAdapter, appUser: { id: string } | undefined) {
  const req = { appUser } as never;
  const res = { statusCode: 0, body: undefined as unknown, status(c: number) { this.statusCode = c; return this; }, json(b: unknown) { this.body = b; return this; } };
  const next = vi.fn();
  const mw = createApprovedUserCheck(db);
  return mw(req, res as never, next as never).then(() => ({ res, next }));
}

describe('requireApprovedUser enforcement matrix', () => {
  it('401 when there is no app user', async () => {
    const { res, next } = await run(fakeDb({ device: false, activeOrg: false }), undefined);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('allows a user with a paired device (enrolled)', async () => {
    const { res, next } = await run(fakeDb({ device: true, activeOrg: false }), { id: 'u1' });
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(0);
  });

  it('allows a user with an active org membership', async () => {
    const { res, next } = await run(fakeDb({ device: false, activeOrg: true }), { id: 'u2' });
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(0);
  });

  it('403s a self-registered user (no device, no org)', async () => {
    const { res, next } = await run(fakeDb({ device: false, activeOrg: false }), { id: 'u3' });
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(String((res.body as { error?: string })?.error)).toMatch(/not approved/i);
  });

  it('device OR org is enough — either alone passes, neither fails', async () => {
    for (const c of [{ device: true, activeOrg: true }, { device: true, activeOrg: false }, { device: false, activeOrg: true }]) {
      const { next } = await run(fakeDb(c), { id: 'u' });
      expect(next).toHaveBeenCalledOnce();
    }
  });

  it('APP_GATEWAY_REQUIRE_APPROVAL=false makes it a pass-through (escape hatch)', async () => {
    const prev = process.env.APP_GATEWAY_REQUIRE_APPROVAL;
    process.env.APP_GATEWAY_REQUIRE_APPROVAL = 'false';
    try {
      // Even a bare self-registered user passes when the gate is disabled.
      const { res, next } = await run(fakeDb({ device: false, activeOrg: false }), { id: 'u3' });
      expect(next).toHaveBeenCalledOnce();
      expect(res.statusCode).toBe(0);
    } finally {
      if (prev === undefined) delete process.env.APP_GATEWAY_REQUIRE_APPROVAL;
      else process.env.APP_GATEWAY_REQUIRE_APPROVAL = prev;
    }
  });
});
