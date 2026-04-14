/**
 * Load Test Auth Utility
 *
 * Provides session cookie acquisition for k6 load tests.
 * This app uses server-side sessions (cookie-based), not JWT.
 *
 * Usage in k6 scenarios:
 *   import { getSessionCookie } from '../utils/auth.js';
 *   export function setup() {
 *     return { cookie: getSessionCookie('dev@example.com', 'password') };
 *   }
 */

import http from 'k6/http';
import { check } from 'k6';

const BASE = __ENV.BASE_URL || 'http://localhost:5173';

/**
 * Performs a login via the SvelteKit form action and returns
 * the raw Set-Cookie header value for nc_session.
 *
 * @param {string} identifier  email / username / phone
 * @param {string} password
 * @returns {string}  Cookie header string, e.g. "nc_session=abc123; Path=/; HttpOnly"
 */
export function getSessionCookie(identifier, password) {
	const res = http.post(
		`${BASE}/login`,
		{ identifier, password },
		{
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			redirects: 0 // Capture the Set-Cookie header before following redirect
		}
	);

	const setCookie = res.headers['Set-Cookie'] || '';
	check(res, {
		'login returned a session cookie': () => setCookie.includes('nc_session')
	});

	// Extract cookie value for the Authorization jar
	const match = setCookie.match(/nc_session=([^;]+)/);
	return match ? `nc_session=${match[1]}` : '';
}

/**
 * Returns a headers object containing the session cookie.
 */
export function sessionHeaders(cookie) {
	return {
		Cookie: cookie,
		'Content-Type': 'application/json'
	};
}
