import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import type { DatabaseAdapter } from '../db/database.js';
import { SOLO_USER_ID } from './user-constants.js';
import { isUserRole } from './role-guards.js';
import { isDemoMode } from './demo-mode.js';

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
// The .env.example placeholder, and anything short enough to guess, signs every
// session token — server/index.ts refuses to start team mode with one. Solo mode
// issues no tokens. (Checked at start-up rather than here, at import, so a test
// that imports this module in team mode is not refused its short test secret.)
const PLACEHOLDER_JWT_SECRETS = new Set(['change-me-in-production', 'dev-secret', 'changeme', 'secret']);
export function jwtSecretProblem(secret: string | undefined, teamMode: boolean): string | null {
  if (!teamMode || !secret) return null;
  if (PLACEHOLDER_JWT_SECRETS.has(secret) || secret.length < 32) {
    return '[auth] FATAL: DEPLOYMENT_MODE=team with a placeholder or short JWT_SECRET. '
      + `Generate one with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`;
  }
  return null;
}

/**
 * How long a sign-in lasts — the JWT and its user_sessions row alike.
 * JWT_EXPIRY takes 30m / 8h / 7d or plain seconds; it was documented in
 * .env.example but never read, so every session lasted seven days.
 */
const DEFAULT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
let warnedExpiry: string | null = null;
export function sessionTtlMs(value: string | undefined = process.env.JWT_EXPIRY): number {
  const m = /^\s*(\d+)\s*([smhd]?)\s*$/i.exec(value ?? '');
  if (!m) {
    if (value && value.trim() && warnedExpiry !== value) {
      warnedExpiry = value;
      console.warn(`[auth] JWT_EXPIRY=${JSON.stringify(value)} is not a duration ANTON reads (30m, 8h, 7d or seconds) — sessions last 7 days`);
    }
    return DEFAULT_SESSION_TTL_MS;
  }
  const n = Number(m[1]);
  const unit = (m[2] || 's').toLowerCase();
  const ms = n * ({ s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 } as Record<string, number>)[unit];
  return ms > 0 ? ms : DEFAULT_SESSION_TTL_MS;
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

/**
 * Report an unrecognised users.role once per account, then treat it as 'viewer'.
 * Warned once rather than per request: this runs on every authenticated call, and a
 * per-request line would bury the one message an operator needs to see. Only the user
 * id and the offending role literal are logged — no username, no token.
 */
const warnedUnknownRole = new Set<string>();

/**
 * The account half of every session check, as SQL on `users u`: a switched-off
 * account, and a demo account (migration 289) past its expiry, have no live
 * session. Pair it with sessionEndedOutsideDemo() on the row's demo_expires_at.
 */
export const LIVE_ACCOUNT_SQL = 'u.disabled_at IS NULL AND (u.demo_expires_at IS NULL OR u.demo_expires_at > NOW())';

/**
 * A demo account has no session on a server that is not a demo — the rule
 * sign-in already applies (routes/auth.ts). Without it, a visitor still signed
 * in when the owner restarted without DEMO_MODE kept a full analyst session
 * with no route allowlist, and retention no longer ran to delete them.
 */
export function sessionEndedOutsideDemo(demoExpiresAt: unknown): boolean {
  return demoExpiresAt !== null && demoExpiresAt !== undefined && !isDemoMode();
}

function floorUnknownRole(userId: string, role: string | null): 'viewer' {
  if (!warnedUnknownRole.has(userId)) {
    warnedUnknownRole.add(userId);
    console.warn(
      `[auth] user ${userId} has unrecognised role ${JSON.stringify(role)} — treating as 'viewer'. ` +
      `Set it to viewer, analyst or admin via PATCH /api/admin/users/${userId}.`,
    );
  }
  return 'viewer';
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
      //
      // u.role is read live for that same reason and a sharper one. It used to come
      // from payload.role — the value baked into the token at login — so PATCH
      // /api/admin/users/:id {role:'viewer'} demoted a compromised or departed admin
      // in the users table while their existing 7-day token still said 'admin' on
      // every request. They could re-promote themselves before it expired. Deletion
      // was always immediate (user_sessions cascades); demotion was not. This column
      // rides along on the join that was already happening, so it costs no extra query.
      //
      // u.disabled_at rides on the same join: switching an account off must end
      // the sessions it already holds, not only refuse the next sign-in. So does
      // u.demo_expires_at (migration 289): a public-demo account ends when it
      // expires, whatever its sessions say — and on a server that is no longer
      // a demo, like sign-in.
      const session = await db.get<{ role: string | null; school_role: string | null; demo_expires_at: unknown }>(
        `SELECT u.role, u.school_role, u.demo_expires_at
           FROM user_sessions s
           JOIN users u ON u.id = s.user_id
          WHERE s.token = ? AND s.expires_at > NOW() AND ${LIVE_ACCOUNT_SQL}`,
        token,
      );
      if (!session || sessionEndedOutsideDemo(session.demo_expires_at)) {
        res.status(401).json({ error: 'Session expired — please log in again' });
        return;
      }
      // Update last_seen
      await db.run('UPDATE user_sessions SET last_seen = CURRENT_TIMESTAMP WHERE token = ?', token);
      req.user = {
        id: payload.id,
        username: payload.username,
        // A role the codebase does not know is not a privilege level — it is an
        // unprovisioned account (users.role has no CHECK constraint, and the API took
        // any string until 2026-09). Floor it at 'viewer' rather than passing it
        // through: requireRole now fails closed on an unknown role, so passing it
        // through would lock the account out of everything, and a lockout is a worse
        // outcome than least privilege for what is usually an admin's typo.
        role: isUserRole(session.role) ? session.role : floorUnknownRole(payload.id, session.role),
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
  // jwtid makes every token unique. Two sign-ins of one person in the same second
  // (same payload, same iat) produced the same token, and the second session row
  // collided with the first on user_sessions' primary key — the sign-in failed.
  return jwt.sign(user, JWT_SECRET!, { expiresIn: Math.floor(sessionTtlMs() / 1000), jwtid: randomUUID() });
}

// requireAuth / requireAdmin / requireAdminOrSolo now live in role-guards.ts and are
// re-exported above — one definition, importable without this file's JWT_SECRET throw.
