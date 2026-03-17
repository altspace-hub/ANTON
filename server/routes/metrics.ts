/**
 * metrics.ts
 * OBS-03: Prometheus-format /metrics endpoint.
 *
 * Exposes process-level counters as plain text in the Prometheus exposition format.
 * Mount at /metrics (outside /api, no auth — suitable for local scraping by Prometheus
 * or compatible tools like Grafana Alloy).
 *
 * To enable in production, set METRICS_ENABLED=true in .env.
 * By default the endpoint is only exposed when running locally.
 */

import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';

import { getActiveStreams } from './health.js';

// ── In-process counters (reset on restart) ────────────────────
let _totalRequests = 0;
let _totalErrors = 0;
let _totalClaudeCalls = 0;
let _totalCacheHits = 0;
let _totalCacheCreations = 0;

export function incrementRequests(): void      { _totalRequests++; }
export function incrementErrors(): void        { _totalErrors++; }
export function incrementClaudeCalls(): void   { _totalClaudeCalls++; }
export function incrementCacheHits(n: number): void      { _totalCacheHits += n; }
export function incrementCacheCreations(n: number): void { _totalCacheCreations += n; }

function gauge(name: string, help: string, value: number): string {
  return `# HELP ${name} ${help}\n# TYPE ${name} gauge\n${name} ${value}\n`;
}

function counter(name: string, help: string, value: number): string {
  return `# HELP ${name} ${help}\n# TYPE ${name} counter\n${name}_total ${value}\n`;
}

export async function createMetricsRouter(db: DatabaseAdapter) {
  const router = Router();

  router.get('/metrics', async (req, res) => {
    // Require explicit opt-in in non-local environments to avoid accidental exposure
    const enabled = process.env.METRICS_ENABLED === 'true' ||
      req.socket.remoteAddress === '127.0.0.1' ||
      req.socket.remoteAddress === '::1';

    if (!enabled) {
      res.status(403).end('Metrics endpoint disabled. Set METRICS_ENABLED=true to enable.');
      return;
    }

    // DB stats
    let dbQueueDepth = 0;
    let auditLogTotal = 0;
    try {
      const q = await db.get("SELECT COUNT(*) as c FROM workflow_executions WHERE status IN ('pending','running')") as { c: number } | undefined;
      dbQueueDepth = q?.c ?? 0;
    } catch { /* table may not exist */ }
    try {
      const a = await db.get('SELECT COUNT(*) as c FROM audit_log') as { c: number } | undefined;
      auditLogTotal = a?.c ?? 0;
    } catch { /* table may not exist */ }

    // Memory
    const mem = process.memoryUsage();

    const lines = [
      counter('openexpert_http_requests',      'Total HTTP requests served',                    _totalRequests),
      counter('openexpert_http_errors',         'Total HTTP 5xx errors',                        _totalErrors),
      counter('openexpert_claude_calls',        'Total Claude API stream calls initiated',      _totalClaudeCalls),
      counter('openexpert_cache_hit_tokens',    'Total prompt cache read tokens (cache hits)',  _totalCacheHits),
      counter('openexpert_cache_write_tokens',  'Total prompt cache write tokens',              _totalCacheCreations),
      gauge('openexpert_active_streams',        'Currently active SSE streams',                 getActiveStreams()),
      gauge('openexpert_workflow_queue_depth',  'Pending + running workflow executions',        dbQueueDepth),
      gauge('openexpert_audit_log_total',       'Total entries in audit_log table',             auditLogTotal),
      gauge('openexpert_process_uptime_seconds','Server uptime in seconds',                     process.uptime()),
      gauge('openexpert_heap_used_bytes',       'Node.js heap used bytes',                      mem.heapUsed),
      gauge('openexpert_heap_total_bytes',      'Node.js heap total bytes',                     mem.heapTotal),
      gauge('openexpert_rss_bytes',             'Node.js RSS (resident set size) bytes',        mem.rss),
    ].join('\n');

    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(lines);
  });

  return router;
}
