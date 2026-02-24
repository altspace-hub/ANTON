import { Request, Response, NextFunction } from 'express';

/**
 * E4: RBAC middleware — restrict routes to specific role(s).
 * Usage: router.get('/admin/users', requireRole('admin'), handler)
 *
 * Role hierarchy (highest first): admin > analyst > viewer > user
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
