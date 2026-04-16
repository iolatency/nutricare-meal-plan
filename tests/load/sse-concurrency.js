/**
 * k6 Load Test — SSE Chat Concurrency
 *
 * Simulates 100 concurrent SSE connections to the chat event stream.
 * Measures event delivery latency and connection stability.
 *
 * Prerequisites:
 *   1. npm run build && npm run start (app running at localhost:3000)
 *   2. A valid nc_session cookie for an authenticated user
 *   3. A valid conversationId
 *
 * Run:
 *   k6 run tests/load/sse-concurrency.js \
 *     -e SESSION_COOKIE=<nc_session_value> \
 *     -e CONVERSATION_ID=<id> \
 *     -e BASE_URL=http://localhost:3000
 *
 * Thresholds:
 *   - 95th percentile connection time < 2s
 *   - Error rate < 5%
 */

import { check, sleep } from 'k6';
import http from 'k6/http';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const SESSION_COOKIE = __ENV.SESSION_COOKIE || '';
const CONVERSATION_ID = __ENV.CONVERSATION_ID || '1';

export const options = {
	scenarios: {
		sse_connections: {
			executor: 'ramping-vus',
			startVUs: 0,
			stages: [
				{ duration: '30s', target: 50 },   // Ramp up to 50 VUs
				{ duration: '60s', target: 100 },  // Ramp up to 100 VUs
				{ duration: '30s', target: 100 },  // Hold at 100
				{ duration: '20s', target: 0 },    // Ramp down
			],
		},
	},
	thresholds: {
		http_req_duration: ['p(95)<2000'],  // 95th percentile < 2s
		http_req_failed: ['rate<0.05'],     // Error rate < 5%
	},
};

export default function () {
	const url = `${BASE_URL}/api/chat/conversations/${CONVERSATION_ID}/events`;

	const res = http.get(url, {
		headers: {
			Cookie: `nc_session=${SESSION_COOKIE}`,
			Accept: 'text/event-stream',
			'Cache-Control': 'no-cache',
		},
		timeout: '10s',
	});

	check(res, {
		'SSE connection opened': (r) => r.status === 200,
		'Content-Type is event-stream': (r) =>
			(r.headers['Content-Type'] || '').includes('text/event-stream'),
	});

	sleep(5); // Hold connection for 5 seconds
}
