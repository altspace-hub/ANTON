import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';

export const options = {
  stages: [
    { duration: '2m', target: 50 },
    { duration: '2m', target: 100 },
    { duration: '2m', target: 150 },
    { duration: '2m', target: 200 },
    { duration: '5m', target: 200 },  // Peak load
    { duration: '3m', target: 0 },    // Recovery
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],    // Allow up to 5% errors under stress
    http_req_duration: ['p(99)<5000'], // p99 under 5s
  },
};

export default function () {
  const urls = [
    `${BASE_URL}/api/config`,
    `${BASE_URL}/api/sessions`,
    `${BASE_URL}/api/analytics/overview`,
    `${BASE_URL}/api/modules`,
  ];

  const url = urls[Math.floor(Math.random() * urls.length)];
  const res = http.get(url);
  check(res, { 'status 200': (r) => r.status === 200 });
  sleep(0.5);
}
