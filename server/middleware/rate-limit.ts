import rateLimit from 'express-rate-limit';
import type { Request } from 'express';
import type { AuthUser } from './auth.js';

// General API rate limiter — 100 requests per 15 minutes per IP
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { error: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Authentication endpoints — strict rate limiting to prevent brute force
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 login attempts per 15 minutes
  message: { error: 'Too many login attempts. Please try again later.' },
  skipSuccessfulRequests: true, // Don't count successful logins toward limit
  standardHeaders: true,
  legacyHeaders: false,
});

// Per-user rate limiter on every /api request (falls back to IP when there is no user).
//
// Sized for the web client, not for a hand-written API caller: one module page
// load makes ~48 requests, the home page ~30, Settings ~60. The old ceiling of
// 100/min refused ordinary navigation by the fifth page, and a refused boot
// crashed pages and sent module runs to the API key (2026-09-22 Work QA).
// Model calls keep their own, much tighter claudeLimiter.
const DEFAULT_API_REQUESTS_PER_MIN = 1200;
function apiRequestsPerMinute(): number {
  const n = Number(process.env.API_RATE_LIMIT_PER_MIN);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_API_REQUESTS_PER_MIN;
}

// Using user ID prevents shared-office IP starvation where all colleagues share one NAT IP.
// validate: false suppresses ERR_ERL_KEY_GEN_IPV6 (express-rate-limit v8 static analysis
// fires for any keyGenerator that references req.ip, even when IPv6 is handled correctly).
export const userLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: apiRequestsPerMinute(),
  validate: false,
  keyGenerator: (req: Request) => {
    const user = (req as Request & { user?: AuthUser }).user;
    // Normalize IPv4-mapped IPv6 (::ffff:127.0.0.1 → 127.0.0.1)
    const ip = (req.ip ?? 'unknown').replace(/^::ffff:/i, '');
    return user?.id ?? ip;
  },
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Public inbound webhook endpoint — prevents event flooding
export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120, // 120 events/min per IP (2/sec burst)
  message: { error: 'Webhook rate limit exceeded.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// P2P message receive — prevent flood attacks on public endpoint
export const p2pLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 messages per minute per IP (1/sec sustained)
  message: { error: 'P2P rate limit exceeded. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Claude API endpoints — prevent accidental loops and excessive usage
export const claudeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60,
  message: { error: 'Too many Claude API requests. Please wait before sending another.' },
  standardHeaders: true,
  legacyHeaders: false,
});
