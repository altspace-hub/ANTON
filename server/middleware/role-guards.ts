/**
 * role-guards.ts — side-effect-free authorisation middleware.
 *
 * Split out of auth.ts for the same reason user-constants.ts was: auth.ts THROWS at
 * module load when JWT_SECRET is unset, so importing it drags that requirement into
 * the import graph of whatever imports you. That is fine for index.ts and the auth
 * routes; it is not fine for a route module like custom-model-endpoints.ts, which is
 * itself imported by services (context-budget.ts) — importing auth there made pure
 * service tests fail to load, and would make a solo install without JWT_SECRET crash
 * on a code path that never touches a token.
 *
 * None of these guards need JWT. They read `req.user` (stamped by authMiddleware,
 * including in solo mode where it is a synthetic admin) and DEPLOYMENT_MODE. Keeping
 * them here means a module can enforce authorisation without taking on authentication's
 * boot requirements.
 *
 * auth.ts re-exports all of these, so existing
 * `import { requireAdmin } from '../middleware/auth.js'` call sites are unaffected.
 */
import type { Request, Response, NextFunction } from 'express';

/** Read lazily — index.ts resolves DEPLOYMENT_MODE during its module body, which can
 *  run AFTER this module is first imported. A module-scope const would snapshot the
 *  pre-resolution value and silently report the wrong mode. */
export const isTeamMode = (): boolean => process.env.DEPLOYMENT_MODE === 'team';

export function requireRole(role: 'admin' | 'analyst' | 'viewer') {
  const ROLE_LEVELS: Record<string, number> = { viewer: 0, analyst: 1, admin: 2 };
  return function (req: Request, res: Response, next: NextFunction) {
    if (!req.user) { res.status(401).json({ error: 'Not authenticated' }); return; }
    if (ROLE_LEVELS[req.user.role] < ROLE_LEVELS[role]) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}

/** Requires authentication (any role). */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  next();
}

/** Requires the admin role, in every deployment mode. */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (req.user.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

/**
 * Admin in team mode; anyone in solo mode.
 *
 * The right guard for instance-wide configuration: on a single-user laptop the owner
 * is the only user and authMiddleware stamps them role:'admin' anyway, so this is a
 * no-op there. On a shared install it stops a `viewer` from repointing the default
 * model or overwriting the org's provider keys.
 */
export function requireAdminOrSolo(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const isAdmin = req.user.role === 'admin';
  const isSoloMode = !isTeamMode();

  if (isAdmin || isSoloMode) {
    next();
  } else {
    res.status(403).json({ error: 'Admin access required' });
  }
}
