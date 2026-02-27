import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';

export const options = {
  vus: 1,
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<3000'],
  },
};

export default function () {
  // Health / config
  let res = http.get(`${BASE_URL}/api/config`);
  check(res, { 'config 200': (r) => r.status === 200 });

  // Sessions list
  res = http.get(`${BASE_URL}/api/sessions`);
  check(res, { 'sessions 200': (r) => r.status === 200 });

  // Analytics overview
  res = http.get(`${BASE_URL}/api/analytics/overview`);
  check(res, { 'analytics 200': (r) => r.status === 200 });

  // Module list
  res = http.get(`${BASE_URL}/api/modules`);
  check(res, { 'modules 200': (r) => r.status === 200 });

  sleep(1);
}
