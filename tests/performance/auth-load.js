import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const USERNAME = __ENV.USERNAME || 'admin';
const PASSWORD = __ENV.PASSWORD || 'password';

export const options = {
  stages: [
    { duration: '1m', target: 20 },
    { duration: '3m', target: 20 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{endpoint:login}': ['p(95)<1000'],
  },
};

export default function () {
  // Login
  const loginRes = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ username: USERNAME, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' }, tags: { endpoint: 'login' } }
  );

  const loggedIn = check(loginRes, { 'login 200': (r) => r.status === 200 });
  if (!loggedIn) { sleep(1); return; }

  const token = loginRes.json('token');
  const authHeaders = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  };

  // Authenticated requests
  http.get(`${BASE_URL}/api/sessions`, authHeaders);
  http.get(`${BASE_URL}/api/analytics/overview`, authHeaders);

  sleep(2);
}
