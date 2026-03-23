/**
 * app-auth.ts
 * Challenge-response auth middleware for companion app users.
 * Pattern follows FC Gateway auth (server/routes/fc-gateway.ts lines 46-56).
 *
 * SEC: Session tokens are stored as SHA-256 hashes — eliminates timing attacks.
 */

import type { Request, Response, NextFunction } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { hashSessionToken } from '../services/identity.js';

export interface AppUser {
  id: string;
  contactHash: string;
  displayName: string | null;
  publicKey: string | null;
  metadata: Record<string, unknown>;
}

declare global {
  namespace Express {
    interface Request {
      appUser?: AppUser;
    }
  }
}

// ── In-memory sliding window rate limiter ────────────────────────────────────
interface RateWindow {
  timestamps: number[];
}

const rateLimits = new Map<string, RateWindow>();
const MAX_RATE_ENTRIES = 10000; // Cap map size to prevent memory leak
const RATE_LIMIT_PER_MIN = 30;
const RATE_LIMIT_PER_HOUR = 300;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  let window = rateLimits.get(userId);
  if (!window) {
    // Evict oldest entry if at cap
    if (rateLimits.size >= MAX_RATE_ENTRIES) {
      const firstKey = rateLimits.keys().next().value;
      if (firstKey) rateLimits.delete(firstKey);
    }
    window = { timestamps: [] };
    rateLimits.set(userId, window);
  }

  // Prune old entries (older than 1 hour)
  window.timestamps = window.timestamps.filter(t => now - t < 3600000);

  // Check per-minute
  const lastMinute = window.timestamps.filter(t => now - t < 60000);
  if (lastMinute.length >= RATE_LIMIT_PER_MIN) return false;

  // Check per-hour
  if (window.timestamps.length >= RATE_LIMIT_PER_HOUR) return false;

  window.timestamps.push(now);
  return true;
}

// Prune stale entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, window] of rateLimits) {
    window.timestamps = window.timestamps.filter(t => now - t < 3600000);
    if (window.timestamps.length === 0) rateLimits.delete(key);
  }
}, 600000);

// ── Middleware factory ────────────────────────────────────────────────────────

export function createAppAuthMiddleware(db: DatabaseAdapter) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const sessionToken = req.headers['x-app-session'] as string;
    if (!sessionToken) {
      return res.status(401).json({ error: 'Missing x-app-session header' });
    }

    try {
      // SEC: Hash the incoming token and look up by hash — no timing side-channel
      const tokenHash = hashSessionToken(sessionToken);
      const tokenRow = await db.get<{ connected_user_id: string; expires_at: string }>(
        'SELECT connected_user_id, expires_at FROM app_session_tokens WHERE token = $1',
        tokenHash
      );

      if (!tokenRow) {
        return res.status(401).json({ error: 'Invalid or expired session' });
      }

      if (new Date(tokenRow.expires_at) < new Date()) {
        return res.status(401).json({ error: 'Invalid or expired session' });
      }

      // Load user
      const user = await db.get<{
        id: string;
        contact_hash: string;
        display_name: string | null;
        public_key: string | null;
        metadata: string | Record<string, unknown>;
        status: string;
      }>(
        'SELECT id, contact_hash, display_name, public_key, metadata, status FROM connected_users WHERE id = $1',
        tokenRow.connected_user_id
      );

      if (!user || user.status !== 'active') {
        return res.status(403).json({ error: 'Account inactive' });
      }

      // Rate limit check
      if (!checkRateLimit(user.id)) {
        return res.status(429).json({ error: 'Rate limit exceeded' });
      }

      // Attach user to request
      req.appUser = {
        id: user.id,
        contactHash: user.contact_hash,
        displayName: user.display_name,
        publicKey: user.public_key,
        metadata: typeof user.metadata === 'string' ? JSON.parse(user.metadata) : (user.metadata || {}),
      };

      // Update last_seen_at (fire-and-forget)
      db.run(
        'UPDATE connected_users SET last_seen_at = NOW() WHERE id = $1',
        user.id
      ).catch(() => {});

      next();
    } catch (err) {
      console.error('[app-auth] Auth error:', (err as Error).message);
      return res.status(500).json({ error: 'Authentication failed' });
    }
  };
}
