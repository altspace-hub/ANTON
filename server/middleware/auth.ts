import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { DatabaseAdapter } from '../db/database.js';
import { SOLO_USER_ID } from './user-constants.js';

// Re-export so existing `import { SOLO_USER_ID } from '../middleware/auth.js'` keeps
// working; the value itself lives in the side-effect-free user-constants module.
export { SOLO_USER_ID };


const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error(
    '[auth] FATAL: JWT_SECRET environment variable is not set. ' +
    'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))" ' +
    'and add it to your .env file.'
  );
}
// Read lazily: this module is imported (and would otherwise snapshot the env) BEFORE
// index.ts's module body finishes resolving DEPLOYMENT_MODE, so a module-scope const
// here silently disables team-mode auth enforcement (the 2026-07-17 split-brain bug).
const isTeamMode = () => process.env.DEPLOYMENT_MODE === 'team';

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

export async function createAuthMiddleware(db: DatabaseAdapter) {
  return async function authMiddleware(req: Request, res: Response, next: NextFunction) {
    // Solo mode: no auth required
    if (!isTeamMode()) {
      // school_role is read from the DB, not invented, so a solo operator can put
      // themselves in the pupil view to see what a child sees. NULL means "not set",
      // and the single operator who owns the instance gets the full role — otherwise
      // /school/admin/* answered 403 to the only person on the machine.
      const solo = await db.get<{ school_role: string | null }>(
        'SELECT school_role FROM users WHERE id = ?', SOLO_USER_ID,
      ).catch(() => null);
      req.user = {
        id: SOLO_USER_ID, username: 'solo', role: 'admin',
        school_role: solo?.school_role ?? 'school_admin',
      };
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
      // Check token still in DB (allows logout to work), and pick up school_role in the
      // SAME query — a join, not a second round trip.
      //
      // school_role deliberately does NOT come from the JWT payload, even though the
      // type allows it. Two reasons, and the first is decisive:
      //
      //   1. Solo mode issues no token at all, so a JWT-carried role would leave the
      //      School pillar permanently role-less in ANTON's DEFAULT deployment.
      //   2. Tokens last 7 days. Promoting somebody to teacher mid-term must not wait
      //      for them to log out — a school adding a teacher on Monday cannot be told
      //      they can teach on the following Monday.
      //
      // routes/friends.ts already reads this column live for the same reason.
      const session = await db.get<{ school_role: string | null }>(
        `SELECT u.school_role
           FROM user_sessions s
           JOIN users u ON u.id = s.user_id
          WHERE s.token = ? AND s.expires_at > NOW()`,
        token,
      );
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
        school_role: session.school_role ?? undefined,
      };
      next();
    } catch {
      res.status(401).json({ error: 'Invalid token' });
    }
  };
}

// The role guards live in role-guards.ts — they need no JWT, and keeping them here
// meant any module enforcing authorisation also inherited this file's module-load
// JWT_SECRET throw. Re-exported so existing import sites are unaffected.
export {
  requireRole, requireAuth, requireAdmin, requireAdminOrSolo,
} from './role-guards.js';

export function generateToken(user: AuthUser): string {
  return jwt.sign(user, JWT_SECRET!, { expiresIn: '7d' });
}

// requireAuth / requireAdmin / requireAdminOrSolo now live in role-guards.ts and are
// re-exported above — one definition, importable without this file's JWT_SECRET throw.
