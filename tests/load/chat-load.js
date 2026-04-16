/**
 * k6 Load Test — Chat Message Send/Receive
 *
 * Simulates users sending messages concurrently.
 *
 * Run:
 *   k6 run tests/load/chat-load.js \
 *     -e SESSION_COOKIE=<nc_session_value> \
 *     -e CONVERSATION_ID=<id> \
 *     -e BASE_URL=http://localhost:3000
 */

import { check, sleep } from 'k6';
import http from 'k6/http';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const SESSION_COOKIE = __ENV.SESSION_COOKIE || '';
const CONVERSATION_ID = __ENV.CONVERSATION_ID || '1';

export const options = {
	vus: 20,
	duration: '60s',
	thresholds: {
		http_req_duration: ['p(95)<1500'],
		http_req_failed: ['rate<0.02'],
	},
};

export default function () {
	const url = `${BASE_URL}/api/chat/conversations/${CONVERSATION_ID}/messages`;
	const payload = JSON.stringify({ body: `رسالة اختبار ${Date.now()}` });

	const res = http.post(url, payload, {
		headers: {
			Cookie: `nc_session=${SESSION_COOKIE}`,
			'Content-Type': 'application/json',
		},
	});

	check(res, {
		'Message sent successfully': (r) => r.status === 200 || r.status === 201,
	});

	sleep(1);
}
