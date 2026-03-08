/**
 * TEST-06: Load test suite for openEXPERT API
 *
 * Tests: 10 / 50 / 100 concurrent users across key endpoints.
 * Measures p95 latency and error rate per scenario.
 *
 * Usage:
 *   k6 run tests/load/k6-load-test.js
 *   k6 run --vus 50 --duration 60s tests/load/k6-load-test.js
 *   k6 run --env TARGET_URL=http://localhost:3001 tests/load/k6-load-test.js
 *
 * Thresholds:
 *   - p95 latency < 2000ms for health/metadata endpoints
 *   - p95 latency < 5000ms for sessions/modules endpoints
 *   - Error rate < 1%
 *
 * Prerequisites: k6 installed — https://k6.io/docs/getting-started/installation/
 *   Windows: winget install k6 --source winget
 */

import http from 'k6/http';
import { sleep, check } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// ── Configuration ──────────────────────────────────────────────

const TARGET_URL = __ENV.TARGET_URL || 'http://localhost:3001';
const TEST_TOKEN  = __ENV.TEST_TOKEN  || '';  // JWT token for authenticated endpoints

// Custom metrics
const authFailures    = new Counter('auth_failures');
const apiErrors       = new Counter('api_errors');
const errorRate       = new Rate('error_rate');
const sessionLatency  = new Trend('session_latency', true);
const healthLatency   = new Trend('health_latency', true);
const searchLatency   = new Trend('search_latency', true);

// ── Test scenarios ─────────────────────────────────────────────

export const options = {
  scenarios: {
    // Smoke test: 10 VUs for 30s — baseline check
    smoke: {
      executor: 'constant-vus',
      vus: 10,
      duration: '30s',
      tags: { scenario: 'smoke' },
    },
    // Load test: ramp up to 50 VUs over 1 min, hold 3 min, ramp down
    load: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '1m', target: 50 },
        { duration: '3m', target: 50 },
        { duration: '30s', target: 0 },
      ],
      tags: { scenario: 'load' },
      startTime: '35s', // Start after smoke finishes
    },
    // Stress test: spike to 100 VUs
    stress: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '30s', target: 100 },
        { duration: '1m',  target: 100 },
        { duration: '30s', target: 0  },
      ],
      tags: { scenario: 'stress' },
      startTime: '5m30s', // Start after load test
    },
  },
  thresholds: {
    // P95 latency targets
    'health_latency{scenario:smoke}':     ['p(95)<500'],
    'health_latency{scenario:load}':      ['p(95)<1000'],
    'health_latency{scenario:stress}':    ['p(95)<2000'],
    'session_latency{scenario:smoke}':    ['p(95)<1000'],
    'session_latency{scenario:load}':     ['p(95)<2000'],
    'session_latency{scenario:stress}':   ['p(95)<5000'],
    'search_latency{scenario:smoke}':     ['p(95)<800'],
    'search_latency{scenario:load}':      ['p(95)<2000'],
    // Error rate
    http_req_failed:  ['rate<0.01'],   // <1% HTTP errors
    error_rate:       ['rate<0.01'],
    auth_failures:    ['count<5'],
  },
};

// ── Auth helper ────────────────────────────────────────────────

function authHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (TEST_TOKEN) headers['Authorization'] = `Bearer ${TEST_TOKEN}`;
  return headers;
}

// ── Scenario: health check ─────────────────────────────────────

function testHealth() {
  const res = http.get(`${TARGET_URL}/api/health`, { tags: { endpoint: 'health' } });
  const ok = check(res, {
    'health: status 200': (r) => r.status === 200,
    'health: has status field': (r) => {
      try { return JSON.parse(r.body).status !== undefined; } catch { return false; }
    },
  });
  healthLatency.add(res.timings.duration);
  if (!ok) { errorRate.add(1); apiErrors.add(1); } else { errorRate.add(0); }
}

// ── Scenario: session listing ──────────────────────────────────

