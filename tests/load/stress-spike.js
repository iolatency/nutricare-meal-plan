/**
 * k6 Stress Spike Test — 300 concurrent users
 *
 * Simulates traffic spikes to test system resilience.
 *
 * Run:
 *   k6 run tests/load/stress-spike.js \
 *     -e BASE_URL=http://localhost:5173 \
 *     -e SESSION_COOKIE=<nc_session_value>
 */

import { check, sleep, group } from 'k6';
import http from 'k6/http';
import { Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5173';
const SESSION_COOKIE = __ENV.SESSION_COOKIE || '';

const errorRate = new Rate('error_rate');

export const options = {
	stages: [
		{ duration: '30s', target: 100 },
		{ duration: '1m', target: 200 },
		{ duration: '30s', target: 300 },
		{ duration: '1m', target: 300 },
		{ duration: '30s', target: 0 },
	],
	thresholds: {
		http_req_duration: ['p(99)<2000'],
		http_req_failed: ['rate<0.05'],
	},
};

export default function () {
	const headers = {
		Cookie: `nc_session=${SESSION_COOKIE}`,
		'Content-Type': 'application/json',
	};

	group('Login page under stress', () => {
		const res = http.get(`${BASE_URL}/login`);
		check(res, {
			'login page loads': (r) => r.status === 200,
		});
		errorRate.add(res.status !== 200);
	});

	group('API under stress', () => {
		const res = http.get(`${BASE_URL}/api/supplements`, { headers });
		check(res, {
			'API responds': (r) => r.status < 500,
		});
		errorRate.add(res.status >= 500);
	});

	group('Food search under stress', () => {
		const res = http.get(`${BASE_URL}/api/foods/local-search?q=دجاج`, { headers });
		check(res, {
			'food search responds': (r) => r.status < 500,
		});
	});

	sleep(0.5);
}
