import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { DatabaseAdapter } from '../db/database.js';


const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error(
    '[auth] FATAL: JWT_SECRET environment variable is not set. ' +
    'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))" ' +
    'and add it to your .env file.'
  );
}
const IS_TEAM_MODE = process.env.DEPLOYMENT_MODE === 'team';

export interface AuthUser {
  id: string;
  username: string;
  role: 'admin' | 'analyst' | 'viewer';
  display_name?: string;
  school_role?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function createAuthMiddleware(db: Database) {
  return async function authMiddleware(req: Request, res: Response, next: NextFunction) {
    // Solo mode: no auth required
    if (!IS_TEAM_MODE) {
      req.user = { id: 'solo', username: 'solo', role: 'admin' };
      return next();
    }

    // SEC-05: Accept token from httpOnly cookie (preferred) or Authorization header (legacy fallback)
    const cookieToken = req.cookies?.['openexpert_session'];
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const rawToken = cookieToken || bearerToken;

    if (!rawToken) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    try {
      const token = rawToken;
      const payload = jwt.verify(token, JWT_SECRET!) as AuthUser & { exp: number };
      // Check token still in DB (allows logout to work)
      const session = await db.get('SELECT * FROM user_sessions WHERE token = ? AND expires_at > datetime("now")', token);
      if (!session) {
        res.status(401).json({ error: 'Session expired — please log in again' });
        return;
      }
      // Update last_seen
      await db.run('UPDATE user_sessions SET last_seen = CURRENT_TIMESTAMP WHERE token = ?', token);
      req.user = {
        id: payload.id,
        username: payload.username,
        role: payload.role,
        display_name: payload.display_name,
        school_role: payload.school_role,
      };
      next();
    } catch {
      res.status(401).json({ error: 'Invalid token' });
    }
  };
}

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

export function generateToken(user: AuthUser): string {
  return jwt.sign(user, JWT_SECRET!, { expiresIn: '7d' });
}

// Convenience middleware — requires authentication (any role)
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  next();
}

// Convenience middleware — requires admin role
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
 * Middleware: Require admin role OR solo user mode.
 * Used for features that should be admin-only in team mode,
 * but accessible to everyone in solo/single-user mode.
 */
export function requireAdminOrSolo(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const isAdmin = req.user.role === 'admin';
  const isSoloMode = !IS_TEAM_MODE;

  if (isAdmin || isSoloMode) {
    next();
  } else {
    res.status(403).json({ error: 'Admin access required' });
  }
}
