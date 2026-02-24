import type { Request, Response, NextFunction } from 'express';
import type Database from 'better-sqlite3';

/**
 * Audit Middleware
 *
 * Automatically logs all API requests for compliance and debugging.
 * Captures: method, path, status, duration, user, IP address
 */

interface AuditRequestLog {
  user_id?: string;
  endpoint: string;
  method: string;
  status_code: number;
  response_time_ms: number;
  request_size_bytes?: number;
  response_size_bytes?: number;
  ip_address?: string;
  user_agent?: string;
}

/**
 * Get client IP address from request
 */
function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return typeof forwarded === 'string' ? forwarded.split(',')[0] : forwarded[0];
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/**
 * Get request size in bytes
 */
function getRequestSize(req: Request): number {
  const contentLength = req.headers['content-length'];
  return contentLength ? parseInt(contentLength) : 0;
}

/**
 * Create audit middleware
 */
export function createAuditMiddleware(db: Database.Database) {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();

    // Skip logging for health checks and static assets
    if (
      req.path === '/api/health' ||
      req.path.startsWith('/assets/') ||
      req.path.startsWith('/public/')
    ) {
      next();
      return;
    }

    // Capture original end function
    const originalEnd = res.end.bind(res);
    let responseSize = 0;

    // Override res.end to capture response size
    // @ts-ignore - Complex overload signatures
    res.end = function (...args: unknown[]) {
      const chunk = args[0];
      if (chunk) {
        responseSize = Buffer.isBuffer(chunk)
          ? chunk.length
          : Buffer.byteLength(String(chunk));
      }

      // Call original end with all arguments
      return (originalEnd as (...a: unknown[]) => unknown)(...args);
    };

    // Log when response is finished
    res.on('finish', () => {
      try {
        const duration = Date.now() - startTime;
        const logEntry: AuditRequestLog = {
          user_id: (req as unknown as { user?: { id: string } }).user?.id,
          endpoint: req.path,
          method: req.method,
          status_code: res.statusCode,
          response_time_ms: duration,
          request_size_bytes: getRequestSize(req),
          response_size_bytes: responseSize,
          ip_address: getClientIp(req),
          user_agent: req.headers['user-agent'] || 'unknown',
        };

        // Insert into api_requests table
        db.prepare(`
          INSERT INTO api_requests (
            user_id, endpoint, method, status_code, response_time_ms,
            request_size_bytes, response_size_bytes, ip_address, user_agent
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          logEntry.user_id || null,
          logEntry.endpoint,
          logEntry.method,
          logEntry.status_code,
          logEntry.response_time_ms,
          logEntry.request_size_bytes || 0,
          logEntry.response_size_bytes || 0,
          logEntry.ip_address,
          logEntry.user_agent
        );

        // Log slow requests (> 5 seconds)
        if (duration > 5000) {
          console.warn(`[Audit] Slow request: ${req.method} ${req.path} - ${duration}ms`);
        }

        // Log errors (4xx, 5xx)
        if (res.statusCode >= 400) {
          console.warn(
            `[Audit] Error response: ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`
          );
        }
      } catch (error) {
        console.error('[Audit Middleware] Failed to log request:', error);
      }
    });

    next();
  };
}

/**
 * Rate limiting helper for expensive queries
 * Tracks request counts per user/IP
 */
export function createRateLimiter(
  db: Database.Database,
  windowMs: number = 60000, // 1 minute
  maxRequests: number = 100
) {
  const requestCounts = new Map<string, { count: number; resetAt: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = (req as unknown as { user?: { id: string } }).user?.id || getClientIp(req);
    const now = Date.now();

    const record = requestCounts.get(key);
    if (record && record.resetAt > now) {
      if (record.count >= maxRequests) {
        // Log rate limit event
        try {
          db.prepare(`
            INSERT INTO security_events (event_type, user_id, ip_address, details, severity)
            VALUES (?, ?, ?, ?, ?)
          `).run(
            'rate_limit',
            (req as unknown as { user?: { id: string } }).user?.id || null,
            getClientIp(req),
            `Exceeded ${maxRequests} requests in ${windowMs}ms`,
            'medium'
          );
        } catch (error) {
          console.error('[Rate Limiter] Failed to log rate limit event:', error);
        }

        res.status(429).json({
          error: 'Too many requests',
          retryAfter: Math.ceil((record.resetAt - now) / 1000),
        });
        return;
      }
      record.count++;
    } else {
      requestCounts.set(key, { count: 1, resetAt: now + windowMs });
    }

    // Clean up expired entries
    if (Math.random() < 0.01) {
      // 1% chance to clean up
      const keysToDelete: string[] = [];
      requestCounts.forEach((v, k) => {
        if (v.resetAt <= now) {
          keysToDelete.push(k);
        }
      });
      keysToDelete.forEach(k => requestCounts.delete(k));
    }

    next();
  };
}

console.log('[Audit Middleware] Initialized');
