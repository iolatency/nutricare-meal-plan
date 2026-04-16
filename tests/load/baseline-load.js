/**
 * k6 Baseline Load Test — 100 concurrent users
 *
 * Simulates normal traffic: login page load + authenticated API requests.
 *
 * Run:
 *   k6 run tests/load/baseline-load.js \
 *     -e BASE_URL=http://localhost:5173 \
 *     -e SESSION_COOKIE=<nc_session_value>
 */

import { check, sleep, group } from 'k6';
import http from 'k6/http';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5173';
const SESSION_COOKIE = __ENV.SESSION_COOKIE || '';

const errorRate = new Rate('error_rate');
const loginPageDuration = new Trend('login_page_duration');

export const options = {
	stages: [
		{ duration: '30s', target: 20 },
		{ duration: '1m', target: 100 },
		{ duration: '2m', target: 100 },
		{ duration: '30s', target: 0 },
	],
	thresholds: {
		http_req_duration: ['p(95)<800'],
		http_req_failed: ['rate<0.01'],
		error_rate: ['rate<0.05'],
	},
};

export default function () {
	const headers = {
		Cookie: `nc_session=${SESSION_COOKIE}`,
	};

	group('Login page load', () => {
		const res = http.get(`${BASE_URL}/login`);
		loginPageDuration.add(res.timings.duration);
		check(res, {
			'login page status 200': (r) => r.status === 200,
			'login page under 800ms': (r) => r.timings.duration < 800,
		});
		errorRate.add(res.status !== 200);
	});

	group('Supplements API', () => {
		const res = http.get(`${BASE_URL}/api/supplements`, { headers });
		check(res, {
			'supplements status ok': (r) => r.status === 200 || r.status === 401 || r.status === 302,
		});
		errorRate.add(r => r.status >= 500);
	});

	group('Food search', () => {
		const res = http.get(`${BASE_URL}/api/foods/local-search?q=أرز`, { headers });
		check(res, {
			'food search status ok': (r) => r.status === 200 || r.status === 401 || r.status === 302,
			'food search under 1s': (r) => r.timings.duration < 1000,
		});
	});

	sleep(1);
}