function testSessions() {
  const res = http.get(`${TARGET_URL}/api/sessions?limit=10`, {
    headers: authHeaders(),
    tags: { endpoint: 'sessions' },
  });
  const ok = check(res, {
    'sessions: status 200 or 401': (r) => r.status === 200 || r.status === 401,
    'sessions: body is JSON': (r) => { try { JSON.parse(r.body); return true; } catch { return false; } },
  });
  if (res.status === 401) authFailures.add(1);
  sessionLatency.add(res.timings.duration);
  errorRate.add(ok ? 0 : 1);
  if (!ok) apiErrors.add(1);
}

// ── Scenario: module listing ───────────────────────────────────

function testModules() {
  const res = http.get(`${TARGET_URL}/api/modules`, {
    headers: authHeaders(),
    tags: { endpoint: 'modules' },
  });
  check(res, {
    'modules: status is 200 or 401': (r) => r.status === 200 || r.status === 401,
  });
  if (res.status >= 500) { errorRate.add(1); apiErrors.add(1); } else errorRate.add(0);
}

// ── Scenario: OpenAPI spec ─────────────────────────────────────

function testOpenApi() {
  const res = http.get(`${TARGET_URL}/api/openapi.json`, {
    headers: authHeaders(),
    tags: { endpoint: 'openapi' },
  });
  check(res, {
    'openapi: status 200': (r) => r.status === 200,
    'openapi: has openapi field': (r) => {
      try { return JSON.parse(r.body).openapi !== undefined; } catch { return false; }
    },
  });
  errorRate.add(res.status === 200 ? 0 : 1);
}

// ── Scenario: CSRF token ───────────────────────────────────────

function testCsrfToken() {
  const res = http.get(`${TARGET_URL}/api/csrf-token`, {
    headers: authHeaders(),
    tags: { endpoint: 'csrf' },
  });
  check(res, {
    'csrf: status 200': (r) => r.status === 200,
    'csrf: has csrfToken': (r) => {
      try { return typeof JSON.parse(r.body).csrfToken === 'string'; } catch { return false; }
    },
  });
  errorRate.add(res.status === 200 ? 0 : 1);
}

// ── Scenario: knowledge graph stats ───────────────────────────

function testKnowledgeGraphStats() {
  const res = http.get(`${TARGET_URL}/api/knowledge-graph/analytics/stats`, {
    headers: authHeaders(),
    tags: { endpoint: 'kg-stats' },
  });
  check(res, {
    'kg-stats: not 500': (r) => r.status !== 500,
  });
  searchLatency.add(res.timings.duration);
  errorRate.add(res.status >= 500 ? 1 : 0);
}

// ── Main VU function ───────────────────────────────────────────

export default function () {
  // Rotate through scenarios based on VU ID to distribute load
  const vu = __VU % 6;

  switch (vu) {
    case 0: testHealth(); break;
    case 1: testSessions(); break;
    case 2: testModules(); break;
    case 3: testOpenApi(); break;
    case 4: testCsrfToken(); break;
    case 5: testKnowledgeGraphStats(); break;
  }

  // Random think time between requests (1-3 seconds)
  sleep(1 + Math.random() * 2);
}

// ── Summary output ─────────────────────────────────────────────

export function handleSummary(data) {
  const summary = {
    timestamp: new Date().toISOString(),
    thresholds_passed: Object.values(data.metrics)
      .filter(m => m.thresholds)
      .every(m => Object.values(m.thresholds).every(t => !t.ok === false)),
    p95_health_ms:   data.metrics['health_latency']?.values?.['p(95)'] ?? null,
    p95_session_ms:  data.metrics['session_latency']?.values?.['p(95)'] ?? null,
    p95_search_ms:   data.metrics['search_latency']?.values?.['p(95)'] ?? null,
    error_rate:      data.metrics['error_rate']?.values?.rate ?? null,
    auth_failures:   data.metrics['auth_failures']?.values?.count ?? 0,
    total_requests:  data.metrics['http_reqs']?.values?.count ?? 0,
    duration_s:      data.state?.testRunDurationMs / 1000 ?? null,
  };

  console.log('\n=== LOAD TEST SUMMARY ===');
  console.log(JSON.stringify(summary, null, 2));

  return {
    stdout: JSON.stringify(summary, null, 2),
    'tests/load/results.json': JSON.stringify(data, null, 2),
  };
}
