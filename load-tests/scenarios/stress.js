/**
 * Stress Test — Spike to 300 Users
 *
 * Tests system behaviour under stress. Accepts slightly looser thresholds
 * than baseline (p99 < 2s, up to 5% errors).
 *
 * Run:
 *   k6 run load-tests/scenarios/stress.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate } from 'k6/metrics';
import { getSessionCookie, sessionHeaders } from '../utils/auth.js';

const errorRate = new Rate('error_rate');

export const options = {
  stages: [
    { duration: '30s', target: 100 },   // warm-up
    { duration: '1m',  target: 200 },   // ramp to 200
    { duration: '30s', target: 300 },   // spike to 300
    { duration: '1m',  target: 300 },   // hold stress level
    { duration: '30s', target: 0   },   // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(99)<2000'],   // 99% of requests under 2s under stress
    http_req_failed:   ['rate<0.05'],    // allow up to 5% errors under stress
    error_rate:        ['rate<0.10'],
  },
};

const BASE = __ENV.BASE_URL || 'http://localhost:5173';

export function setup() {
  return { cookie: getSessionCookie('dev@example.com', 'password') };
}

export default function (data) {
  const headers = sessionHeaders(data.cookie);

  group('Supplements under stress', () => {
    const res = http.get(`${BASE}/api/supplements`, { headers });
    const ok = check(res, {
      'supplements alive under stress': (r) => r.status < 500,
    });
    errorRate.add(!ok);
  });

  group('Food search under stress', () => {
    const res = http.get(`${BASE}/api/foods/local-search?q=rice`, { headers });
    const ok = check(res, {
      'food search alive under stress': (r) => r.status < 500,
    });
    errorRate.add(!ok);
  });

  group('Login page under stress', () => {
    const res = http.get(`${BASE}/login`);
    const ok = check(res, {
      'login page alive under stress': (r) => r.status === 200,
    });
    errorRate.add(!ok);
  });

  sleep(0.5);
}
