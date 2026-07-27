/**
 * role-guards.test.ts — the authorisation guards, after being split out of auth.ts.
 *
 * The split was not cosmetic: auth.ts throws at module load when JWT_SECRET is unset,
 * so importing a guard from there dragged that requirement into every module that
 * imported you. That broke pure service tests, and would have crashed a solo install
 * without JWT_SECRET on a path that never touches a token. These guards need no JWT —
 * only req.user and DEPLOYMENT_MODE.
 *
 * The property that matters most is the asymmetry of requireAdminOrSolo: it must be a
 * no-op on a single-user laptop and a real block on a shared install. Getting that
 * backwards either locks every solo user out of their own settings, or leaves the
 * shared install wide open.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { requireAdminOrSolo, requireAdmin, requireAuth, isTeamMode } from '../../server/middleware/role-guards.js';

function ctx(user?: { id: string; username: string; role: string }) {
  const req = { user } as unknown as Request;
  const json = vi.fn();
  const res = { status: vi.fn(() => ({ json })), json } as unknown as Response;
  const next = vi.fn() as unknown as NextFunction;
  return { req, res, next, json };
}

const ADMIN = { id: 'a', username: 'admin', role: 'admin' };
const VIEWER = { id: 'v', username: 'viewer', role: 'viewer' };
const SOLO = { id: 'solo', username: 'solo', role: 'admin' };

let original: string | undefined;
beforeEach(() => { original = process.env.DEPLOYMENT_MODE; });
afterEach(() => {
  if (original === undefined) delete process.env.DEPLOYMENT_MODE;
  else process.env.DEPLOYMENT_MODE = original;
});

describe('importing the guards does not require JWT_SECRET', () => {
  it('is importable and callable with no token machinery involved', () => {
    // If this module ever re-acquires an auth.ts import, this file stops loading —
    // which is the regression the split exists to prevent.
    expect(typeof requireAdminOrSolo).toBe('function');
    expect(typeof isTeamMode).toBe('function');
  });
});

describe('requireAdminOrSolo', () => {
  it('passes any user in solo mode — a laptop owner is not locked out of settings', () => {
    process.env.DEPLOYMENT_MODE = 'solo';
    const { req, res, next } = ctx(SOLO);
    requireAdminOrSolo(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('passes even a viewer in solo mode', () => {
    process.env.DEPLOYMENT_MODE = 'solo';
    const { req, res, next } = ctx(VIEWER);
    requireAdminOrSolo(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('BLOCKS a viewer in team mode — the shared-install case this exists for', () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const { req, res, next } = ctx(VIEWER);
    requireAdminOrSolo(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('passes an admin in team mode', () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const { req, res, next } = ctx(ADMIN);
    requireAdminOrSolo(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('401s when no user is stamped at all', () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const { req, res, next } = ctx(undefined);
    requireAdminOrSolo(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('reads DEPLOYMENT_MODE lazily, not at module load', () => {
    // index.ts resolves the mode during its module body, which can run after this
    // module is first imported — a snapshot would report the wrong mode forever.
    process.env.DEPLOYMENT_MODE = 'solo';
    expect(isTeamMode()).toBe(false);
    process.env.DEPLOYMENT_MODE = 'team';
    expect(isTeamMode()).toBe(true);
  });

  it('treats any unset/unknown mode as solo, matching index.ts\'s default', () => {
    delete process.env.DEPLOYMENT_MODE;
    expect(isTeamMode()).toBe(false);
  });
});

describe('requireAdmin is strict in every mode', () => {
  it('blocks a viewer even in solo mode', () => {
    process.env.DEPLOYMENT_MODE = 'solo';
    const { req, res, next } = ctx(VIEWER);
    requireAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('requireAuth', () => {
  it('passes any stamped user and rejects none', () => {
    const ok = ctx(VIEWER);
    requireAuth(ok.req, ok.res, ok.next);
    expect(ok.next).toHaveBeenCalled();

    const bad = ctx(undefined);
    requireAuth(bad.req, bad.res, bad.next);
    expect(bad.res.status).toHaveBeenCalledWith(401);
  });
});
