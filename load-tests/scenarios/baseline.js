/**
 * Baseline Load Test — 100 Concurrent Users
 *
 * Simulates 100 concurrent dietitians browsing the app.
 * All requests must complete in < 800ms (p95).
 *
 * Run:
 *   k6 run load-tests/scenarios/baseline.js
 *   k6 run --env BASE_URL=https://your-staging.vercel.app load-tests/scenarios/baseline.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { getSessionCookie, sessionHeaders } from '../utils/auth.js';

const errorRate = new Rate('error_rate');
const loginTime = new Trend('login_duration_ms');
const apiTime = new Trend('api_duration_ms');
const pageTime = new Trend('page_duration_ms');

export const options = {
	stages: [
		{ duration: '30s', target: 20 }, // warm-up: ramp to 20 users
		{ duration: '1m', target: 100 }, // ramp to 100 concurrent users
		{ duration: '2m', target: 100 }, // hold at 100
		{ duration: '30s', target: 0 } // ramp down
	],
	thresholds: {
		http_req_duration: ['p(95)<800'], // 95% of requests under 800ms
		http_req_failed: ['rate<0.01'], // less than 1% failure rate
		error_rate: ['rate<0.05'] // custom error rate under 5%
	}
};

const BASE = __ENV.BASE_URL || 'http://localhost:5173';

export function setup() {
	const start = Date.now();
	const cookie = getSessionCookie('dev@example.com', 'password');
	loginTime.add(Date.now() - start);
	return { cookie };
}

export default function (data) {
	const headers = sessionHeaders(data.cookie);

	// ── Supplements API ──────────────────────────────────────────────────────

	group('Supplements list', () => {
		const start = Date.now();
		const res = http.get(`${BASE}/api/supplements`, { headers });
		apiTime.add(Date.now() - start);

		const ok = check(res, {
			'supplements status 200': (r) => r.status === 200,
			'supplements under 800ms': (r) => r.timings.duration < 800
		});
		errorRate.add(!ok);
	});

	// ── Foods search ─────────────────────────────────────────────────────────

	group('Local food search', () => {
		const start = Date.now();
		const res = http.get(`${BASE}/api/foods/local-search?q=chicken`, { headers });
		apiTime.add(Date.now() - start);

		const ok = check(res, {
			'food search status 200': (r) => r.status === 200,
			'food search under 800ms': (r) => r.timings.duration < 800
		});
		errorRate.add(!ok);
	});

	// ── Chat conversations ───────────────────────────────────────────────────

	group('Chat conversations', () => {
		const start = Date.now();
		const res = http.get(`${BASE}/api/chat/conversations`, { headers });
		apiTime.add(Date.now() - start);

		const ok = check(res, {
			'conversations status 200': (r) => [200, 204].includes(r.status),
			'conversations under 800ms': (r) => r.timings.duration < 800
		});
		errorRate.add(!ok);
	});

	// ── Dietitian page ───────────────────────────────────────────────────────

	group('Dietitian recipes page', () => {
		const start = Date.now();
		const res = http.get(`${BASE}/dietitian/recipes`, { headers });
		pageTime.add(Date.now() - start);

		const ok = check(res, {
			'recipes page status 200': (r) => r.status === 200,
			'recipes page under 1s': (r) => r.timings.duration < 1000
		});
		errorRate.add(!ok);
	});

	sleep(1);
}

export function teardown(_data) {
	console.log('Baseline load test complete.');
}
