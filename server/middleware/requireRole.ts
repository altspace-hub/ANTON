import { Request, Response, NextFunction } from 'express';

/**
 * E4: RBAC middleware — restrict routes to specific role(s).
 * Usage: router.get('/admin/users', requireRole('admin'), handler)
 *
 * Role hierarchy (highest first): admin > analyst > viewer > user
 *
 * ⚠ NOT THE GUARD THE APPLICATION USES, AND NOT IMPORTED ANYWHERE (verified 2026-09).
 * Every route imports the hierarchical `requireRole` from role-guards.ts instead. This
 * file's exact-match version being here and correct is precisely why the live one's
 * fail-open bug survived a review: two implementations, one read, the other running.
 * Change role-guards.ts, not this. Deleting this file is safe whenever someone is
 * confident enough to do it.
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({ error: 'Unauthenticated' });
      return;
    }
    if (!roles.includes(user.role || 'user')) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}
