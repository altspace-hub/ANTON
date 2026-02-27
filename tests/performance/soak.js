import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const responseTimeTrend = new Trend('response_time_trend');

export const options = {
  vus: 20,
  duration: '30m',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<2000'],
    response_time_trend: ['p(90)<1500'],
  },
};

export default function () {
  group('read-only endpoints', () => {
    let start = Date.now();

    http.get(`${BASE_URL}/api/config`);
    http.get(`${BASE_URL}/api/sessions`);
    http.get(`${BASE_URL}/api/analytics/overview`);

    responseTimeTrend.add(Date.now() - start);
  });

  group('analytics', () => {
    const res = http.get(`${BASE_URL}/api/analytics/sessions-over-time?days=7`);
    check(res, { 'analytics ok': (r) => r.status === 200 });
  });

  sleep(Math.random() * 3 + 2); // 2-5s think time
}
