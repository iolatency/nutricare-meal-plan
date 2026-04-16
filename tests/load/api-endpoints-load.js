/**
 * k6 API Endpoints Load Test
 *
 * Exercises multiple API routes to identify bottlenecks.
 *
 * Run:
 *   k6 run tests/load/api-endpoints-load.js \
 *     -e BASE_URL=http://localhost:5173 \
 *     -e SESSION_COOKIE=<nc_session_value>
 */

import { check, sleep, group } from 'k6';
import http from 'k6/http';
import { Trend, Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5173';
const SESSION_COOKIE = __ENV.SESSION_COOKIE || '';

const foodSearchDuration = new Trend('food_search_duration');
const supplementsDuration = new Trend('supplements_duration');
const chatDuration = new Trend('chat_list_duration');
const errorRate = new Rate('error_rate');

export const options = {
	vus: 50,
	duration: '2m',
	thresholds: {
		http_req_duration: ['p(95)<1500'],
		http_req_failed: ['rate<0.02'],
		food_search_duration: ['p(95)<1000'],
		supplements_duration: ['p(95)<800'],
	},
};

export default function () {
	const headers = {
		Cookie: `nc_session=${SESSION_COOKIE}`,
		'Content-Type': 'application/json',
	};

	group('Food Local Search', () => {
		const queries = ['أرز', 'دجاج', 'خبز', 'حليب', 'سلطة'];
		const q = queries[Math.floor(Math.random() * queries.length)];
		const res = http.get(`${BASE_URL}/api/foods/local-search?q=${encodeURIComponent(q)}`, { headers });
		foodSearchDuration.add(res.timings.duration);
		check(res, {
			'food search ok': (r) => r.status < 500,
		});
		errorRate.add(res.status >= 500);
	});

	group('Supplements List', () => {
		const res = http.get(`${BASE_URL}/api/supplements`, { headers });
		supplementsDuration.add(res.timings.duration);
		check(res, {
			'supplements ok': (r) => r.status < 500,
		});
		errorRate.add(res.status >= 500);
	});

	group('Chat Conversations', () => {
		const res = http.get(`${BASE_URL}/api/chat/conversations`, { headers });
		chatDuration.add(res.timings.duration);
		check(res, {
			'chat list ok': (r) => r.status < 500,
		});
		errorRate.add(res.status >= 500);
	});

	group('Patient Sessions', () => {
		const res = http.get(`${BASE_URL}/api/patient/sessions`, { headers });
		check(res, {
			'sessions ok': (r) => r.status < 500,
		});
		errorRate.add(res.status >= 500);
	});

	group('Patient Recipes', () => {
		const res = http.get(`${BASE_URL}/api/patient/recipes`, { headers });
		check(res, {
			'recipes ok': (r) => r.status < 500,
		});
		errorRate.add(res.status >= 500);
	});

	sleep(0.5);
}
