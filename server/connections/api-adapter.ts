/**
 * api-adapter.ts
 * Make outbound HTTP calls through registered API connections.
 * Enforces endpoint whitelist, rate limits, and timeouts.
 */

import type { Connection } from '../services/connection-manager.js';
import type { ConnectionManager } from '../services/connection-manager.js';

export interface ApiCallResult {
  status: number;
  data: unknown;
  headers: Record<string, string>;
  responseTimeMs: number;
}

interface AllowedEndpoint {
  method: string;
  path: string; // may contain wildcards like /api/*
}

// Simple in-memory rate-limiter (per connection ID)
const rateLimitWindows: Map<string, { count: number; windowStart: number }> = new Map();

function checkRateLimit(connectionId: string, rateLimit: number): void {
  if (!rateLimit || rateLimit <= 0) return; // unlimited
  const now = Date.now();
  const window = rateLimitWindows.get(connectionId);

  if (!window || now - window.windowStart > 60_000) {
    // Start a new 1-minute window
    rateLimitWindows.set(connectionId, { count: 1, windowStart: now });
    return;
  }

  if (window.count >= rateLimit) {
    throw new Error(`Rate limit exceeded: max ${rateLimit} requests/minute for this connection`);
  }

  window.count += 1;
}

function matchEndpoint(allowedEndpoints: AllowedEndpoint[], method: string, path: string): boolean {
  if (!allowedEndpoints || allowedEndpoints.length === 0) return false;

  return allowedEndpoints.some((rule) => {
    const methodMatch = rule.method === '*' || rule.method.toUpperCase() === method.toUpperCase();
    if (!methodMatch) return false;

    // Wildcard path matching
    if (rule.path === '*') return true;
    if (rule.path.endsWith('/*')) {
      const prefix = rule.path.slice(0, -2);
      return path.startsWith(prefix);
    }
    return rule.path === path;
  });
}

function buildAuthHeaders(
  authType: string,
  authValue: string
): Record<string, string> {
  if (!authType || !authValue) return {};
  if (authType === 'bearer') return { Authorization: `Bearer ${authValue}` };
  if (authType === 'basic') return { Authorization: `Basic ${authValue}` };
  if (authType === 'apikey') return { 'X-API-Key': authValue };
  return {};
}

export async function callEndpoint(
  connection: Connection,
  manager: ConnectionManager,
  method: string,
  path: string,
  body?: unknown,
  queryParams?: Record<string, string>,
  executedBy: string = 'system'
): Promise<ApiCallResult> {
  const cfg = connection.config as Record<string, unknown>;
  const baseUrl = (cfg.base_url as string | undefined)?.replace(/\/$/, '');
  if (!baseUrl) throw new Error('API connection is missing base_url');

  const allowedEndpoints = (cfg.allowed_endpoints as AllowedEndpoint[] | undefined) ?? [];
  if (!matchEndpoint(allowedEndpoints, method, path)) {
    throw new Error(
      `Endpoint "${method} ${path}" is not in the allowed_endpoints whitelist for this connection.`
    );
  }

  const rateLimit = (cfg.rate_limit as number | undefined) ?? 0;
  checkRateLimit(connection.id, rateLimit);

  const timeoutSeconds = (cfg.timeout_seconds as number | undefined) ?? 30;
  const authType = (cfg.auth_type as string | undefined) ?? '';
  const authValue = (cfg.auth_value as string | undefined) ?? '';

  // Build full URL
  let fullUrl = `${baseUrl}${path}`;
  if (queryParams && Object.keys(queryParams).length > 0) {
    fullUrl += '?' + new URLSearchParams(queryParams).toString();
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutSeconds * 1000);

  const startMs = Date.now();

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...buildAuthHeaders(authType, authValue),
    };

    const fetchOptions: RequestInit = {
      method: method.toUpperCase(),
      headers,
      signal: controller.signal,
    };

    if (body !== undefined && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(fullUrl, fetchOptions);
    const responseTimeMs = Date.now() - startMs;

    let data: unknown;
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((val, key) => { responseHeaders[key] = val; });

    const result: ApiCallResult = {
      status: response.status,
      data,
      headers: responseHeaders,
      responseTimeMs,
    };

    manager.logAction(
      connection.id,
      null,
      'api_call',
      { method, path, status: response.status, responseTimeMs },
      `HTTP ${response.status} in ${responseTimeMs}ms`,
      executedBy
    );

    return result;
  } catch (err) {
    const responseTimeMs = Date.now() - startMs;
    const errorMsg = err instanceof Error ? err.message : String(err);

    manager.logAction(
      connection.id,
      null,
      'api_call_error',
      { method, path, error: errorMsg, responseTimeMs },
      'FAILED',
      executedBy
    );

    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
