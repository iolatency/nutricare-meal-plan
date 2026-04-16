/**
 * k6 Load Test — Meal Tracking
 *
 * Simulates patients updating meal status concurrently.
 *
 * Run:
 *   k6 run tests/load/meal-tracking-load.js \
 *     -e SESSION_COOKIE=<nc_session_value> \
 *     -e SESSION_ID=<meal_plan_session_id> \
 *     -e BASE_URL=http://localhost:3000
 */

import { check, sleep } from 'k6';
import http from 'k6/http';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const SESSION_COOKIE = __ENV.SESSION_COOKIE || '';
const SESSION_ID = __ENV.SESSION_ID || '1';

export const options = {
	vus: 30,
	duration: '60s',
	thresholds: {
		http_req_duration: ['p(95)<1000'],
		http_req_failed: ['rate<0.02'],
	},
};

export default function () {
	// Simulate fetching the dashboard
	const dashRes = http.get(`${BASE_URL}/patient/dashboard/${SESSION_ID}`, {
		headers: { Cookie: `nc_session=${SESSION_COOKIE}` },
	});

	check(dashRes, {
		'Dashboard loads': (r) => r.status === 200,
	});

	sleep(2);
}
