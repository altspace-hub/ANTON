import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';

export const options = {
  stages: [
    { duration: '2m', target: 50 },   // Ramp up
    { duration: '5m', target: 50 },   // Hold
    { duration: '1m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],    // <1% errors
    http_req_duration: ['p(95)<2000'], // p95 under 2s
    'http_req_duration{endpoint:analytics}': ['p(95)<1000'],
    'http_req_duration{endpoint:sessions}': ['p(95)<500'],
  },
};

export default function () {
  // GET /api/config
  let res = http.get(`${BASE_URL}/api/config`);
  check(res, { 'config ok': (r) => r.status === 200 });

  // GET /api/sessions (tagged for threshold)
  res = http.get(`${BASE_URL}/api/sessions`, { tags: { endpoint: 'sessions' } });
  check(res, { 'sessions ok': (r) => r.status === 200 });

  // GET /api/analytics/overview (tagged)
  res = http.get(`${BASE_URL}/api/analytics/overview`, { tags: { endpoint: 'analytics' } });
  check(res, { 'analytics ok': (r) => r.status === 200 });

  // GET /api/analytics/sessions-over-time
  res = http.get(`${BASE_URL}/api/analytics/sessions-over-time?days=30`);
  check(res, { 'sessions-over-time ok': (r) => r.status === 200 });

  // GET /api/skills/community
  res = http.get(`${BASE_URL}/api/skills/community`);
  check(res, { 'community skills ok': (r) => r.status === 200 });

  sleep(Math.random() * 2 + 1); // 1-3s think time
}
