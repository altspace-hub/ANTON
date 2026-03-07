import rateLimit from 'express-rate-limit';
import type { Request } from 'express';

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

// Per-user rate limiter — 100 requests per minute per IP
// Note: Uses default IP-based limiting (handles IPv6 properly)
export const userLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // Increased from 10 to handle dashboard with multiple API calls
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

// Claude API endpoints — prevent accidental loops and excessive usage
export const claudeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60,
  message: { error: 'Too many Claude API requests. Please wait before sending another.' },
  standardHeaders: true,
  legacyHeaders: false,
});
