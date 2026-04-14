/**
 * Soak Test — 4 Hours at 50 Concurrent Users
 *
 * Detects memory leaks, connection pool exhaustion, and slow
 * degradation over time. Run overnight before major releases.
 *
 * Run:
 *   k6 run load-tests/scenarios/soak.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { getSessionCookie, sessionHeaders } from '../utils/auth.js';

const errorRate = new Rate('error_rate');
const responseTime = new Trend('response_time_ms');

export const options = {
	stages: [
		{ duration: '5m', target: 50 }, // ramp up
		{ duration: '4h', target: 50 }, // hold for 4 hours — detects leaks
		{ duration: '5m', target: 0 } // ramp down
	],
	thresholds: {
		http_req_duration: ['p(95)<1000'], // slightly relaxed for long-running test
		http_req_failed: ['rate<0.02'], // less than 2% errors over 4 hours
		error_rate: ['rate<0.05']
	}
};

const BASE = __ENV.BASE_URL || 'http://localhost:5173';

export function setup() {
	return { cookie: getSessionCookie('dev@example.com', 'password') };
}

export default function (data) {
	const headers = sessionHeaders(data.cookie);

	group('Soak — supplements', () => {
		const start = Date.now();
		const res = http.get(`${BASE}/api/supplements`, { headers });
		responseTime.add(Date.now() - start);
		const ok = check(res, { 'status < 500': (r) => r.status < 500 });
		errorRate.add(!ok);
	});

	group('Soak — food search', () => {
		const res = http.get(`${BASE}/api/foods/local-search?q=oats`, { headers });
		const ok = check(res, { 'status < 500': (r) => r.status < 500 });
		errorRate.add(!ok);
	});

	group('Soak — page render', () => {
		const res = http.get(`${BASE}/dietitian/recipes`, { headers });
		const ok = check(res, { 'page renders': (r) => r.status === 200 });
		errorRate.add(!ok);
	});

	sleep(2);
}
